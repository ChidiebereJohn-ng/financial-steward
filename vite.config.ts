import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'app',
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'https://personal-finance-app.chidieberejohnchukwuemeka.workers.dev',
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
