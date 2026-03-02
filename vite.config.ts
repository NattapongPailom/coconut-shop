import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const backendUrl = env.VITE_BACKEND_URL || 'http://localhost:3001';

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        // Proxy all /api/* to Express backend
        '/api': {
          target: backendUrl,
          changeOrigin: true,
        },
        // Proxy socket.io WebSocket
        '/socket.io': {
          target: backendUrl,
          ws: true,
          changeOrigin: true,
        },
        // Proxy webhook (for local ngrok testing)
        '/webhook': {
          target: backendUrl,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
            motion: ['motion'],
            socket: ['socket.io-client'],
          },
        },
      },
    },
  };
});
