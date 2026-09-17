/**
 * FormStorage module for local autosave and draft persistence in OIMS
 */

const STORAGE_PREFIX = 'oims_draft_';
const PENDING_PREFIX = 'oims_pending_';

export class FormStorage {
  static saveDraft(formId, data) {
    try {
      const payload = {
        updatedAt: new Date().toISOString(),
        data: data
      };
      localStorage.setItem(`${STORAGE_PREFIX}${formId}`, JSON.stringify(payload));
      return true;
    } catch (e) {
      console.error('Failed to save draft', e);
      return false;
    }
  }

  static loadDraft(formId) {
    try {
      const item = localStorage.getItem(`${STORAGE_PREFIX}${formId}`);
      if (!item) return null;
      return JSON.parse(item);
    } catch (e) {
      console.error('Failed to load draft', e);
      return null;
    }
  }

  static clearDraft(formId) {
    localStorage.removeItem(`${STORAGE_PREFIX}${formId}`);
  }

  static listDrafts() {
    const drafts = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(STORAGE_PREFIX)) {
        try {
          const val = JSON.parse(localStorage.getItem(key));
          drafts.push({
            id: key.replace(STORAGE_PREFIX, ''),
            updatedAt: val.updatedAt,
            data: val.data
          });
        } catch (e) {}
      }
    }
    return drafts.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  static saveReadyInstallation(data) {
    try {
      const id = data.rnNo || `rn_${Date.now()}`;
      const payload = {
        updatedAt: new Date().toISOString(),
        ...data
      };
      localStorage.setItem(`oims_ready_${id}`, JSON.stringify(payload));
      return true;
    } catch (e) {
      console.error('Failed to save ready installation', e);
      return false;
    }
  }

  static listReadyInstallations() {
    const readyItems = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith('oims_ready_')) {
        try {
          const val = JSON.parse(localStorage.getItem(key));
          readyItems.push(val);
        } catch (e) {}
      }
    }
    return readyItems.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  }

  // A pending entry is a completed form (e.g. a submitted Ocular Inspection
  // or Installation record) that couldn't reach Supabase — usually because
  // the Field Inspector is offline on-site. Unlike a draft (still being
  // edited), it's done and just waiting for connectivity to sync. See
  // js/services/syncQueue.js for what actually flushes these.
  static enqueuePending(formType, payload) {
    try {
      const id = `${formType}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const entry = {
        id,
        formType,
        payload,
        queuedAt: new Date().toISOString(),
        attempts: 0,
        lastError: null,
        lastAttemptAt: null
      };
      localStorage.setItem(`${PENDING_PREFIX}${id}`, JSON.stringify(entry));
      return entry;
    } catch (e) {
      console.error('Failed to queue pending submission', e);
      return null;
    }
  }

  static listPending() {
    const pending = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(PENDING_PREFIX)) {
        try {
          pending.push(JSON.parse(localStorage.getItem(key)));
        } catch (e) {}
      }
    }
    return pending.sort((a, b) => new Date(a.queuedAt) - new Date(b.queuedAt));
  }

  static removePending(id) {
    localStorage.removeItem(`${PENDING_PREFIX}${id}`);
  }

  static updatePendingAttempt(id, { lastError } = {}) {
    try {
      const key = `${PENDING_PREFIX}${id}`;
      const item = localStorage.getItem(key);
      if (!item) return;
      const entry = JSON.parse(item);
      entry.attempts = (entry.attempts || 0) + 1;
      entry.lastAttemptAt = new Date().toISOString();
      entry.lastError = lastError || null;
      localStorage.setItem(key, JSON.stringify(entry));
    } catch (e) {
      console.error('Failed to update pending submission attempt', e);
    }
  }

  static countPending() {
    return FormStorage.listPending().length;
  }
}
