import { defineConfig } from 'vite'

export default defineConfig({
  base: '/grid-worker/',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: './index.html'
      }
    },
    copyPublicDir: false
  },
  publicDir: 'examples'
})