import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import tsconfigPaths from 'vite-tsconfig-paths';

const [repositoryOwner, repositoryName] = (process.env.GITHUB_REPOSITORY ?? '').split('/');
const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
const isUserOrOrgPagesRepo =
  repositoryOwner !== undefined &&
  repositoryName !== undefined &&
  repositoryName.toLowerCase() === `${repositoryOwner.toLowerCase()}.github.io`;
const base = isGitHubActions && repositoryName !== undefined ? (isUserOrOrgPagesRepo ? '/' : `/${repositoryName}/`) : '/';
const withBase = (path: string) => `${base}${path.replace(/^\//, '')}`;

export default defineConfig({
  base,
  plugins: [
    react(),
    tsconfigPaths(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        id: withBase('login'),
        name: 'SuperWindow - Кабинет дилера',
        short_name: 'Кабинет дилера',
        description: 'PWA-приложение для оформления заказов дилера',
        lang: 'ru-RU',
        theme_color: '#2f8de8',
        background_color: '#e9edf2',
        display: 'standalone',
        orientation: 'portrait',
        scope: base,
        start_url: withBase('login'),
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
});
