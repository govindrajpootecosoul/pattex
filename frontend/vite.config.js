import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  return {
    plugins: [react()],
    server: {
      port: 3027,
      host: true, // listen on all interfaces (e.g. http://192.168.50.107:3027)
    },
  };
});
