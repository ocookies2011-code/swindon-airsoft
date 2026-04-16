import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@supabase')) return 'supabase';
          if (id.includes('node_modules/react-dom')) return 'react-dom';
          if (id.includes('node_modules/react')) return 'react';
          if (
            id.includes('AdminPanel') ||
            id.includes('AdminDash') ||
            id.includes('AdminPlayers') ||
            id.includes('AdminShop') ||
            id.includes('AdminRevenue') ||
            id.includes('AdminStats') ||
            id.includes('AdminSettings') ||
            id.includes('AdminAuditLog') ||
            id.includes('AdminMessages') ||
            id.includes('AdminUkara') ||
            id.includes('AdminWaivers') ||
            id.includes('AdminCash') ||
            id.includes('AdminStaff') ||
            id.includes('AdminContent') ||
            id.includes('AdminLeaderboard') ||
            id.includes('AdminEventsBookings') ||
            id.includes('AdminGiftVouchers') ||
            id.includes('AdminDiscountCodes') ||
            id.includes('AdminPurchaseOrders') ||
            id.includes('AdminCheatReports') ||
            id.includes('AdminContact')
          ) return 'admin';
        },
      },
    },
    minify: 'esbuild',
    cssCodeSplit: true,
    sourcemap: false,
  },
  optimizeDeps: {
    include: ['react', 'react-dom', '@supabase/supabase-js'],
  },
})
