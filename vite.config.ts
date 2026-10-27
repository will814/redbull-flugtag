import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/')) return 'vendor';
          if (id.includes('/src/soapbox/')) return 'game-soapbox';
          if (id.includes('/src/coaster/')) return 'game-coaster';
          if (id.includes('/src/tandem/')) return 'game-tandem';
          if (
            id.includes('/src/flugtag/') ||
            id.includes('/src/builder/') ||
            id.includes('/src/physics/') ||
            id.includes('/src/scene/')
          ) {
            return 'game-flugtag';
          }
          return undefined;
        },
      },
    },
  },
});

