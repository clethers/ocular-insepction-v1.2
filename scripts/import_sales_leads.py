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
"""
import json
import os
import re
import sys
import urllib.request
from datetime import datetime

import openpyxl

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX_PATH = os.path.join(REPO_ROOT, "srcs", "TESLA INTERNAL DATABASE (1) 1.xlsx")
ENV_PATH = os.path.join(REPO_ROOT, ".env")

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

    payload = {
        "legacy_row_id": legacy_id,
        "rn_no": clean_str(ws.cell(row=row_num, column=COL_RN_NO).value),
        "first_name": clean_str(ws.cell(row=row_num, column=COL_FIRST_NAME).value),
        "last_name": clean_str(ws.cell(row=row_num, column=COL_LAST_NAME).value),
        "contact_no": clean_str(ws.cell(row=row_num, column=COL_CONTACT_NO).value),
        "installation_address": clean_str(ws.cell(row=row_num, column=COL_ADDRESS).value),
        "email": clean_str(ws.cell(row=row_num, column=COL_EMAIL).value),
        "mode_of_communication": clean_str(ws.cell(row=row_num, column=COL_MODE).value),
        "remarks": clean_str(ws.cell(row=row_num, column=COL_REMARKS).value),
        "stage": stage,
        "source_status_raw": clean_str(status_raw),
    }
    payload.update(stamps)
    return payload


def upsert(url, key, rows):
    endpoint = f"{url.rstrip('/')}/rest/v1/sales_leads?on_conflict=legacy_row_id"
    body = json.dumps(rows).encode("utf-8")
    req = urllib.request.Request(endpoint, data=body, method="POST")
    req.add_header("apikey", key)
    req.add_header("Authorization", f"Bearer {key}")
    req.add_header("Content-Type", "application/json")
    req.add_header("Prefer", "resolution=merge-duplicates,return=representation")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    url, key = load_env()
    wb = openpyxl.load_workbook(XLSX_PATH, data_only=True)
    ws = wb["CLIENT DATABASE"]

    rows = []
    skipped = 0
    for row_num in range(2, 308):
        row = build_row(ws, row_num)
        if row is None:
            skipped += 1
            continue
        rows.append(row)

    print(f"Read {len(rows)} rows ({skipped} skipped — no derivable stage).")

    stage_counts = {}
    for r in rows:
        stage_counts[r["stage"]] = stage_counts.get(r["stage"], 0) + 1
    for stage, count in sorted(stage_counts.items(), key=lambda x: -x[1]):
        print(f"  {stage}: {count}")

    result = upsert(url, key, rows)
    print(f"Upserted {len(result)} rows into sales_leads.")


if __name__ == "__main__":
    main()
