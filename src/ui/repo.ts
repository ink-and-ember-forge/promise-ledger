import { LedgerDB, Repo } from '../db';

/** The one app-wide repo over the browser's IndexedDB. */
export const repo = new Repo(new LedgerDB());
