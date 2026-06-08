import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@remotion-compositions': path.resolve(__dirname, '../remotion/src'),
      // Force all Remotion composition imports to use the client's copies of
      // these packages — prevents multiple React/Remotion instances which
      // cause "Invalid hook call" and "resolveDispatcher is null" errors.
      'react':           path.resolve(__dirname, 'node_modules/react'),
      'react-dom':       path.resolve(__dirname, 'node_modules/react-dom'),
      'remotion':        path.resolve(__dirname, 'node_modules/remotion'),
      '@remotion/player':path.resolve(__dirname, 'node_modules/@remotion/player'),
    },
    dedupe: ['react', 'react-dom', 'remotion', '@remotion/player'],
  },
  server: {
    proxy: {
      '/api':      'http://localhost:3001',
      '/projects': 'http://localhost:3001',
      '/library':  'http://localhost:3001',
    },
  },
})
