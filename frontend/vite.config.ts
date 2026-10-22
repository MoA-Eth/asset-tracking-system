import { defineConfig, Plugin } from 'vite';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * The OCR engine, its English data and its worker, served from the app itself at /ocr/ so reading a scanned slip
 * works without internet. In development they come straight from node_modules; the build writes them into dist/ocr.
 */
const fromModules = (path: string) => fileURLToPath(new URL(`./node_modules/${path}`, import.meta.url));
const OCR_FILES: Record<string, string> = {
  'worker.min.js': fromModules('tesseract.js/dist/worker.min.js'),
  'tesseract-core-simd-lstm.wasm.js': fromModules('tesseract.js-core/tesseract-core-simd-lstm.wasm.js'),
  'tesseract-core-lstm.wasm.js': fromModules('tesseract.js-core/tesseract-core-lstm.wasm.js'),
  'eng.traineddata.gz': fromModules('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'),
};

function ocrAssets(): Plugin {
  return {
    name: 'moa-ocr-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = /^\/ocr\/([^?#]+)/.exec(req.url ?? '')?.[1];
        const file = name ? OCR_FILES[name] : undefined;
        if (!file || !existsSync(file)) return next();
        res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
        res.end(readFileSync(file));
      });
    },
    generateBundle() {
      for (const [name, file] of Object.entries(OCR_FILES)) {
        this.emitFile({ type: 'asset', fileName: `ocr/${name}`, source: readFileSync(file) });
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    ocrAssets()
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
