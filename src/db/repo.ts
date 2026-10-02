import type {
  DraftRow,
  Item,
  ItemPatch,
  ItemType,
  Meeting,
  Person,
  Project,
} from '../domain';
import { LedgerDB } from './schema';

export interface RepoOptions {
  now?: () => string;
  newId?: () => string;
}

const ITEM_TYPES: readonly ItemType[] = ['note', 'task', 'question'];

/** Typed access to the ledger. Every write goes through here so invariants hold in one place. */
export class Repo {
  readonly db: LedgerDB;
  private readonly now: () => string;
  private readonly newId: () => string;

  constructor(db: LedgerDB, opts: RepoOptions = {}) {
    this.db = db;
    this.now = opts.now ?? (() => new Date().toISOString());
    this.newId = opts.newId ?? (() => crypto.randomUUID());
  }

  // ---- People --------------------------------------------------------------

  /** Creates "Me" on first run. Exactly one person has isSelf = true (SPEC section 7). */
  async ensureSelf(): Promise<Person> {
    return this.db.transaction('rw', this.db.people, async () => {
      const existing = (await this.db.people.toArray()).find((p) => p.isSelf && !p.deletedAt);
      if (existing) return existing;
      const me: Person = { id: this.newId(), name: 'Me', isSelf: true, createdAt: this.now() };
      await this.db.people.add(me);
      return me;
    });
  }

  async createPerson(input: { name: string; roleDescription?: string }): Promise<Person> {
    const name = input.name.trim();
    if (!name) throw new Error('A person needs a name.');
    const person: Person = {
      id: this.newId(),
      name,
      isSelf: false,
      createdAt: this.now(),
      ...(input.roleDescription?.trim() ? { roleDescription: input.roleDescription.trim() } : {}),
    };
    await this.db.people.add(person);
    return person;
  }

  async updatePerson(id: string, patch: Partial<Pick<Person, 'name' | 'roleDescription'>>): Promise<void> {
    if (patch.name !== undefined && !patch.name.trim()) throw new Error('A person needs a name.');
    await this.db.people.update(id, { ...patch, ...(patch.name ? { name: patch.name.trim() } : {}) });
  }

  async softDeletePerson(id: string): Promise<void> {
    const p = await this.db.people.get(id);
    if (p?.isSelf) throw new Error('"Me" cannot be removed.');
    await this.db.people.update(id, { deletedAt: this.now() });
  }

  async listPeople(): Promise<Person[]> {
    return (await this.db.people.toArray()).filter((p) => !p.deletedAt);
  }

  // ---- Projects ------------------------------------------------------------

  async createProject(input: { name: string; purpose?: string }): Promise<Project> {
    const name = input.name.trim();
    if (!name) throw new Error('A project needs a name.');
    const project: Project = {
      id: this.newId(),
      name,
      status: 'active',
      createdAt: this.now(),
      ...(input.purpose?.trim() ? { purpose: input.purpose.trim() } : {}),
    };
    await this.db.projects.add(project);
    return project;
  }

  async updateProject(
    id: string,
    patch: Partial<Pick<Project, 'name' | 'purpose' | 'status'>>,
  ): Promise<void> {
    if (patch.name !== undefined && !patch.name.trim()) throw new Error('A project needs a name.');
    await this.db.projects.update(id, patch);
  }

  async softDeleteProject(id: string): Promise<void> {
    await this.db.projects.update(id, { deletedAt: this.now() });
  }

  async listProjects(): Promise<Project[]> {
    return (await this.db.projects.toArray()).filter((p) => !p.deletedAt);
  }

  // ---- Meetings ------------------------------------------------------------

  async createMeeting(
    input: Pick<Meeting, 'title' | 'date' | 'kind'> &
      Partial<Pick<Meeting, 'status' | 'attendeeIds' | 'projectIds'>>,
  ): Promise<Meeting> {
    const title = input.title.trim();
    if (!title) throw new Error('A meeting needs a title.');
    const meeting: Meeting = {
      id: this.newId(),
      title,
      date: input.date,
      kind: input.kind,
      status: input.status ?? 'held',
      attendeeIds: input.attendeeIds ?? [],
      projectIds: input.projectIds ?? [],
      createdAt: this.now(),
    };
    await this.db.meetings.add(meeting);
    return meeting;
  }

  async updateMeeting(
    id: string,
    patch: Partial<Pick<Meeting, 'title' | 'date' | 'kind' | 'status' | 'attendeeIds' | 'projectIds'>>,
  ): Promise<void> {
    if (patch.title !== undefined && !patch.title.trim()) throw new Error('A meeting needs a title.');
    await this.db.meetings.update(id, patch);
  }

  async softDeleteMeeting(id: string): Promise<void> {
    await this.db.meetings.update(id, { deletedAt: this.now() });
  }

  async listMeetings(): Promise<Meeting[]> {
    return (await this.db.meetings.toArray()).filter((m) => !m.deletedAt);
  }

  /** Autosave target for the pasted block; kept verbatim as provenance (SPEC 6.1 step 2). */
  async saveRawNotes(meetingId: string, rawNotes: string): Promise<void> {
    await this.db.meetings.update(meetingId, { rawNotes });
  }

  // ---- Drafts --------------------------------------------------------------

  async saveDraft(meetingId: string, rows: DraftRow[]): Promise<void> {
    await this.db.drafts.put({ meetingId, rows, updatedAt: this.now() });
  }

  async getDraft(meetingId: string): Promise<DraftRow[] | undefined> {
    return (await this.db.drafts.get(meetingId))?.rows;
  }

  async discardDraft(meetingId: string): Promise<void> {
    await this.db.drafts.delete(meetingId);
  }

  /** Meetings with uncommitted rows: the "still to sort" list on Today (SPEC 6.5). */
  async meetingsStillToSort(): Promise<Meeting[]> {
    const drafts = (await this.db.drafts.toArray()).filter((d) => d.rows.length > 0);
    const ids = new Set(drafts.map((d) => d.meetingId));
    return (await this.listMeetings()).filter((m) => ids.has(m.id));
  }

  // ---- Items ---------------------------------------------------------------

  private newItem(meetingId: string, row: DraftRow, at: string): Item {
    const text = row.text.trim();
    if (!text) throw new Error('An item needs text.');
    if (!ITEM_TYPES.includes(row.type)) throw new Error(`Unknown item type: ${String(row.type)}`);
    return {
      id: this.newId(),
      text,
      type: row.type,
      originMeetingId: meetingId,
      projectIds: [...row.projectIds],
      // Tagged people start as "involved"; the enrichment pass can make them owner or recipient.
      people: row.personIds.map((personId) => ({ personId, role: 'involved' as const })),
      state: 'open',
      updates: [],
      flags: [],
      pinned: false,
      externalLinks: [],
      createdAt: at,
      touchedAt: at,
    };
  }

  /**
   * Turns the rows into items and clears the draft in one transaction, so a crash can never
   * leave a half-committed meeting. Rows are validated before anything is written.
   */
  async commitDraft(meetingId: string, rows: DraftRow[]): Promise<Item[]> {
    const at = this.now();
    const items = rows.map((r) => this.newItem(meetingId, r, at));
    await this.db.transaction('rw', this.db.items, this.db.drafts, async () => {
      await this.db.items.bulkAdd(items);
      await this.db.drafts.delete(meetingId);
    });
    return items;
  }

  async listItems(): Promise<Item[]> {
    return (await this.db.items.toArray()).filter((i) => !i.deletedAt);
  }

  async itemsForMeeting(meetingId: string): Promise<Item[]> {
    return (await this.db.items.where('originMeetingId').equals(meetingId).toArray()).filter(
      (i) => !i.deletedAt,
    );
  }

  /** Any edit refreshes touchedAt, which powers "going stale" (SPEC section 7). */
  async updateItem(id: string, patch: ItemPatch): Promise<void> {
    await this.db.items.update(id, { ...patch, touchedAt: this.now() });
  }

  /** Applies several item patches in one transaction: all of them land, or none do. */
  async updateItems(entries: Array<{ id: string; patch: ItemPatch }>): Promise<void> {
    const at = this.now();
    await this.db.transaction('rw', this.db.items, async () => {
      for (const { id, patch } of entries) {
        const updated = await this.db.items.update(id, { ...patch, touchedAt: at });
        if (updated === 0) throw new Error('Item not found.');
      }
    });
  }

  async addItemUpdate(id: string, text: string): Promise<void> {
    const at = this.now();
    await this.db.transaction('rw', this.db.items, async () => {
      const item = await this.db.items.get(id);
      if (!item) throw new Error('Item not found.');
      await this.db.items.update(id, { updates: [...item.updates, { at, text }], touchedAt: at });
    });
  }

  async softDeleteItem(id: string): Promise<void> {
    await this.db.items.update(id, { deletedAt: this.now() });
  }
}
