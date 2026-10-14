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

// Art can be dated by a full date (2026-08-20), a month (2024-08), a year (2024), or a range of
// months or years (2024-08 to 2025-01, 2019-2021). It becomes `date` (a Date, for sorting; a range
// sorts by its end), and for partial dates `dateLabel` (what to show, e.g. "August 2024",
// "2019–2021") and `dateIso` (the machine-readable value, e.g. "2024-08").
type ArtDate = { date: Date; dateLabel?: string; dateIso?: string };
const PART = String.raw`(\d{4})(?:-(0[1-9]|1[0-2]))?`;
const PARTIAL = new RegExp(`^${PART}(?:\\s*(?:–|-|to)\\s*${PART})?$`);
const monthName = (y: number, m: number) =>
  new Date(Date.UTC(y, m - 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const artDate = z
  .union([z.date(), z.number().int(), z.string()])
  .transform((value, ctx): ArtDate => {
    if (value instanceof Date) return { date: value };
    const parts = String(value).trim().match(PARTIAL);
    if (parts) {
      const [, y1, m1, y2, m2] = parts;
      const label = (y: string, m?: string) => (m ? monthName(Number(y), Number(m)) : y);
      const iso = (y: string, m?: string) => (m ? `${y}-${m}` : y);
      const endY = y2 ?? y1, endM = y2 ? m2 : m1;
      return {
        date: new Date(Date.UTC(Number(endY), Number(endM ?? 1) - 1, 1)),
        dateLabel: y2 ? `${label(y1, m1)}${m1 || m2 ? ' – ' : '–'}${label(y2, m2)}` : label(y1, m1),
        dateIso: iso(y1, m1),
      };
    }
    const date = new Date(String(value));
    if (!isNaN(date.valueOf())) return { date };
    ctx.addIssue({ code: 'custom', message: 'Use a date (2026-08-20), a month (2024-08), a year (2024) or a range (2019-2021)' });
    return z.NEVER;
  });
const flattenDate = <T extends { date: ArtDate }>({ date, ...rest }: T) => ({ ...rest, ...date });

const poetry = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/poetry' }),
  schema: z
    .object({ title: z.string(), date: artDate, draft: z.boolean().default(false) })
    .transform(flattenDate),
});

const photography = defineCollection({
  loader: file('./src/content/photography.yaml'),
  schema: ({ image }) =>
    z
      .object({ image: image(), alt: z.string(), caption: z.string().optional(), date: artDate })
      .transform(flattenDate),
});

const music = defineCollection({
  loader: file('./src/content/music.yaml'),
  schema: z
    .object({
      title: z.string(),
      date: artDate,
      description: z.string().optional(),
      audio: z.string().optional(), // file in public/audio/, e.g. /audio/track.mp3
      link: z.url().optional(), // Bandcamp, SoundCloud, YouTube, …
    })
    .transform(flattenDate),
});

export const collections = { about, publications, news, blog, poetry, photography, music };
