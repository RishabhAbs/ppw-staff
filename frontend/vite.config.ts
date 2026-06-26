import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  server: {
    port: 5180,
    allowedHosts: ['transnational-cherly-hallucinational.ngrok-free.dev'],
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/public': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      workbox: {
        // Take control of open pages as soon as a new SW is published so users
        // never get stuck on a stale app shell after a deploy (the cause of the
        // post-login bounce to /login).
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // The SPA navigation fallback must NEVER swallow API or auth requests —
        // otherwise the SW intercepts /api/* calls and they can resolve from a
        // stale/precached response (seen as spurious 401s that logged users out).
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/auth\//, /^\/public\//],
      },
      manifest: {
        name: 'PPW',
        short_name: 'PPW', // Shortened for home screen
        description: 'Tally Sync & Order Management',
        theme_color: '#ffffff',
        background_color: '#ffffff', // Added background color
        display: 'standalone', // Critical for "App" feel
        start_url: '/',
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable' // Added purpose
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable' // Added purpose
          }
        ]
      }
    })
  ],
})
