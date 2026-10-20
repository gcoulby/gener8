import { defineConfig } from 'vite';

// Absolute site URL for social cards (crawlers need absolute og:image URLs).
// CI sets SITE_URL from GitHub's configure-pages step; locally it's relative.
const siteUrl = (process.env.SITE_URL ?? '').replace(/\/?$/, '/');

export default defineConfig({
  // Relative asset URLs, so the build works at any path (e.g. GitHub Pages at /<repo>/).
  base: './',
  worker: { format: 'es' },
  build: { target: 'es2022' },
  plugins: [
    {
      name: 'site-url',
      transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', siteUrl === '/' ? './' : siteUrl),
    },
  ],
});
