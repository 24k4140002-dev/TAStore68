import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';

const realCwd = fs.existsSync(process.cwd()) ? fs.realpathSync(process.cwd()) : process.cwd();

export default defineConfig({
  root: realCwd,
  plugins: [react()],
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-icons': ['lucide-react']
        }
      }
    }
  }
});

