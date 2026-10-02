import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DraftRow } from '../domain';
import { Repo } from './repo';
import { LedgerDB } from './schema';

let n = 0;
let clock = 0;
let repo: Repo;

beforeEach(() => {
  clock = 0;
  repo = new Repo(new LedgerDB(`test-${n++}`), {
    newId: () => `id-${++clock}`,
    now: () => new Date(Date.UTC(2026, 9, 1, 12, 0, clock++)).toISOString(),
  });
});

const row = (text: string, over: Partial<DraftRow> = {}): DraftRow => ({
  text,
  type: 'note',
  personIds: [],
  projectIds: [],
  ...over,
});

describe('self person', () => {
  it('creates Me once and is idempotent', async () => {
    const a = await repo.ensureSelf();
    const b = await repo.ensureSelf();
    expect(b.id).toBe(a.id);
    expect((await repo.listPeople()).filter((p) => p.isSelf)).toHaveLength(1);
  });

  it('cannot be removed', async () => {
    const me = await repo.ensureSelf();
    await expect(repo.softDeletePerson(me.id)).rejects.toThrow(/cannot be removed/);
  });
});

describe('people, projects and meetings', () => {
  it('requires a name or title', async () => {
    await expect(repo.createPerson({ name: '  ' })).rejects.toThrow();
    await expect(repo.createProject({ name: '' })).rejects.toThrow();
    await expect(repo.createMeeting({ title: ' ', date: '2026-10-01', kind: 'team' })).rejects.toThrow();
  });

  it('soft-deletes without removing the record', async () => {
    const p = await repo.createPerson({ name: 'Sam' });
    await repo.softDeletePerson(p.id);
    expect(await repo.listPeople()).toEqual([]);
    expect((await repo.db.people.get(p.id))?.deletedAt).toBeDefined();
  });

  it('soft-deleting a person or project does not orphan items', async () => {
    const sam = await repo.createPerson({ name: 'Sam' });
    const atlas = await repo.createProject({ name: 'Atlas' });
    const m = await repo.createMeeting({ title: 'Sync', date: '2026-10-01', kind: 'project' });
    await repo.commitDraft(m.id, [row('x', { personIds: [sam.id], projectIds: [atlas.id] })]);
    await repo.softDeletePerson(sam.id);
    await repo.softDeleteProject(atlas.id);
    expect(await repo.listItems()).toHaveLength(1);
  });
});

describe('capture: rawNotes, drafts and commit', () => {
  it('keeps rawNotes verbatim', async () => {
    const m = await repo.createMeeting({ title: 'Sync', date: '2026-10-01', kind: 'team' });
    await repo.saveRawNotes(m.id, '? one\n\nT: two');
    expect((await repo.db.meetings.get(m.id))?.rawNotes).toBe('? one\n\nT: two');
  });

  it('persists drafts and lists the meeting as still to sort', async () => {
    const m = await repo.createMeeting({ title: 'Sync', date: '2026-10-01', kind: 'team' });
    expect(await repo.meetingsStillToSort()).toEqual([]);
    await repo.saveDraft(m.id, [row('one'), row('two', { type: 'task' })]);
    expect((await repo.getDraft(m.id))?.map((r) => r.text)).toEqual(['one', 'two']);
    expect((await repo.meetingsStillToSort()).map((x) => x.id)).toEqual([m.id]);
  });

  it('commit creates items with origin set, then clears the draft', async () => {
    const sam = await repo.createPerson({ name: 'Sam' });
    const m = await repo.createMeeting({ title: 'Sync', date: '2026-10-01', kind: 'team' });
    const rows = [row('ask Sam', { type: 'task', personIds: [sam.id] }), row('a note')];
    await repo.saveDraft(m.id, rows);
    const items = await repo.commitDraft(m.id, rows);

    expect(items).toHaveLength(2);
    expect(items.every((i) => i.originMeetingId === m.id && i.state === 'open')).toBe(true);
    expect(items[0]!.people).toEqual([{ personId: sam.id, role: 'involved' }]);
    expect(await repo.getDraft(m.id)).toBeUndefined();
    expect(await repo.meetingsStillToSort()).toEqual([]);
    expect((await repo.itemsForMeeting(m.id)).map((i) => i.text).sort()).toEqual(['a note', 'ask Sam']);
  });

  it('saves unassociated rows (they surface later under "Needs a home")', async () => {
    const m = await repo.createMeeting({ title: 'Sync', date: '2026-10-01', kind: 'team' });
    const [item] = await repo.commitDraft(m.id, [row('floating thought')]);
    expect(item!.projectIds).toEqual([]);
    expect(item!.people).toEqual([]);
  });

  it('is all-or-nothing: an invalid row writes nothing and keeps the draft', async () => {
    const m = await repo.createMeeting({ title: 'Sync', date: '2026-10-01', kind: 'team' });
    const rows = [row('fine'), row('   ')];
    await repo.saveDraft(m.id, rows);
    await expect(repo.commitDraft(m.id, rows)).rejects.toThrow(/needs text/);
    expect(await repo.listItems()).toEqual([]);
    expect(await repo.getDraft(m.id)).toHaveLength(2);
  });
});

describe('items', () => {
  it('updates touchedAt on edit and on adding an update', async () => {
    const m = await repo.createMeeting({ title: 'Sync', date: '2026-10-01', kind: 'team' });
    const [item] = await repo.commitDraft(m.id, [row('thing', { type: 'task' })]);
    const t0 = item!.touchedAt;

    await repo.updateItem(item!.id, { importance: 'high' });
    const t1 = (await repo.db.items.get(item!.id))!.touchedAt;
    expect(t1 > t0).toBe(true);

    await repo.addItemUpdate(item!.id, 'As of 1 Oct: in review');
    const after = (await repo.db.items.get(item!.id))!;
    expect(after.touchedAt > t1).toBe(true);
    expect(after.updates.map((u) => u.text)).toEqual(['As of 1 Oct: in review']);
  });

  it('hides soft-deleted items from lists', async () => {
    const m = await repo.createMeeting({ title: 'Sync', date: '2026-10-01', kind: 'team' });
    const [item] = await repo.commitDraft(m.id, [row('gone')]);
    await repo.softDeleteItem(item!.id);
    expect(await repo.listItems()).toEqual([]);
    expect(await repo.itemsForMeeting(m.id)).toEqual([]);
  });
});
