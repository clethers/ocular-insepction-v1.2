#!/usr/bin/env python3
"""
One-time import of Customer Care's lead-tracking spreadsheet into the
sales_leads table. Run manually, once, from the repo root:

    python scripts/import_sales_leads.py

Safe to re-run: upserts on legacy_row_id.

Requires: pip install openpyxl

WARNING: This script writes directly to the live Supabase project
configured in .env (via VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) —
a REAL production database. Do not run this casually or in automated
pipelines. Run it deliberately, once, by a human who has confirmed the
sales_leads migration (Task 1) has been applied to that project and
who understands this will POST up to ~306 real customer records
(names, phone numbers, emails, addresses) into it. Rows with no
determinable pipeline stage (blank spacer/section-header rows in the
sheet) are skipped; see build_row() below.

DUPLICATE legacy_row_id PAIRS IN SOURCE DATA:
The source spreadsheet contains 3 pairs of rows sharing the same
legacy_row_id. A single-statement Postgres upsert can't actually apply
"last row wins" the way an earlier version of this docstring claimed —
an ON CONFLICT DO UPDATE that targets the same conflict key twice in one
command is a hard Postgres error, so the WHOLE batch would abort with
zero rows imported, not silently drop just the duplicates. This script
now deduplicates by legacy_row_id itself before sending anything (keeping
the last occurrence in sheet order), so the batch no longer aborts — but
the pairs below still need a human decision, since deduplication silently
picks a winner rather than merging or flagging the loss:

  - INSTCOM_1570123: rows 126 and 260 (both "Mark Angelo Fermo")
    Likely a genuine duplicate entry.
  - INSTCOM_1569031: rows 222 and 256 (both "Vic Lacaya")
    Likely a genuine duplicate entry.
  - INSTCOM_1562106: rows 253 and 263 (different customers: Emie Dy
    vs. Johannson Lester Lim)
    REAL DATA LOSS — one of two different customers will not be
    imported; the de-dup keeps only row 263 (the later row), Emie Dy's
    row 253 is silently dropped.

DUPLICATE rn_no PAIRS IN SOURCE DATA:
sales_leads.rn_no is also DB-UNIQUE, but is NOT this script's upsert
conflict target (legacy_row_id is) — so two rows sharing a non-null
rn_no in the same batch would violate that unique constraint and abort
the whole upsert, same failure mode as the legacy_row_id collisions
above. Unlike legacy_row_id, this script does NOT guess a winner for an
rn_no collision on its own — main() pre-flight-checks for one and exits
before calling upsert() at all, since picking one of two different real
customers to silently drop needs a human decision, not a script default.

RESOLVED collision in the current source data:

  - RN127471968: rows 144 ("Rince Hicban", Status "Installation
    Canceled") and 145 ("Rene Escalante", Status "Initial Customer
    Contact") — two different real customers sharing one RN number in
    the source sheet, almost certainly a copy-paste mistake rather than
    a legitimate shared reservation. Human decision (confirmed): row
    144 (Hicban, already canceled) keeps its legacy id and imports
    normally but with rn_no cleared — see ROWS_WITH_RN_CLEARED below —
    since row 145 (Escalante, an active ongoing lead) is the one that
    actually needs RN127471968 going forward. Hicban's imported record
    carries a remarks note explaining the RN was removed and why.

RECOMMENDATION: Before running this script, either:
  (a) Disambiguate the source spreadsheet by fixing the duplicate ids
      and RNs, or
  (b) Accept and explicitly document which of the colliding rows you want
      to keep (especially critical for rows 253/263 and 144/145, where
      they are different real people).
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime

import openpyxl

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX_PATH = os.path.join(REPO_ROOT, "srcs", "TESLA INTERNAL DATABASE (1) 1.xlsx")
ENV_PATH = os.path.join(REPO_ROOT, ".env")

# Row 144 (Rince Hicban, INSTCOM_1562984) shares rn_no RN127471968 with
# row 145 (Rene Escalante, INSTCOM_1562975) — a copy-paste mistake in the
# source sheet, not two people who legitimately share a reservation
# number. Human decision (confirmed): since Hicban's deal is already
# "Installation Canceled", his row keeps its legacy id and imports
# normally, just without the RN — Escalante (an active, ongoing lead)
# keeps RN127471968. Both imported records get a remarks note about it,
# not just the one that lost the RN.
#
# row_num -> (rn_no in question, whether this row keeps it, the other row's
# name, for a readable note on both sides of the pair).
RN_DUPLICATE_RESOLUTIONS = {
    144: ("RN127471968", False, "Rene Escalante (row 145)"),
    145: ("RN127471968", True, "Rince Hicban (row 144)"),
}

# Positional column map (1-indexed, matches the sheet's fixed layout).
COL_LEGACY_ID = 1
COL_RN_NO = 2
COL_FIRST_NAME = 3
COL_LAST_NAME = 4
COL_CONTACT_NO = 5
COL_ADDRESS = 6
COL_EMAIL = 7
COL_MODE = 8
COL_STATUS = 9
COL_REMARKS = 26

# (checkbox column, date column, sales_leads column) triples, in pipeline
# order — this is also the "furthest True wins" order used to derive a
# stage for the 3 rows with a blank Status.
STAGE_PAIRS = [
    (10, 11, "INITIAL_CONTACT", "stage_initial_contact_at"),
    (12, 13, "SITE_VISIT_SCHEDULED", "stage_site_visit_scheduled_at"),
    (14, 15, "SITE_VISIT_COMPLETED", "stage_site_visit_completed_at"),
    (16, 17, "QUOTE_SENT", "stage_quote_sent_at"),
    (18, 19, "QUOTE_ACCEPTED", "stage_quote_accepted_at"),
    (20, 21, "INSTALLATION_SCHEDULED", "stage_installation_scheduled_at"),
    (22, 23, "INSTALLATION_COMPLETE", "stage_installation_complete_at"),
    (24, 25, "JOB_CHECKOUT_COMPLETE", "stage_job_checkout_complete_at"),
]

STATUS_MAP = {
    "initial customer contact": "INITIAL_CONTACT",
    "site visit scheduled": "SITE_VISIT_SCHEDULED",
    "site visit completed": "SITE_VISIT_COMPLETED",
    "quote sent": "QUOTE_SENT",
    "quote sent to customer": "QUOTE_SENT",
    "accepted": "QUOTE_ACCEPTED",
    "quote accepted": "QUOTE_ACCEPTED",
    "installation scheduled": "INSTALLATION_SCHEDULED",
    "installation complete": "INSTALLATION_COMPLETE",
    "provision completed": "JOB_CHECKOUT_COMPLETE",
    "installation canceled": "CANCELED",
}


def load_env():
    values = {}
    with open(ENV_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            values[key.strip()] = value.strip()
    url = values.get("VITE_SUPABASE_URL")
    key = values.get("VITE_SUPABASE_ANON_KEY")
    if not url or not key:
        sys.exit("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing from .env")
    return url, key


def clean_str(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        value = str(int(value))
    value = str(value).strip()
    return value or None


def clean_date(value):
    if isinstance(value, datetime):
        return value.isoformat()
    return None


def normalize_status(raw):
    if not raw:
        return None
    key = re.sub(r"\s+", " ", raw.strip().lower())
    return STATUS_MAP.get(key)


def build_row(ws, row_num):
    status_raw = ws.cell(row=row_num, column=COL_STATUS).value
    stage = normalize_status(status_raw)

    stamps = {}
    furthest_stage = None
    for checkbox_col, date_col, stage_key, db_col in STAGE_PAIRS:
        checked = ws.cell(row=row_num, column=checkbox_col).value is True
        if checked:
            furthest_stage = stage_key
            stamps[db_col] = clean_date(ws.cell(row=row_num, column=date_col).value)

    # Skip rows with no derivable pipeline stage at all — these are sheet
    # formatting artifacts (blank spacer rows, "3RD QUARTER"-style section
    # header rows), not real leads. A real lead always has either a mapped
    # Status value or at least one checked stage checkbox.
    if not stage and not furthest_stage:
        return None
    if not stage:
        stage = furthest_stage

    # A handful of real rows (with real name/contact/status data) are
    # missing their legacy id in column A. Fall back to a deterministic,
    # row-position-based id so those rows are still imported and remain
    # stable (hence safely re-runnable) across repeated runs.
    legacy_id = clean_str(ws.cell(row=row_num, column=COL_LEGACY_ID).value) or f"ROW_{row_num}"

    original_rn_no = clean_str(ws.cell(row=row_num, column=COL_RN_NO).value)
    resolution = RN_DUPLICATE_RESOLUTIONS.get(row_num)
    rn_no = original_rn_no
    remarks = clean_str(ws.cell(row=row_num, column=COL_REMARKS).value)

    if resolution:
        rn_value, keeps_rn, other_name = resolution
        if keeps_rn:
            rn_no = rn_value
            note = (
                f"[Import note: RN {rn_value} was also entered in the source "
                f"spreadsheet for {other_name}'s record — a duplicate. This RN was "
                f"kept here since this is the active lead; it was removed from "
                f"{other_name}'s record.]"
            )
        else:
            rn_no = None
            note = (
                f"[Import note: RN {rn_value} removed from this record — it was "
                f"duplicated with {other_name}'s record in the source spreadsheet, "
                f"and kept on that record instead.]"
            )
        remarks = f"{remarks}\n{note}" if remarks else note

    payload = {
        "legacy_row_id": legacy_id,
        "rn_no": rn_no,
        "first_name": clean_str(ws.cell(row=row_num, column=COL_FIRST_NAME).value),
        "last_name": clean_str(ws.cell(row=row_num, column=COL_LAST_NAME).value),
        "contact_no": clean_str(ws.cell(row=row_num, column=COL_CONTACT_NO).value),
        "installation_address": clean_str(ws.cell(row=row_num, column=COL_ADDRESS).value),
        "email": clean_str(ws.cell(row=row_num, column=COL_EMAIL).value),
        "mode_of_communication": clean_str(ws.cell(row=row_num, column=COL_MODE).value),
        "remarks": remarks,
        "stage": stage,
        "source_status_raw": clean_str(status_raw),
    }
    # PostgREST's bulk insert requires every row in the batch to carry the
    # identical set of JSON keys (a mismatch is PGRST102 "All object keys
    # must match") — so every stage_*_at column must be present on every
    # row, explicitly None where that stage was never reached, not just
    # omitted. `stamps` only ever contains the columns THIS row's
    # checkboxes set, so seed every column here first, then overlay it.
    for _checkbox_col, _date_col, _stage_key, db_col in STAGE_PAIRS:
        payload[db_col] = None
    payload.update(stamps)
    return payload


def find_duplicate_rn_nos(numbered_rows):
    """Given a list of (row_num, row_dict), returns a dict mapping each
    non-null rn_no shared by more than one row to the list of
    (row_num, row_dict) entries that share it. Empty dict means no
    collisions. Pure/local — no network calls — so it's safe to call
    from tests as well as main()."""
    by_rn_no = {}
    for row_num, row in numbered_rows:
        rn_no = row.get("rn_no")
        if not rn_no:
            continue
        by_rn_no.setdefault(rn_no, []).append((row_num, row))
    return {rn_no: entries for rn_no, entries in by_rn_no.items() if len(entries) > 1}


def upsert(url, key, rows):
    endpoint = f"{url.rstrip('/')}/rest/v1/sales_leads?on_conflict=legacy_row_id"
    body = json.dumps(rows).encode("utf-8")
    req = urllib.request.Request(endpoint, data=body, method="POST")
    req.add_header("apikey", key)
    req.add_header("Authorization", f"Bearer {key}")
    req.add_header("Content-Type", "application/json")
    req.add_header("Prefer", "resolution=merge-duplicates,return=representation")
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        # PostgREST puts the actually-useful diagnostic (which constraint
        # failed, which column, etc.) in the response body — the default
        # traceback from a bare HTTPError swallows that entirely.
        error_body = e.read().decode("utf-8", errors="replace")
        print(f"Upsert failed: HTTP {e.code} {e.reason}", file=sys.stderr)
        print(error_body, file=sys.stderr)
        sys.exit(1)


def main():
    url, key = load_env()
    wb = openpyxl.load_workbook(XLSX_PATH, data_only=True)
    ws = wb["CLIENT DATABASE"]

    numbered_rows = []  # [(row_num, row_dict), ...]
    skipped = 0
    for row_num in range(2, 308):
        row = build_row(ws, row_num)
        if row is None:
            skipped += 1
            continue
        numbered_rows.append((row_num, row))

    print(f"Read {len(numbered_rows)} rows ({skipped} skipped — no derivable stage).")

    # De-duplicate by legacy_row_id (the upsert's actual conflict target),
    # keeping the last occurrence in sheet order. A single-statement
    # Postgres upsert can't do "last row wins" on its own — ON CONFLICT DO
    # UPDATE hitting the same key twice in one command is a hard error, so
    # without this the whole batch would abort with zero rows imported.
    # Doing it here, before the request, makes the docstring's stated
    # intent actually true.
    deduped_by_legacy_id = {}
    for row_num, row in numbered_rows:
        deduped_by_legacy_id[row["legacy_row_id"]] = (row_num, row)
    deduped_rows = list(deduped_by_legacy_id.values())
    dropped = len(numbered_rows) - len(deduped_rows)
    if dropped:
        print(f"Deduplicated {dropped} row(s) sharing a legacy_row_id (kept the last occurrence of each).")

    stage_counts = {}
    for _, r in deduped_rows:
        stage_counts[r["stage"]] = stage_counts.get(r["stage"], 0) + 1
    for stage, count in sorted(stage_counts.items(), key=lambda x: -x[1]):
        print(f"  {stage}: {count}")

    # Pre-flight: rn_no is DB-UNIQUE but is NOT the upsert's conflict
    # target, so two rows in this batch sharing a non-null rn_no would
    # abort the whole upsert with an opaque constraint-violation error.
    # Check locally first and bail with a clear diagnostic instead —
    # this is a source-data ambiguity (which row should keep the RN?)
    # that needs a human decision, not a guess.
    collisions = find_duplicate_rn_nos(deduped_rows)
    if collisions:
        print(f"\nABORTING: {len(collisions)} rn_no value(s) shared by more than one row in this batch.", file=sys.stderr)
        print("rn_no is UNIQUE in sales_leads but is not this script's upsert conflict target", file=sys.stderr)
        print("(legacy_row_id is), so any such collision would abort the entire batch insert.", file=sys.stderr)
        print("Resolve this in the source spreadsheet (or decide which row keeps the RN) before re-running:\n", file=sys.stderr)
        for rn_no, entries in collisions.items():
            print(f"  {rn_no}:", file=sys.stderr)
            for row_num, row in entries:
                name = f"{row.get('first_name') or ''} {row.get('last_name') or ''}".strip()
                print(f"    - row {row_num}: {name or '(no name)'} (legacy_row_id={row['legacy_row_id']})", file=sys.stderr)
        sys.exit(1)

    result = upsert(url, key, [row for _, row in deduped_rows])
    print(f"Upserted {len(result)} rows into sales_leads.")


if __name__ == "__main__":
    main()
