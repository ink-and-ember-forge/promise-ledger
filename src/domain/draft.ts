import { matchName, type Named } from './matchName';
import { parseLine } from './parseLine';
import type { ItemType, Meeting } from './types';

/** One editable row in the capture screen. */
export interface DraftRow {
  text: string;
  type: ItemType;
  personIds: string[];
  projectIds: string[];
}

/** Mentions the row could not link on its own; the UI offers a pick list or "create". */
export interface UnresolvedMention {
  name: string;
  candidateIds: string[];
}

export interface ResolvedDraft {
  row: DraftRow;
  unresolvedPeople: UnresolvedMention[];
  unresolvedProjects: UnresolvedMention[];
}

const unique = <T>(xs: T[]) => [...new Set(xs)];

/** One draft per non-empty line, with deterministic type shortcuts and mention matching. */
export function splitDraftRows(
  raw: string,
  people: readonly Named[],
  projects: readonly Named[],
): ResolvedDraft[] {
  const drafts: ResolvedDraft[] = [];

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parsed = parseLine(line);
    if (!parsed.text) continue; // a bare "?" or "T:" is not an item

    const personIds: string[] = [];
    const projectIds: string[] = [];
    const unresolvedPeople: UnresolvedMention[] = [];
    const unresolvedProjects: UnresolvedMention[] = [];

    const link = (
      mentions: string[],
      pool: readonly Named[],
      ids: string[],
      unresolved: UnresolvedMention[],
    ) => {
      for (const name of mentions) {
        const m = matchName(name, pool);
        if (m.kind === 'unique') ids.push(m.id);
        else unresolved.push({ name, candidateIds: m.kind === 'ambiguous' ? m.ids : [] });
      }
    };
    link(parsed.personMentions, people, personIds, unresolvedPeople);
    link(parsed.projectMentions, projects, projectIds, unresolvedProjects);

    drafts.push({
      row: { text: parsed.text, type: parsed.type, personIds: unique(personIds), projectIds: unique(projectIds) },
      unresolvedPeople,
      unresolvedProjects,
    });
  }
  return drafts;
}

export interface ApplyAllTarget {
  projectId?: string;
  personId?: string;
}

/** The one-click "apply to all rows" offer: exactly one project, or exactly one non-self attendee. */
export function applyAllTarget(
  meeting: Pick<Meeting, 'attendeeIds' | 'projectIds'>,
  selfId: string | undefined,
): ApplyAllTarget {
  const target: ApplyAllTarget = {};
  if (meeting.projectIds.length === 1) target.projectId = meeting.projectIds[0];
  const others = meeting.attendeeIds.filter((id) => id !== selfId);
  if (others.length === 1) target.personId = others[0];
  return target;
}

/** Adds the target to every row, without duplicating tags a row already has. */
export function applyToAll(rows: readonly DraftRow[], target: ApplyAllTarget): DraftRow[] {
  return rows.map((r) => ({
    ...r,
    personIds: target.personId ? unique([...r.personIds, target.personId]) : r.personIds,
    projectIds: target.projectId ? unique([...r.projectIds, target.projectId]) : r.projectIds,
  }));
}
