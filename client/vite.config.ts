import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Expose SOCKET_URL (dedicated Socket.IO host) alongside the usual
  // VITE_-prefixed vars at build time. Vite hides anything else.
  envPrefix: ['VITE_', 'SOCKET_'],
})
