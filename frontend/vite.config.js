import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // When VITE_API_BASE_URL is an absolute URL (e.g. https://domain/api),
  // dev proxy is not needed (frontend will call backend directly).
  const shouldProxy = !/^https?:\/\//i.test(env.VITE_API_BASE_URL || '');

  return {
    plugins: [react()],
    server: {
      port: 3027,
      host: true, // listen on all interfaces (e.g. http://192.168.50.107:3027)
      ...(shouldProxy
        ? {
            proxy: {
              '/api': {
                target: 'http://localhost:3026',
                changeOrigin: true,
              },
            },
          }
        : {}),
    },
  };
});
