import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { existsSync, rmSync, mkdirSync, cpSync } from 'node:fs'

// Builds test-site/ and copies its output into dist/concept/ once the main
// build finishes. This lives in a Vite plugin hook (not a package.json
// script chain) because Vercel appears to invoke `vite build` directly for
// this project — bypassing whatever custom "build" script is in package.json
// entirely — so anything that needs to run had to be wired into Vite's own
// build lifecycle instead.
function buildConceptSite() {
  return {
    name: 'build-concept-subsite',
    apply: 'build',
    closeBundle() {
      console.log('[concept] building test-site subproject…')
      execSync('npm ci --no-audit --no-fund', { cwd: 'test-site', stdio: 'inherit' })
      execSync('npm run build', { cwd: 'test-site', stdio: 'inherit' })
      if (existsSync('dist/concept')) rmSync('dist/concept', { recursive: true, force: true })
      mkdirSync('dist/concept', { recursive: true })
      cpSync('test-site/dist', 'dist/concept', { recursive: true })
      console.log('[concept] copied test-site/dist -> dist/concept')
    },
  }
}

export default defineConfig({
  plugins: [react(), buildConceptSite()],
  build: {
    // Increase chunk warning threshold (single-bundle React app is fine up to 1MB)
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Split vendor libs into a separate cached chunk
        manualChunks: {
          vendor: ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
})
