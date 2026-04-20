import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  root: path.resolve(process.cwd(), 'src/console/web'),
  plugins: [react(), tailwindcss()],
  build: {
    outDir: path.resolve(process.cwd(), 'dist/console-web'),
    emptyOutDir: true,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:4173',
      '/logo.svg': 'http://127.0.0.1:4173',
    },
  },
})
