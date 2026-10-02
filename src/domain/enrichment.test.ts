import { describe, expect, it } from 'vitest';
import { enrichItem, enrichmentFieldsFor, isEmptyEnrichment, normaliseUrl } from './enrichment';
import type { Item } from './types';

const base = (over: Partial<Item> = {}): Item => ({
  id: 'i1',
  text: 'send the plan',
  type: 'task',
  originMeetingId: 'm1',
  projectIds: [],
  people: [],
  state: 'open',
  updates: [],
  flags: [],
  pinned: false,
  externalLinks: [],
  createdAt: '2026-10-01T10:00:00.000Z',
  touchedAt: '2026-10-01T10:00:00.000Z',
  ...over,
});
const ctx = { selfId: 'me', madeOn: '2026-09-22' };

describe('enrichItem', () => {
  it('returns an empty patch when nothing is filled in', () => {
    expect(enrichItem(base(), {}, ctx)).toEqual({});
    expect(isEmptyEnrichment({ dueBy: '  ', linkUrl: 'nonsense', effortMinutes: 0 })).toBe(true);
  });

  it('sets owner and recipient, promoting people who were only involved', () => {
    const item = base({ people: [{ personId: 'sam', role: 'involved' }, { personId: 'priya', role: 'involved' }] });
    const patch = enrichItem(item, { ownerId: 'sam', recipientId: 'priya' }, ctx);
    expect(patch.people).toEqual([
      { personId: 'sam', role: 'owner' },
      { personId: 'priya', role: 'recipient' },
    ]);
  });

  it('replaces an earlier owner rather than adding a second one', () => {
    const item = base({ people: [{ personId: 'sam', role: 'owner' }] });
    const patch = enrichItem(item, { ownerId: 'priya' }, ctx);
    expect(patch.people).toEqual([{ personId: 'priya', role: 'owner' }]);
  });

  it('keeps reportedBackAt when the same recipient is chosen again', () => {
    const link = { personId: 'sam', role: 'recipient' as const, reportedBackAt: '2026-10-02T00:00:00.000Z' };
    const patch = enrichItem(base({ people: [link] }), { recipientId: 'sam' }, ctx);
    expect(patch.people).toEqual([link]);
  });

  it('records a commitment to the recipient, with Me as owner and madeOn from the meeting', () => {
    const patch = enrichItem(base(), { recipientId: 'sam', told: true }, ctx);
    expect(patch.commitment).toEqual({ toPersonId: 'sam', madeOn: '2026-09-22' });
    expect(patch.people).toEqual(expect.arrayContaining([
      { personId: 'me', role: 'owner' },
      { personId: 'sam', role: 'recipient' },
    ]));
  });

  it('overrides a chosen owner when "I told" is ticked, since you are the one doing it', () => {
    const patch = enrichItem(base(), { ownerId: 'priya', recipientId: 'sam', told: true }, ctx);
    expect(patch.people?.find((l) => l.role === 'owner')?.personId).toBe('me');
  });

  it('ignores "I told" when no recipient is chosen', () => {
    expect(enrichItem(base(), { told: true }, ctx)).toEqual({});
  });

  it('sets due date, importance and rounded effort; ignores a non-positive effort', () => {
    expect(enrichItem(base(), { dueBy: '2026-10-09', importance: 'high', effortMinutes: 24.6 }, ctx)).toEqual({
      dueBy: '2026-10-09',
      importance: 'high',
      effortMinutes: 25,
    });
    expect(enrichItem(base(), { effortMinutes: -5 }, ctx)).toEqual({});
  });

  it('adds an external link once, with an optional label, never replacing existing ones', () => {
    const item = base({ externalLinks: [{ url: 'https://tracker.test/1', label: 'Existing' }] });
    const patch = enrichItem(item, { linkUrl: 'https://tracker.test/2', linkLabel: ' Build pages ' }, ctx);
    expect(patch.externalLinks).toEqual([
      { url: 'https://tracker.test/1', label: 'Existing' },
      { url: 'https://tracker.test/2', label: 'Build pages' },
    ]);
    expect(enrichItem(item, { linkUrl: 'https://tracker.test/1' }, ctx).externalLinks).toBeUndefined();
  });

  it('does not mutate the item', () => {
    const item = base({ people: [{ personId: 'sam', role: 'involved' }] });
    const copy = structuredClone(item);
    enrichItem(item, { ownerId: 'sam', linkUrl: 'https://tracker.test/x' }, ctx);
    expect(item).toEqual(copy);
  });
});

describe('normaliseUrl', () => {
  it('accepts http and https only', () => {
    expect(normaliseUrl('https://tracker.test/a')).toBe('https://tracker.test/a');
    expect(normaliseUrl(' http://tracker.test ')).toBe('http://tracker.test');
    expect(normaliseUrl('javascript:alert(1)')).toBeUndefined();
    expect(normaliseUrl('tracker.test/a')).toBeUndefined();
    expect(normaliseUrl('')).toBeUndefined();
    expect(normaliseUrl(undefined)).toBeUndefined();
  });
});

describe('enrichmentFieldsFor', () => {
  it('offers notes only importance and a link, and tasks and questions everything', () => {
    expect(enrichmentFieldsFor('note')).toEqual(['importance', 'link']);
    expect(enrichmentFieldsFor('task')).toContain('told');
    expect(enrichmentFieldsFor('question')).toContain('owner');
  });
});
