import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@remotion-compositions': path.resolve(__dirname, '../remotion/src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/projects': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
