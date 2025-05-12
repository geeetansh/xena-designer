import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    historyApiFallback: true  // Fallback to index.html for all routes
  },
  preview: {
    historyApiFallback: true  // Also add for preview server
  },
  build: {
    // Handle SPA routing in production build
    outDir: 'dist',
    assetsDir: 'assets',
    base: '/'  // Explicitly set the base path
  }
});