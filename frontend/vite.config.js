import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  
  build: {
    // Cache-busting: Add content hash to filenames
    rollupOptions: {
      output: {
        // JS files get content hash
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    // Generate manifest for cache invalidation tracking
    manifest: true,
    // Source maps for debugging
    sourcemap: false,
  },
  
  server: {
    // Dev server settings
    port: 3000,
    host: true,
  },
  
  // Ensure no browser caching in dev
  optimizeDeps: {
    force: true,
  },
});
