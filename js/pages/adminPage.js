import { AuthGuard } from '../components/authGuard.js';
import { AppLayout } from '../components/appLayout.js';
import { AdminWorkspace } from '../components/adminWorkspace.js';
import { USER_ROLES } from '../services/userService.js';

document.addEventListener('DOMContentLoaded', () => {
  // Protect page: require Admin role
  if (!AuthGuard.protectPageWithRole([USER_ROLES.ADMIN])) return;

  const urlParams = new URLSearchParams(window.location.search);
  const tab = urlParams.get('tab') || 'dashboard';

  const titleMap = {
    dashboard: 'System Dashboard',
    users: 'User Management',
    audit: 'Audit Logs'
  };

  // Initialize shared AppLayout with activeView '/admin/' + tab
  const mainStage = AppLayout.init('/admin/' + tab, titleMap[tab] || 'System Dashboard');

  // Render Admin Workspace Component
  if (mainStage) {
    const workspace = new AdminWorkspace(mainStage);
    workspace.activeTab = tab;
    workspace.render();
  }
});
