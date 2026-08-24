import { AuthGuard } from '../components/authGuard.js';
import { AppLayout } from '../components/appLayout.js';
import { ManagerWorkspace } from '../components/managerWorkspace.js';
import { USER_ROLES } from '../services/userService.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Protect page: require Customer Care Manager, Lead Engineer, or Admin role
  if (!(await AuthGuard.protectPageWithRole([USER_ROLES.CUSTOMER_CARE_MANAGER, USER_ROLES.LEAD_ENGINEER, USER_ROLES.ADMIN]))) return;

  // Initialize shared AppLayout with activeView 'manager'
  const mainStage = await AppLayout.init('manager', 'Customer Care & Manager Hub');

  // Render Manager Workspace Component
  if (mainStage) {
    const workspace = new ManagerWorkspace(mainStage);
    workspace.render();
  }
});
