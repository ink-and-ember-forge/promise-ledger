import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { createLogger } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Set BASE_PATH (e.g. "/promise-ledger/") when hosting under a sub-path, as GitHub Pages project sites do.
const trimmed = (process.env.BASE_PATH ?? '').replace(/^\/+|\/+$/g, '');
const base = trimmed ? `/${trimmed}/` : '/';

export default defineConfig({
  base,
  // boot-check.js is deliberately not bundled (it must run when the bundle cannot), so copy it as-is.
  // Vite warns about unbundled scripts; that warning is expected here and filtered out.
  customLogger: (() => {
    const logger = createLogger();
    const warn = logger.warn.bind(logger);
    logger.warn = (msg, options) => {
      if (!msg.includes('boot-check.js')) warn(msg, options);
    };
    return logger;
  })(),
  plugins: [
    {
      name: 'emit-boot-check',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'boot-check.js', source: readFileSync('boot-check.js') });
      },
    },
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Promise Ledger',
        short_name: 'Ledger',
        description: 'Local-first record of questions, tasks and commitments.',
        display: 'standalone',
        start_url: '.',
        background_color: '#1f2a44',
        theme_color: '#1f2a44',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,woff2}'] },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    setupFiles: ['tests/setup-no-network.ts'],
  },
});
