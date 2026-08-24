/**
 * Synx Portal - Login Page Entry Point (MPA)
 */

import { LoginForm } from '../components/loginForm.js';
import { AuthGuard } from '../components/authGuard.js';

document.addEventListener('DOMContentLoaded', async () => {
  // If already logged in, redirect straight to ocular inspection page
  if (await AuthGuard.redirectIfLoggedIn()) return;

  const appElem = document.getElementById('app');
  if (appElem) {
    const loginForm = new LoginForm(appElem);
    loginForm.render();
  }
});
