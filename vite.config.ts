import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Relativ base: siden virker både på https://djlindstrom.dk/ og på https://lindstroms.github.io/DJLindstrom/
// (alle sider ligger bag #, så alle filer hentes fra samme mappe)
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
})
