import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const BASE = '/Co-desarrolladores-Yod/'

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',     // el SW se actualiza solo cuando publicamos
      injectRegister: 'auto',         // inyecta el registro del service worker
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Co-desarrolladores · YoDesarrollo',
        short_name: 'YoDesarrollo',
        description: 'Portal de Co-desarrolladores de YoDesarrollo: tu inversion, aportaciones, avance y documentos, siempre claros.',
        lang: 'es-MX',
        dir: 'ltr',
        theme_color: '#1a1409',
        background_color: '#0a0a0c',
        display: 'standalone',
        orientation: 'portrait',
        scope: BASE,
        start_url: BASE,
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precachea el "cascaron" de la app (lo hashea Vite). Las llamadas al
        // Apps Script son POST y Workbox NO las cachea, asi que los datos
        // siempre salen frescos del servidor (no se sirven datos viejos).
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
        navigateFallback: BASE + 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
