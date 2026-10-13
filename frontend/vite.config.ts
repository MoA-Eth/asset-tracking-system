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
