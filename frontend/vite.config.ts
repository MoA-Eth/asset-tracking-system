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
  // Tailwind's colours are oklch(), which Firefox before 113 and Chrome before 111 don't know: the final CSS gets
  // plain hex fallbacks for them, so older office browsers still show the colours. The floor is set by Tailwind's
  // cascade layers (@layer), which a browser older than these ignores altogether.
  css: {
    lightningcss: {
      // Each version is major << 16 | minor << 8
      targets: { firefox: 97 << 16, chrome: 99 << 16, edge: 99 << 16, safari: (15 << 16) | (4 << 8) }
    }
  },
  build: {
    cssMinify: 'lightningcss',
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
