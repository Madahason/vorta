import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Remotion player bundle is large; raise the warning threshold to avoid noise.
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: {
          remotion: ['remotion', '@remotion/player'],
          react:    ['react', 'react-dom'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@remotion-compositions': path.resolve(__dirname, '../remotion/src'),
      // Force all Remotion imports to use the client's copies — prevents
      // multiple React/Remotion instances ("Invalid hook call") and version
      // mismatches (SequenceWithoutSchema undefined in @remotion/transitions).
      'react':                    path.resolve(__dirname, 'node_modules/react'),
      'react-dom':                path.resolve(__dirname, 'node_modules/react-dom'),
      'remotion':                 path.resolve(__dirname, 'node_modules/remotion'),
      '@remotion/player':         path.resolve(__dirname, 'node_modules/@remotion/player'),
      '@remotion/transitions':    path.resolve(__dirname, 'node_modules/@remotion/transitions'),
    },
    dedupe: ['react', 'react-dom', 'remotion', '@remotion/player', '@remotion/transitions'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api':      { target: 'http://localhost:3001', changeOrigin: true },
      '/projects': { target: 'http://localhost:3001', changeOrigin: true },
      '/library':  { target: 'http://localhost:3001', changeOrigin: true },
      '/output':   { target: 'http://localhost:3001', changeOrigin: true },
      '/clips':    { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
})
