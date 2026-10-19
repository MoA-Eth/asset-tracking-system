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
        // Smart vendor chunk splitting for optimal cache retention and minimal initial bundle payload
        manualChunks: (id) => {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/scheduler/')) {
            return 'vendor-react';
          }
          if (
            id.includes('node_modules/jspdf') ||
            id.includes('node_modules/html2canvas') ||
            id.includes('node_modules/jspdf-autotable') ||
            id.includes('node_modules/dompurify') ||
            id.includes('node_modules/purify')
          ) {
            return 'vendor-pdf';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons';
          }
        },
        // The PDF reader's worker ships as .mjs, which nginx doesn't know and serves as a download;
        // saved as .js it is served as JavaScript, which a module worker requires
        assetFileNames: (asset) =>
          asset.names?.some((n) => n.endsWith('.mjs')) ? 'assets/[name]-[hash].js' : 'assets/[name]-[hash][extname]'
      }
    }
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  },
  preview: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  }
});
