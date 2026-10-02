import type { Item, ItemType } from './types';

/** Optional details added in the post-capture pass. Every field may be left blank. */
export interface Enrichment {
  ownerId?: string;
  recipientId?: string;
  /** "I told [recipient] I'd do this": needs a recipient, and makes "Me" the owner. */
  told?: boolean;
  dueBy?: string;
  importance?: 'low' | 'normal' | 'high';
  effortMinutes?: number;
  linkUrl?: string;
  linkLabel?: string;
}

export type ItemPatch = Partial<Omit<Item, 'id' | 'createdAt' | 'touchedAt'>>;

export interface EnrichmentContext {
  selfId?: string;
  /** Defaults a commitment's madeOn to the origin meeting's date (SPEC section 2). */
  madeOn: string;
}

export type EnrichmentField = 'owner' | 'recipient' | 'told' | 'dueBy' | 'importance' | 'effort' | 'link';

/** Which fields the pass offers for each item type. Notes only get importance and a link. */
export function enrichmentFieldsFor(type: ItemType): readonly EnrichmentField[] {
  return type === 'note'
    ? ['importance', 'link']
    : ['owner', 'recipient', 'told', 'dueBy', 'importance', 'effort', 'link'];
}

/** Returns the http(s) URL as written, or undefined for blanks and anything else (e.g. javascript:). */
export function normaliseUrl(input: string | undefined): string | undefined {
  const s = input?.trim();
  if (!s) return undefined;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? s : undefined;
  } catch {
    return undefined;
  }
}

const positiveMinutes = (n: number | undefined) =>
  n !== undefined && Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;

export function isEmptyEnrichment(e: Enrichment): boolean {
  return (
    !e.ownerId &&
    !e.recipientId &&
    !e.told &&
    !e.dueBy?.trim() &&
    !e.importance &&
    positiveMinutes(e.effortMinutes) === undefined &&
    !normaliseUrl(e.linkUrl)
  );
}

/**
 * Turns the form values into a patch for the item. Only what was filled in is touched, so
 * leaving a field blank never erases something already there.
 */
export function enrichItem(item: Item, e: Enrichment, ctx: EnrichmentContext): ItemPatch {
  const patch: ItemPatch = {};
  let people = item.people;

  // A chosen person takes the role exclusively and stops being merely "involved".
  const assign = (personId: string, role: 'owner' | 'recipient') => {
    const already = people.some((l) => l.personId === personId && l.role === role);
    const existing = people.find((l) => l.personId === personId && l.role === role);
    people = people.filter((l) => l.role !== role && !(l.personId === personId && l.role === 'involved'));
    people = [...people, already && existing ? existing : { personId, role }];
  };

  const told = Boolean(e.told && e.recipientId);
  const ownerId = told ? ctx.selfId : e.ownerId;
  if (ownerId) assign(ownerId, 'owner');
  if (e.recipientId) assign(e.recipientId, 'recipient');
  if (people !== item.people) patch.people = people;

  if (told && e.recipientId) patch.commitment = { toPersonId: e.recipientId, madeOn: ctx.madeOn };

  const due = e.dueBy?.trim();
  if (due) patch.dueBy = due;
  if (e.importance) patch.importance = e.importance;
  const effort = positiveMinutes(e.effortMinutes);
  if (effort !== undefined) patch.effortMinutes = effort;

  const url = normaliseUrl(e.linkUrl);
  if (url && !item.externalLinks.some((l) => l.url === url)) {
    const label = e.linkLabel?.trim();
    patch.externalLinks = [...item.externalLinks, label ? { url, label } : { url }];
  }
  return patch;
}
