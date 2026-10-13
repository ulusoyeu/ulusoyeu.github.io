import { defineCollection } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { z } from 'astro/zod';
import { bibtexLoader } from './lib/bibtex-loader';

// Every collection is plain files in src/content/. See GUIDE.md for how to add entries.

const about = defineCollection({
  loader: glob({ pattern: 'about.md', base: './src/content' }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      role: z.string(),
      affiliation: z.string().optional(),
      email: z.string(),
      github: z.string(),
      linkedin: z.url().optional(),
      scholar: z.url().optional(),
      photo: image(),
      photoAlt: z.string(),
    }),
});

const publications = defineCollection({
  loader: bibtexLoader('./src/content/publications.bib'),
  schema: z.object({
    type: z.string(),
    title: z.string(),
    authors: z.array(z.object({ first: z.string(), last: z.string() })),
    year: z.number(),
    month: z.number().optional(),
    venue: z.string().optional(),
    abbr: z.string().optional(),
    selected: z.boolean(),
    volume: z.string().optional(),
    pages: z.string().optional(),
    doi: z.string().optional(),
    links: z.record(z.string(), z.string()),
    bibtex: z.string(),
  }),
});

const news = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/news' }),
  schema: z.object({ date: z.coerce.date() }),
});

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string(),
    draft: z.boolean().default(false),
  }),
});

const poetry = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/poetry' }),
  schema: z.object({ title: z.string(), date: z.coerce.date(), draft: z.boolean().default(false) }),
});

const photography = defineCollection({
  loader: file('./src/content/photography.yaml'),
  schema: ({ image }) =>
    z.object({ image: image(), alt: z.string(), caption: z.string().optional(), date: z.coerce.date() }),
});

const music = defineCollection({
  loader: file('./src/content/music.yaml'),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string().optional(),
    audio: z.string().optional(), // file in public/audio/, e.g. /audio/track.mp3
    link: z.url().optional(), // Bandcamp, SoundCloud, YouTube, …
  }),
});

export const collections = { about, publications, news, blog, poetry, photography, music };
