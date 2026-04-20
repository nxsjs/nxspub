import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: path.resolve(process.cwd(), 'src/preview/web'),
  plugins: [react()],
  build: {
    outDir: path.resolve(process.cwd(), 'dist/preview-web'),
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
