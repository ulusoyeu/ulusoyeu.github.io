// @ts-check
import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import { katexPlugin } from './src/lib/katex-plugin';

export default defineConfig({
  site: 'https://ulusoyeu.github.io',
  trailingSlash: 'always',
  vite: {
    // One id per build, used in Base.astro to version the URLs of files in public/.
    define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36)) },
  },
  markdown: {
    processor: satteri({ features: { math: true }, mdastPlugins: [katexPlugin] }),
  },
});
