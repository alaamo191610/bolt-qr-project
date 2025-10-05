import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/bolt-qr-project/',      // 👈 correct for project pages
  optimizeDeps: { exclude: ['lucide-react'] },
  server: { host: '0.0.0.0', port: 5173 },
})
