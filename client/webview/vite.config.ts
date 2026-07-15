import react from '@vitejs/plugin-react';
import { cpSync } from 'fs';
import path from 'path';
import { defineConfig } from 'vite';

const copyWebviewRuntimeAssets = () => ({
  name: 'copy-webview-runtime-assets',
  closeBundle() {
    const assetsDirectory = path.resolve(__dirname, 'out/assets/vendor');

    cpSync(path.resolve(__dirname, 'node_modules/monaco-editor/min/vs'), path.join(assetsDirectory, 'monaco/vs'), {
      recursive: true
    });
  }
});

export default defineConfig({
  plugins: [react(), copyWebviewRuntimeAssets()],
  build: {
    outDir: 'out',
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name].js`,
        chunkFileNames: `assets/[name].[hash].js`,
        assetFileNames: `assets/[name].[ext]`
      },
      external: ['vscode']
    }
  },
  resolve: {
    alias: {
      '~': path.resolve(__dirname, 'src')
    }
  },
  experimental: {
    renderBuiltUrl(filename, { hostType, type }) {
      if (hostType == 'css') {
        return { relative: true };
      }
      if (type == 'asset' && !['assets/index.js', 'assets/index.css'].includes(filename)) {
        // Function `window.__getChunkPath` is defined in `client\src\views\webviewHtmlProvider.ts`
        // We need this to correctly load bundle chunks in runtime
        return { runtime: `window.__webview.getChunkPath(${JSON.stringify(filename)})` };
      }
      return filename;
    }
  }
});
