import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/main/main.ts',
      formats: ['cjs'],
      fileName: 'main'
    },
    outDir: resolve(__dirname, '.vite/main'),
    rollupOptions: {
      external: ['electron', 'playwright', 'playwright-core', 'kerberos', 'fs', 'path', 'child_process', 'os', 'crypto']
    },
    emptyOutDir: false
  }
});