// Site-wide settings. Personal details (bio, email, photo) live in src/content/about.md.

export const SITE = {
  title: 'Emre Ulusoy',
  description: 'Research by Emre Ulusoy, mathematics PhD student at Imperial College London working on graph theory, topology and machine learning.',
  url: 'https://ulusoyeu.github.io',
  lang: 'en',
};

// Used to highlight your name in author lists. Matched against BibTeX last names.
export const ME = { lastName: 'Ulusoy' };

// Navigation. Add a page by creating it under src/pages/[...theme]/ and listing it here.
export const NAV = [
  { label: 'About', path: '/' },
  { label: 'Publications', path: '/publications/' },
  { label: 'Blog', path: '/blog/' },
  { label: 'Personal', path: '/personal/' },
];

// Each theme is one stylesheet in public/styles/. THEME is the one the site uses, built at /.
// Set THEME to undefined to compare them all again under /<theme>/ (and rename
// src/pages/_index.astro back to index.astro for the chooser). See "Themes" in GUIDE.md.
export const THEMES = ['tufte', 'al-folio', 'latex', 'manpage', 'swiss', '1997', 'blueprint'] as const;
export const THEME: (typeof THEMES)[number] | undefined = 'latex';
