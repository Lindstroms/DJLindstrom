import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base matcher GitHub Pages-stien https://lindstroms.github.io/DJLindstrom/
export default defineConfig({
  base: '/DJLindstrom/',
  plugins: [react(), tailwindcss()],
})
