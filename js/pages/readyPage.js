/**
 * Synx Portal - Ready for Installation Queue Page Entry Point (MPA)
 */

import { AppLayout } from '../components/appLayout.js';
import { AuthGuard } from '../components/authGuard.js';
import { ReadyList } from '../components/readyList.js';

document.addEventListener('DOMContentLoaded', () => {
  if (!AuthGuard.protectPage()) return;

  const container = AppLayout.init('ready', 'Ready for Installation Queue');
  if (container) {
    const readyList = new ReadyList(container, (selectedItem) => {
      // Navigate to installation page with query parameters
      const params = new URLSearchParams();
      if (selectedItem.id) params.set('id', selectedItem.id);
      if (selectedItem.rnNo) params.set('rn', selectedItem.rnNo);
      if (selectedItem.clientName) params.set('client', selectedItem.clientName);
      
      // Store draft selected data in sessionStorage for instant loading fallback
      sessionStorage.setItem('synx_selected_installation', JSON.stringify(selectedItem));
      
      window.location.href = `./installation.html?${params.toString()}`;
    });
    readyList.render();
  }
});
