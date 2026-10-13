import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react()
  ],
  resolve: {
    preserveSymlinks: true
  },
  build: {
    rollupOptions: {
      output: {
        // React changes far less often than the app, so browsers keep it cached across releases
        manualChunks: { react: ['react', 'react-dom'] },
        // The PDF reader's worker ships as .mjs, which nginx doesn't know and serves as a download;
        // saved as .js it is served as JavaScript, which a module worker requires
        assetFileNames: (asset) =>
          asset.names?.some((n) => n.endsWith('.mjs')) ? 'assets/[name]-[hash].js' : 'assets/[name]-[hash][extname]'
      }
    }
  },
  server: {
    port: 3001,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  preview: {
    port: 3001,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
});
