import { getCollection } from 'astro:content';

const byDateDesc = (a: { data: { date: Date } }, b: { data: { date: Date } }) =>
  b.data.date.valueOf() - a.data.date.valueOf();

// Drafts are visible with `npm run dev` but never published.
const published = ({ data }: { data: { draft?: boolean } }) => import.meta.env.DEV || !data.draft;

export const getPosts = async () => (await getCollection('blog', published)).sort(byDateDesc);
export const getPoems = async () => (await getCollection('poetry', published)).sort(byDateDesc);
export const getNews = async () => (await getCollection('news')).sort(byDateDesc);
export const getPhotos = async () => (await getCollection('photography')).sort(byDateDesc);
export const getMusic = async () => (await getCollection('music')).sort(byDateDesc);
export const getPublications = async () =>
  (await getCollection('publications')).sort(
    (a, b) => b.data.year - a.data.year || (b.data.month ?? 0) - (a.data.month ?? 0),
  );
