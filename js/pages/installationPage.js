/**
 * Synx Portal - EV Charger Installation & Commissioning Form Page Entry Point (MPA)
 */

import { AppLayout } from '../components/appLayout.js';
import { AuthGuard } from '../components/authGuard.js';
import { InstallationForm } from '../forms/installationForm.js';
import { FormStorage } from '../components/formStorage.js';

document.addEventListener('DOMContentLoaded', async () => {
  if (!(await AuthGuard.protectPage())) return;

  const container = await AppLayout.init('installation', 'EV Charger Installation & Commissioning Form');
  if (container) {
    // Check if data passed via URL query parameters or sessionStorage
    let selectedData = null;
    const rawSession = sessionStorage.getItem('synx_selected_installation');
    if (rawSession) {
      try {
        selectedData = JSON.parse(rawSession);
        sessionStorage.removeItem('synx_selected_installation');
      } catch (e) {
        selectedData = null;
      }
    }

    if (!selectedData) {
      const urlParams = new URLSearchParams(window.location.search);
      const id = urlParams.get('id');
      const rn = urlParams.get('rn');
      if (id || rn) {
        const readyItems = FormStorage.listReadyInstallations() || [];
        selectedData = readyItems.find(item => item.id === id || item.rnNo === rn) || null;
      }
    }

    const installationForm = new InstallationForm(container, selectedData);
    installationForm.render();
  }
});
