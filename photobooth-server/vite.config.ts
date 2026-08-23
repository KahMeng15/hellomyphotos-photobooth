import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  root: './frontend',
  base: process.env.VITE_BASE_URL || '/',
  build: {
    outDir: '../public',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['vue', 'pinia', 'axios', 'socket.io-client'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './frontend/src'),
    },
  },
  server: {
    host: true,
    allowedHosts: true,
    port: 5173,
    proxy: {
      [`${process.env.VITE_BASE_URL || '/'}api`]: {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(new RegExp(`^${process.env.VITE_BASE_URL || '/'}`), '/')
      },
      [`${process.env.VITE_BASE_URL || '/'}socket.io`]: {
        target: 'http://localhost:3000',
        ws: true,
        rewrite: (path) => path.replace(new RegExp(`^${process.env.VITE_BASE_URL || '/'}`), '/')
      },
    },
  },
})
