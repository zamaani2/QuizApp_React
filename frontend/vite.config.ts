/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const djangoProxy = () => ({
  target: 'http://127.0.0.1:8000',
  changeOrigin: false,
});

const authCoreDevRoute: Plugin = {
  name: 'auth-core-dev-route',
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const [pathname, query] = (request.url || '/').split('?');
      if (pathname === '/') {
        request.url = `/auth-core.html${query ? `?${query}` : ''}`;
      } else if (pathname === '/auth-app' || pathname.startsWith('/auth-app/')) {
        response.statusCode = 302;
        response.setHeader('Location', `/${query ? `?${query}` : ''}`);
        response.end();
        return;
      }
      next();
    });
  },
};

export default defineConfig({
  plugins: [authCoreDevRoute, react()],
  base: process.env.NODE_ENV === 'production' ? '/static/react/' : '/',
  build: {
    outDir: path.resolve(__dirname, '../quiz_app/static/react'),
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, 'index.html'),
        'auth-core': path.resolve(__dirname, 'auth-core.html'),
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': djangoProxy(),
      '/extend-session': djangoProxy(),
      '/login': djangoProxy(),
      '/logout': djangoProxy(),
      '/password-reset': djangoProxy(),
      '/dashboard': djangoProxy(),
      '/quizzes': djangoProxy(),
      '/students': djangoProxy(),
      '/enrollments': djangoProxy(),
      '/academic-years': djangoProxy(),
      '/terms': djangoProxy(),
      '/subjects': djangoProxy(),
      '/classes': djangoProxy(),
      '/teachers': djangoProxy(),
      '/assignments': djangoProxy(),
      '/school': djangoProxy(),
      '/users': djangoProxy(),
      '/superadmin': djangoProxy(),
      '/static': djangoProxy(),
      '/media': djangoProxy(),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
});
