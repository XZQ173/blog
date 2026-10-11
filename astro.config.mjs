import { defineConfig } from 'astro/config';

// 部署时把 site 换成你的正式域名，例如 https://yourname.vercel.app
export default defineConfig({
  site: 'https://xx173.bbroot.com',
  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
    },
  },
});
