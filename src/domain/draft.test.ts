import { describe, expect, it } from 'vitest';
import { applyAllTarget, applyToAll, splitDraftRows, type DraftRow } from './draft';

const people = [
  { id: 'me', name: 'Me' },
  { id: 'sam', name: 'Sam' },
  { id: 'alex-a', name: 'Alex Adams' },
  { id: 'alex-b', name: 'Alex Brown' },
];
const projects = [{ id: 'atlas', name: 'Atlas' }];

describe('splitDraftRows', () => {
  it('makes one row per non-empty line and skips blanks and bare prefixes', () => {
    const rows = splitDraftRows('first\n\n   \n? \nsecond\r\nT: third', people, projects);
    expect(rows.map((r) => r.row.text)).toEqual(['first', 'second', 'third']);
    expect(rows.map((r) => r.row.type)).toEqual(['note', 'note', 'task']);
  });

  it('links unambiguous mentions', () => {
    const [d] = splitDraftRows('T: ask @Sam about #Atlas', people, projects);
    expect(d!.row.personIds).toEqual(['sam']);
    expect(d!.row.projectIds).toEqual(['atlas']);
    expect(d!.unresolvedPeople).toEqual([]);
  });

  it('keeps ambiguous and unknown mentions unresolved, with candidates for the pick list', () => {
    const [d] = splitDraftRows('? is @Alex or @Morgan on #Beacon', people, projects);
    expect(d!.row.personIds).toEqual([]);
    expect(d!.unresolvedPeople).toEqual([
      { name: 'Alex', candidateIds: ['alex-a', 'alex-b'] },
      { name: 'Morgan', candidateIds: [] },
    ]);
    expect(d!.unresolvedProjects).toEqual([{ name: 'Beacon', candidateIds: [] }]);
  });

  it('does not tag the same person twice', () => {
    const [d] = splitDraftRows('@Sam and @sam again', people, projects);
    expect(d!.row.personIds).toEqual(['sam']);
  });

  it('returns nothing for empty input', () => {
    expect(splitDraftRows('', people, projects)).toEqual([]);
  });
});

describe('applyAllTarget / applyToAll', () => {
  it('offers the single project and the single non-self attendee', () => {
    expect(applyAllTarget({ attendeeIds: ['me', 'sam'], projectIds: ['atlas'] }, 'me')).toEqual({
      projectId: 'atlas',
      personId: 'sam',
    });
  });

  it('offers nothing when there are several of each', () => {
    expect(applyAllTarget({ attendeeIds: ['me', 'sam', 'alex-a'], projectIds: ['a', 'b'] }, 'me')).toEqual({});
  });

  it('applies the target to every row without duplicating existing tags', () => {
    const rows: DraftRow[] = [
      { text: 'a', type: 'note', personIds: [], projectIds: [] },
      { text: 'b', type: 'task', personIds: ['sam'], projectIds: ['atlas'] },
    ];
    const out = applyToAll(rows, { personId: 'sam', projectId: 'atlas' });
    expect(out.map((r) => r.personIds)).toEqual([['sam'], ['sam']]);
    expect(out.map((r) => r.projectIds)).toEqual([['atlas'], ['atlas']]);
    expect(rows[0]!.personIds).toEqual([]); // input not mutated
  });
});
