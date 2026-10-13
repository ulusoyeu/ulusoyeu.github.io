// Loads src/content/publications.bib into the `publications` collection.
// Besides the standard BibTeX fields, these optional fields are understood (al-folio convention):
//   abbr      short venue badge, e.g. {NeurIPS}
//   selected  {true} to show the paper on the home page
//   pdf, code, html (project page), slides, poster   links (URL or /path in public/)
//   abstract  rendered as Markdown, so $math$ works
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Loader } from 'astro/loaders';
import { parse, parseVerbatim } from '@retorquere/bibtex-parser';

// Fields that only drive the website and are left out of the displayed BibTeX.
const SITE_FIELDS = ['abbr', 'selected', 'pdf', 'code', 'html', 'slides', 'poster', 'abstract'];

export function bibtexLoader(path: string): Loader {
  return {
    name: 'bibtex-loader',
    load: async ({ store, parseData, renderMarkdown, generateDigest, watcher, config, logger }) => {
      const file = fileURLToPath(new URL(path, config.root));

      async function sync() {
        const source = await readFile(file, 'utf-8');
        const { entries, errors } = parse(source, {
          sentenceCase: false, // keep titles exactly as written
          caseProtection: false,
          fieldMode: { abstract: 'verbatim' }, // rendered as Markdown + KaTeX below instead
        });
        const raw = new Map(parseVerbatim(source).entries.map((e) => [e.key, e]));
        errors.forEach((e) => logger.warn(`${path}: ${JSON.stringify(e)}`));

        store.clear();
        for (const entry of entries) {
          const f = entry.fields as Record<string, any>;
          const verbatim = raw.get(entry.key)?.fields ?? {};
          const bibtex =
            `@${entry.type}{${entry.key},\n` +
            Object.entries(verbatim)
              .filter(([k]) => !SITE_FIELDS.includes(k))
              .map(([k, v]) => `  ${k} = {${v}},`)
              .join('\n') +
            '\n}';

          const data = await parseData({
            id: entry.key,
            data: {
              type: entry.type,
              title: f.title ?? '',
              authors: (f.author ?? []).map((a: any) => ({
                first: a.firstName ?? '',
                last: [a.prefix, a.lastName ?? a.name].filter(Boolean).join(' '),
              })),
              year: Number(f.year),
              month: f.month ? Number(f.month) : undefined,
              venue: f.journal ?? f.booktitle ?? f.school ?? f.publisher ?? f.howpublished,
              abbr: f.abbr,
              selected: f.selected === 'true',
              volume: f.volume,
              pages: f.pages,
              doi: f.doi,
              links: Object.fromEntries(
                ['pdf', 'code', 'html', 'slides', 'poster', 'url']
                  .filter((k) => f[k])
                  .map((k) => [k, f[k]]),
              ),
              bibtex,
            },
          });
          const abstract = verbatim.abstract ? await renderMarkdown(verbatim.abstract) : undefined;
          store.set({ id: entry.key, data, rendered: abstract, digest: generateDigest(entry.input) });
        }
      }

      await sync();
      watcher?.add(file);
      watcher?.on('change', (changed) => changed === file && sync());
    },
  };
}
