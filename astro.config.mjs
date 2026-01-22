import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  vite: {
    server: {
      // Serve index.html for all routes (SPA fallback)
      middlewareMode: false,
    },
    appType: 'spa',
  },
});
