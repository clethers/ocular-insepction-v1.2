/**
 * OIMS — Offline Submission Sync Queue
 *
 * Flushes form submissions that FormStorage queued locally (because
 * Supabase was unreachable at submit time) back to the cloud once
 * connectivity returns. Kept separate from supabaseService (a pure
 * data-access layer) and from the forms themselves, since queue
 * orchestration — retry bookkeeping, in-flight guarding, event wiring —
 * doesn't belong in either.
 */

import { FormStorage } from '../components/formStorage.js';
import { supabaseService } from './supabaseService.js';

// A single in-flight promise, shared by every caller. The 'online' event,
// an InspectorWorkspace mount, and a manual "Sync now" click can all ask
// to flush around the same time — without this guard they'd race each
// other into submitting the same queued item more than once.
let flushPromise = null;

const SAVE_FN_BY_FORM_TYPE = {
  ocular_inspection: (payload) => supabaseService.saveOcularInspection(payload),
  installation_record: (payload) => supabaseService.saveInstallationRecord(payload)
};

async function runFlush() {
  const result = { synced: 0, failed: 0 };

  if (!navigator.onLine) {
    return result;
  }

  const pending = FormStorage.listPending();
  for (const entry of pending) {
    const saveFn = SAVE_FN_BY_FORM_TYPE[entry.formType];
    if (!saveFn) {
      console.warn('[OIMS Sync] Unknown pending form type, skipping:', entry.formType);
      continue;
    }
    try {
      await saveFn(entry.payload);
      FormStorage.removePending(entry.id);
      result.synced += 1;
    } catch (err) {
      FormStorage.updatePendingAttempt(entry.id, { lastError: err.message });
      result.failed += 1;
      // Keep going — one bad record (e.g. a stale reference) shouldn't
      // block every other queued submission behind it.
    }
  }

  return result;
}

export function flushPendingQueue() {
  if (!flushPromise) {
    flushPromise = runFlush().finally(() => {
      flushPromise = null;
    });
  }
  return flushPromise;
}

export function initSyncQueueListeners() {
  window.addEventListener('online', () => flushPendingQueue());
}
