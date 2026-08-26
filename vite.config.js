import { resolve } from 'path';

// vite.config.js - OIMS Single-Page Application (SPA) Clean Path Routing Configuration
export default {
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        login: resolve(__dirname, 'pages/login.html'),
        ocular: resolve(__dirname, 'pages/ocular.html'),
        ready: resolve(__dirname, 'pages/ready.html'),
        installation: resolve(__dirname, 'pages/installation.html'),
        history: resolve(__dirname, 'pages/history.html'),
        admin: resolve(__dirname, 'pages/admin.html'),
        manager: resolve(__dirname, 'pages/manager.html'),
      },
    },
  },
  server: {
    port: 3000,
    host: true,
    open: false,
    watch: {
      usePolling: true,
    },
    // Dev server rewrite middleware for clean slash paths (/ocular/ready, /manager, /admin, /login)
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && !req.url.includes('.') && req.url !== '/') {
          req.url = '/index.html';
        }
        next();
      });
    }
  },
};
