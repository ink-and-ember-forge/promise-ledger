import { describe, expect, it } from 'vitest';
import { matchName } from './matchName';

const people = [
  { id: 'sam', name: 'Sam' },
  { id: 'samantha', name: 'Samantha' },
  { id: 'jordan', name: 'Jordan Lee' },
  { id: 'priya', name: 'Priya Nair' },
  { id: 'alex-a', name: 'Alex Adams' },
  { id: 'alex-b', name: 'Alex Brown' },
  { id: 'zoe', name: 'Zoë Hart' },
];

describe('matchName', () => {
  it('matches case-insensitively on the full name', () => {
    expect(matchName('jordan lee', people)).toEqual({ kind: 'unique', id: 'jordan' });
  });

  it('exact name beats longer prefix matches', () => {
    expect(matchName('Sam', people)).toEqual({ kind: 'unique', id: 'sam' });
  });

  it('matches a first or last name word', () => {
    expect(matchName('Priya', people)).toEqual({ kind: 'unique', id: 'priya' });
    expect(matchName('nair', people)).toEqual({ kind: 'unique', id: 'priya' });
  });

  it('matches a unique prefix', () => {
    expect(matchName('Jord', people)).toEqual({ kind: 'unique', id: 'jordan' });
  });

  it('reports ambiguity instead of guessing', () => {
    const r = matchName('Alex', people);
    expect(r.kind).toBe('ambiguous');
    if (r.kind === 'ambiguous') expect(r.ids.sort()).toEqual(['alex-a', 'alex-b']);
  });

  it('is accent-insensitive', () => {
    expect(matchName('zoe', people)).toEqual({ kind: 'unique', id: 'zoe' });
    expect(matchName('Zoë', people)).toEqual({ kind: 'unique', id: 'zoe' });
  });

  it('treats underscores and hyphens in tags as spaces', () => {
    const projects = [{ id: 'rp', name: 'Release planning' }];
    expect(matchName('Release_planning', projects)).toEqual({ kind: 'unique', id: 'rp' });
  });

  it('returns none for no match or empty query', () => {
    expect(matchName('Morgan', people)).toEqual({ kind: 'none' });
    expect(matchName('  ', people)).toEqual({ kind: 'none' });
    expect(matchName('Sam', [])).toEqual({ kind: 'none' });
  });
});
