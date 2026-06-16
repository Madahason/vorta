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
        // Function form required by Vite 8 / rolldown — object form throws
        // "manualChunks is not a function — Expected Function but received Object"
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('remotion') || id.includes('@remotion')) return 'remotion'
            if (id.includes('react-dom') || id.includes('react/'))   return 'react'
          }
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
