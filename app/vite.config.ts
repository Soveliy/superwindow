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

export default defineConfig(({ mode }) => {
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
    plugins: [
      react(),
      tsconfigPaths(),
      VitePWA({
        registerType: 'autoUpdate',
        selfDestroying: useHashRouting,
        includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
        manifest: {
          id: startUrl,
          name: 'SuperWindow - РљР°Р±РёРЅРµС‚ РґРёР»РµСЂР°',
          short_name: 'РљР°Р±РёРЅРµС‚ РґРёР»РµСЂР°',
          description: 'PWA-РїСЂРёР»РѕР¶РµРЅРёРµ РґР»СЏ РѕС„РѕСЂРјР»РµРЅРёСЏ Р·Р°РєР°Р·РѕРІ РґРёР»РµСЂР°',
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
        },
        devOptions: {
          enabled: true,
        },
      }),
    ],
  };
});
