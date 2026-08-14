/**
 * FormStorage module for local autosave and draft persistence in Synx
 */

const STORAGE_PREFIX = 'synx_draft_';

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
      localStorage.setItem(`synx_ready_${id}`, JSON.stringify(payload));
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
      if (key.startsWith('synx_ready_')) {
        try {
          const val = JSON.parse(localStorage.getItem(key));
          readyItems.push(val);
        } catch (e) {}
      }
    }
    return readyItems.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  }
}
