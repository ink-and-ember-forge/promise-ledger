export interface Named {
  id: string;
  name: string;
}

export type MatchResult =
  | { kind: 'none' }
  | { kind: 'unique'; id: string }
  | { kind: 'ambiguous'; ids: string[] };

const normalise = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Case- and accent-insensitive match of an @Name / #Project token against existing records.
 * Tiers, first one with any hit decides: exact full name, exact word of the name, name or word prefix.
 * One hit in the deciding tier links; several are ambiguous (the UI asks); none offers "create".
 * Callers pass only non-deleted candidates.
 */
export function matchName(query: string, candidates: readonly Named[]): MatchResult {
  const q = normalise(query);
  if (!q) return { kind: 'none' };

  const prepared = candidates.map((c) => {
    const full = normalise(c.name);
    return { id: c.id, full, words: full.split(' ') };
  });

  const tiers: Array<(p: (typeof prepared)[number]) => boolean> = [
    (p) => p.full === q,
    (p) => p.words.includes(q),
    (p) => p.full.startsWith(q) || p.words.some((w) => w.startsWith(q)),
  ];

  for (const hit of tiers) {
    const ids = prepared.filter(hit).map((p) => p.id);
    if (ids.length === 1) return { kind: 'unique', id: ids[0]! };
    if (ids.length > 1) return { kind: 'ambiguous', ids };
  }
  return { kind: 'none' };
}
