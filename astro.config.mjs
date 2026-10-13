// @ts-check
import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import { katexPlugin } from './src/lib/katex-plugin';

export default defineConfig({
  site: 'https://ulusoyeu.github.io',
  trailingSlash: 'always',
  markdown: {
    processor: satteri({ features: { math: true }, mdastPlugins: [katexPlugin] }),
  },
});
