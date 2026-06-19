import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://lab.zichaoyang.com',
  devToolbar: {
    enabled: false,
  },

  // The system design labs used to live on one combined page; keep the old
  // URL pointing at the first standalone lab so existing links don't break.
  redirects: {
    '/system-design-lab': '/system-design/ad-tracking/',
  },

  vite: {
    plugins: [tailwindcss()],
  },
});
