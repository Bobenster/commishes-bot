import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/main/preload.ts',
      formats: ['cjs'],
      fileName: 'preload'
    },
    outDir: resolve(__dirname, '.vite/main'),
    rollupOptions: {
      external: ['electron', 'contextBridge', 'ipcRenderer']
    },
    emptyOutDir: false
  }
});