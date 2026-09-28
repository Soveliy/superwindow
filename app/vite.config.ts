import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import tsconfigPaths from 'vite-tsconfig-paths';

const [repositoryOwner, repositoryName] = (process.env.GITHUB_REPOSITORY ?? '').split('/');
const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
const isUserOrOrgPagesRepo =
  repositoryOwner !== undefined &&
  repositoryName !== undefined &&
  repositoryName.toLowerCase() === `${repositoryOwner.toLowerCase()}.github.io`;

export default defineConfig(({ mode }) => {
  const developmentEnv = loadEnv(mode, process.cwd(), 'VITE_');
  const apiTarget = developmentEnv.VITE_API_BASE_URL?.trim();
  const base =
    isGitHubActions && repositoryName !== undefined
      ? isUserOrOrgPagesRepo
        ? '/'
        : `/${repositoryName}/`
      : mode === 'production'
        ? '/calc/'
        : '/';
  const useHashRouting = isGitHubActions && repositoryName !== undefined && !isUserOrOrgPagesRepo;
  const startUrl = useHashRouting ? `${base}#/` : base;

  return {
    base,
    server: {
      proxy: apiTarget
        ? {
            '/local/rest/api/v1': {
              target: apiTarget,
              changeOrigin: true,
              cookieDomainRewrite: '',
              cookiePathRewrite: '/',
            },
            '/upload': { target: apiTarget, changeOrigin: true },
          }
        : undefined,
    },
    plugins: [
      react(),
      tsconfigPaths(),
      VitePWA({
        registerType: 'autoUpdate',
        selfDestroying: useHashRouting,
        includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'push-notifications.js'],
        manifest: {
          id: startUrl,
          name: 'SuperWindow - Кабинет дилера',
          short_name: 'Кабинет дилера',
          description: 'PWA-приложение для оформления заказов дилера',
          lang: 'ru-RU',
          theme_color: '#2f8de8',
          background_color: '#e9edf2',
          display: 'standalone',
          orientation: 'portrait',
          scope: base,
          start_url: startUrl,
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
          importScripts: ['push-notifications.js'],
        },
        devOptions: {
          enabled: true,
        },
      }),
    ],
  };
});
