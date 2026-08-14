/**
 * Synx Portal - Inspector Single-Page Portal Entry Point
 */

import { AppLayout } from '../components/appLayout.js';
import { AuthGuard } from '../components/authGuard.js';
import { InspectorWorkspace } from '../components/inspectorWorkspace.js';
import { USER_ROLES } from '../services/userService.js';

document.addEventListener('DOMContentLoaded', () => {
  // Protect page: require Field Inspector, Customer Care Manager, REE Engineer, or Admin
  if (!AuthGuard.protectPageWithRole([USER_ROLES.FIELD_INSPECTOR, USER_ROLES.CUSTOMER_CARE_MANAGER, USER_ROLES.LEAD_ENGINEER, USER_ROLES.ADMIN])) return;

  const container = AppLayout.init('ocular', 'Field Inspector Portal');
  if (container) {
    const workspace = new InspectorWorkspace(container);
    workspace.render();
  }
});
