import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  integrations: [react(), mdx(), sitemap()],
  vite: {
    css: {
      postcss: {
        plugins: [tailwind(), autoprefixer()],
      },
    },
  },
  site: 'https://petetasker.com',
  markdown: {
    shikiConfig: {
      // Choose from Shiki's built-in themes (or add your own)
      // https://github.com/shikijs/shiki/blob/main/docs/themes.md
      theme: 'github-dark',
      // Alternatively, provide multiple themes
      // themes: {
      //   light: 'github-light',
      //   dark: 'github-dark',
      // },
      // Add custom languages
      // Note: Shiki has tons of langs built-in, including js, ts, jsx, tsx, html, css, etc.
      // https://github.com/shikijs/shiki/blob/main/docs/languages.md
      langs: [],
      // Enable word wrap to prevent horizontal scrolling
      wrap: false,
    },
  },
});
