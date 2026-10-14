import { THEMES, THEME } from '../config';

// Build-time params: every page once per theme while comparing, or once at / when THEME is set.
export function themePaths<P extends Record<string, string>, T = undefined>(
  items: { params: P; props?: T }[] = [{ params: {} as P }],
) {
  const themes = THEME ? [undefined] : THEMES;
  return themes.flatMap((theme) =>
    items.map(({ params, props }) => ({ params: { ...params, theme }, props })),
  );
}

// Internal link that stays inside the current theme.
export function href(theme: string | undefined, path: string) {
  return (theme ? `/${theme}` : '') + path;
}

// Text and machine-readable value for a <time> element. Partial dates such as a month,
// a year or a range (`dateLabel`, see artDate in content.config.ts) are shown as written.
export function displayDate(data: { date: Date; dateLabel?: string; dateIso?: string }, style: 'long' | 'short' = 'long') {
  return data.dateLabel
    ? { label: data.dateLabel, iso: data.dateIso ?? String(data.date.getUTCFullYear()) }
    : { label: formatDate(data.date, style), iso: data.date.toISOString() };
}

export function formatDate(date: Date, style: 'long' | 'short' = 'long') {
  return date.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: style === 'long' ? 'long' : 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
