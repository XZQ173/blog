import { defineConfig } from 'astro/config';

// 部署时把 site 换成你的正式域名，例如 https://yourname.vercel.app
export default defineConfig({
  site: 'https://example.com',
  markdown: {
    shikiConfig: {
      theme: 'github-light',
    },
  },
});
