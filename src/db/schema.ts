import Dexie, { type Table } from 'dexie';
import type { DraftRow, Item, Meeting, Person, Project } from '../domain';

/** Uncommitted capture rows for one meeting; removed when the rows are committed. */
export interface DraftRecord {
  meetingId: string;
  rows: DraftRow[];
  updatedAt: string;
}

export const SCHEMA_VERSION = 1;

export class LedgerDB extends Dexie {
  people!: Table<Person, string>;
  projects!: Table<Project, string>;
  meetings!: Table<Meeting, string>;
  items!: Table<Item, string>;
  drafts!: Table<DraftRecord, string>;

  constructor(name = 'promise-ledger') {
    super(name);
    // Add a new version(n) block for every schema change; never edit a released one (SPEC section 7).
    // Link fields (Item.people, projectIds) are deliberately not indexed: lens queries are pure
    // functions over loaded arrays (see DECISIONS.md).
    this.version(1).stores({
      people: 'id',
      projects: 'id',
      meetings: 'id, date, status',
      items: 'id, state, originMeetingId, parentId',
      drafts: 'meetingId',
    });
  }
}
