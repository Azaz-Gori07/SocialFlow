import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Expose SOCKET_URL (dedicated Socket.IO host) alongside the usual
  // VITE_-prefixed vars at build time. Vite hides anything else.
  envPrefix: ['VITE_', 'SOCKET_'],
  build: {
    rollupOptions: {
      output: {
        // Long-term-cacheable vendor splits: app code changes redeploy-local,
        // vendor chunks stay identical between releases (browser keeps them).
        manualChunks(id: string) {
          if (id.includes('node_modules/react-dom') || id.startsWith('node_modules/react/') || id.includes('node_modules/react-router')) {
            return 'react-core';
          }
          if (id.includes('node_modules/lucide-react')) return 'lucide';
        },
      },
    },
  },
})
