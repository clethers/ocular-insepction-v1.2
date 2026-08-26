/**
 * OIMS Field App - Main Application Controller
 * Delegates to centralized SPA Router and AppLayout architecture.
 * Preserves clean code principles and zero file deletion.
 */

import { Router } from './router.js';
import { AuthGuard } from './components/authGuard.js';
import { AppLayout } from './components/appLayout.js';

export class OIMSApp {
  constructor() {
    this.currentView = 'ocular';
  }

  init() {
    Router.init();
  }

  static getSessionUser() {
    return AuthGuard.getSessionUser();
  }

  static showToast(message) {
    AppLayout.showToast(message);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new OIMSApp();
  app.init();
});
