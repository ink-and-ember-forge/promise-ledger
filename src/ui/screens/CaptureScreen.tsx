import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  applyAllTarget,
  applyToAll,
  cycleType,
  emptyRow,
  splitDraftRows,
  toDraftRow,
  type DraftRow,
  type Item,
  type ItemType,
  type Person,
  type Project,
  type UnresolvedMention,
} from '../../domain';
import { repo } from '../repo';
import { EnrichmentPass } from './EnrichmentPass';

const TYPE_LABEL: Record<ItemType, string> = { note: 'Note', task: 'Task', question: 'Question' };
const SAVE_DELAY_MS = 250;

type Stage = 'loading' | 'paste' | 'rows' | 'enrich' | 'done';

const nameOf = (pool: Array<{ id: string; name: string }>, id: string) => pool.find((x) => x.id === id)?.name;

interface RowProps {
  index: number;
  row: DraftRow;
  people: Person[];
  projects: Project[];
  inputRef: (el: HTMLInputElement | null) => void;
  onChange: (next: DraftRow) => void;
  onRemove: () => void;
  onEnter: () => void;
}

function DraftRowEditor({ index, row, people, projects, inputRef, onChange, onRemove, onEnter }: RowProps) {
  const n = index + 1;

  function onTextKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.altKey && e.key.toLowerCase() === 't') {
      e.preventDefault();
      onChange({ ...row, type: cycleType(row.type) });
    } else if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      onEnter();
    }
  }

  async function resolve(kind: 'people' | 'projects', m: UnresolvedMention, choice: string | 'create' | 'skip') {
    let id: string | undefined;
    if (choice === 'create') {
      id = kind === 'people' ? (await repo.createPerson({ name: m.name })).id : (await repo.createProject({ name: m.name })).id;
    } else if (choice !== 'skip') {
      id = choice;
    }
    const remaining = {
      people: row.unresolved?.people ?? [],
      projects: row.unresolved?.projects ?? [],
    };
    remaining[kind] = remaining[kind].filter((x) => x !== m);
    const open = remaining.people.length > 0 || remaining.projects.length > 0;
    const { unresolved: _drop, ...rest } = row;
    void _drop;
    onChange({
      ...rest,
      personIds: kind === 'people' && id && !row.personIds.includes(id) ? [...row.personIds, id] : row.personIds,
      projectIds: kind === 'projects' && id && !row.projectIds.includes(id) ? [...row.projectIds, id] : row.projectIds,
      ...(open ? { unresolved: remaining } : {}),
    });
  }

  function addTag(value: string) {
    const [kind, id] = value.split(':') as ['p' | 'j', string];
    if (kind === 'p' && !row.personIds.includes(id)) onChange({ ...row, personIds: [...row.personIds, id] });
    if (kind === 'j' && !row.projectIds.includes(id)) onChange({ ...row, projectIds: [...row.projectIds, id] });
  }

  const unresolved = [
    ...(row.unresolved?.people ?? []).map((m) => ({ kind: 'people' as const, m })),
    ...(row.unresolved?.projects ?? []).map((m) => ({ kind: 'projects' as const, m })),
  ];

  return (
    <li className="draft" aria-label={`Row ${n}`}>
      <div className="draft-main">
        <input
          ref={inputRef}
          aria-label={`Row ${n} text`}
          value={row.text}
          onChange={(e) => onChange({ ...row, text: e.target.value })}
          onKeyDown={onTextKey}
        />
        <select
          aria-label={`Row ${n} type`}
          value={row.type}
          onChange={(e) => onChange({ ...row, type: e.target.value as ItemType })}
        >
          {(Object.keys(TYPE_LABEL) as ItemType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <select aria-label={`Add a tag to row ${n}`} value="" onChange={(e) => addTag(e.target.value)}>
          <option value="">Tag…</option>
          <optgroup label="People">
            {people.map((p) => (
              <option key={p.id} value={`p:${p.id}`}>
                {p.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Projects">
            {projects.map((p) => (
              <option key={p.id} value={`j:${p.id}`}>
                {p.name}
              </option>
            ))}
          </optgroup>
        </select>
        <button type="button" onClick={onRemove} aria-label={`Remove row ${n}`}>
          Remove
        </button>
      </div>
      {(row.personIds.length > 0 || row.projectIds.length > 0) && (
        <div className="tags" aria-label={`Row ${n} tags`}>
          {row.personIds.map((id) => nameOf(people, id) && <span key={id} className="tag">@{nameOf(people, id)}</span>)}
          {row.projectIds.map((id) => nameOf(projects, id) && <span key={id} className="tag">#{nameOf(projects, id)}</span>)}
        </div>
      )}
      {unresolved.map(({ kind, m }) => {
        const pool = kind === 'people' ? people : projects;
        const sigil = kind === 'people' ? '@' : '#';
        return (
          <div key={`${kind}-${m.name}`} className="unresolved">
            <span>
              {sigil}
              {m.name}: {m.candidateIds.length > 0 ? 'which one?' : 'not in your list yet.'}
            </span>
            {m.candidateIds.map((id) => (
              <button key={id} type="button" onClick={() => void resolve(kind, m, id)}>
                {nameOf(pool, id)}
              </button>
            ))}
            <button type="button" onClick={() => void resolve(kind, m, 'create')}>
              Add {m.name}
            </button>
            <button type="button" onClick={() => void resolve(kind, m, 'skip')}>
              Leave untagged
            </button>
          </div>
        );
      })}
    </li>
  );
}

export function CaptureScreen({ meetingId }: { meetingId: string }) {
  const meeting = useLiveQuery(() => repo.db.meetings.get(meetingId), [meetingId]);
  const people = useLiveQuery(() => repo.listPeople(), []);
  const projects = useLiveQuery(() => repo.listProjects(), []);

  const [stage, setStage] = useState<Stage>('loading');
  const [raw, setRaw] = useState('');
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [saved, setSaved] = useState<Item[]>([]);
  const [detailsAdded, setDetailsAdded] = useState(0);
  const [message, setMessage] = useState('');

  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const focusIndex = useRef<number | null>(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  // Restore whatever was left unsorted, so closing the tab mid-capture loses nothing.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [m, draft, existing] = await Promise.all([
        repo.db.meetings.get(meetingId),
        repo.getDraft(meetingId),
        repo.itemsForMeeting(meetingId),
      ]);
      if (cancelled) return;
      if (draft && draft.length > 0) {
        setRows(draft);
        setStage('rows');
      } else {
        setRaw(existing.length === 0 ? (m?.rawNotes ?? '') : '');
        setStage('paste');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  // Autosave the pasted block (verbatim) and the draft rows.
  useEffect(() => {
    if (stage !== 'paste') return;
    const t = setTimeout(() => void repo.saveRawNotes(meetingId, raw), SAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [raw, stage, meetingId]);

  useEffect(() => {
    if (stage !== 'rows') return;
    const t = setTimeout(() => void repo.saveDraft(meetingId, rows), SAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [rows, stage, meetingId]);

  // Flush straight away when the page is hidden or closed, rather than waiting for the debounce.
  useEffect(() => {
    if (stage !== 'rows') return;
    const flush = () => {
      if (document.visibilityState === 'hidden') void repo.saveDraft(meetingId, rowsRef.current);
    };
    document.addEventListener('visibilitychange', flush);
    return () => document.removeEventListener('visibilitychange', flush);
  }, [stage, meetingId]);

  useEffect(() => {
    if (focusIndex.current !== null) {
      inputs.current[focusIndex.current]?.focus();
      focusIndex.current = null;
    }
  });

  const setRow = useCallback((i: number, next: DraftRow) => setRows((rs) => rs.map((r, k) => (k === i ? next : r))), []);

  if (!meeting || !people || !projects || stage === 'loading') return null;

  async function sortIntoRows() {
    const drafts = splitDraftRows(raw, people!, projects!).map(toDraftRow);
    if (drafts.length === 0) {
      setMessage('Nothing to sort yet. Paste your notes above, one item per line.');
      return;
    }
    setMessage('');
    await repo.saveRawNotes(meetingId, raw);
    await repo.saveDraft(meetingId, drafts);
    setRows(drafts);
    setStage('rows');
    focusIndex.current = 0;
  }

  async function backToPaste() {
    if (rows.some((r) => r.text.trim()) && !window.confirm('Go back to the pasted text? Your edits to these rows will be discarded.')) return;
    await repo.discardDraft(meetingId);
    setRaw(meeting?.rawNotes ?? '');
    setStage('paste');
  }

  async function commit() {
    const ready = rows.filter((r) => r.text.trim());
    if (ready.length === 0) {
      setMessage('Every row is empty. Add some text, or go back to the pasted notes.');
      return;
    }
    setMessage('');
    const items = await repo.commitDraft(meetingId, ready);
    setSaved(items);
    setRows([]);
    setDetailsAdded(0);
    setStage('enrich');
  }

  function onEnterInRow(i: number) {
    if (i === rows.length - 1) {
      setRows((rs) => [...rs, emptyRow()]);
    }
    focusIndex.current = i + 1;
  }

  const selfId = people.find((p) => p.isSelf)?.id;
  const target = applyAllTarget(meeting, selfId);
  const targetProject = target.projectId ? nameOf(projects, target.projectId) : undefined;
  const targetPerson = target.personId ? nameOf(people, target.personId) : undefined;

  return (
    <section aria-labelledby="capture-h">
      <p>
        <a href="#/meetings">← Meetings</a>
      </p>
      <h1 id="capture-h">{meeting.title}</h1>
      <p className="muted">{meeting.date}</p>

      {stage === 'paste' && (
        <div className="stack">
          <label>
            Paste your notes, one item per line
            <textarea
              rows={12}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void sortIntoRows();
                }
              }}
              aria-describedby="paste-help"
              autoFocus
            />
          </label>
          <p id="paste-help" className="muted">
            Start a line with <code>?</code> or <code>Q:</code> for a question, or <code>T:</code>, <code>todo:</code> or{' '}
            <code>[]</code> for a task. Use <code>@Name</code> and <code>#Project</code> to tag. Saved as you type.
          </p>
          <div className="inline">
            <button type="button" onClick={() => void sortIntoRows()}>
              Sort into rows (Ctrl+Enter)
            </button>
          </div>
        </div>
      )}

      {stage === 'rows' && (
        <div
          className="stack"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void commit();
            }
          }}
        >
          {(targetProject || targetPerson) && (
            <div className="inline" role="group" aria-label="Apply to all rows">
              {targetProject && (
                <button type="button" onClick={() => setRows(applyToAll(rows, { projectId: target.projectId }))}>
                  Tag all rows #{targetProject}
                </button>
              )}
              {targetPerson && (
                <button type="button" onClick={() => setRows(applyToAll(rows, { personId: target.personId }))}>
                  Tag all rows @{targetPerson}
                </button>
              )}
            </div>
          )}
          <ul className="list drafts">
            {rows.map((row, i) => (
              <DraftRowEditor
                key={i}
                index={i}
                row={row}
                people={people}
                projects={projects}
                inputRef={(el) => {
                  inputs.current[i] = el;
                }}
                onChange={(next) => setRow(i, next)}
                onRemove={() => setRows((rs) => rs.filter((_, k) => k !== i))}
                onEnter={() => onEnterInRow(i)}
              />
            ))}
          </ul>
          <div className="inline">
            <button type="button" onClick={() => void commit()}>
              Save all rows (Ctrl+Enter)
            </button>
            <button type="button" onClick={() => void backToPaste()}>
              Back to pasted notes
            </button>
          </div>
          <p className="muted">
            Alt+T changes a row's type while you type. Press Ctrl+Enter anywhere on this screen to save all rows. Rows
            you leave untagged are kept and can be filed later.
          </p>
        </div>
      )}

      {stage === 'enrich' && (
        <>
          <p role="status">
            {saved.length} {saved.length === 1 ? 'item' : 'items'} saved from this meeting.
          </p>
          <EnrichmentPass
            items={saved}
            people={people}
            meetingDate={meeting.date}
            onDone={(updated) => {
              setDetailsAdded(updated);
              setStage('done');
            }}
          />
        </>
      )}

      {stage === 'done' && (
        <div className="stack">
          <p role="status">
            {saved.length} {saved.length === 1 ? 'item' : 'items'} saved from this meeting
            {detailsAdded > 0 && `, with details added to ${detailsAdded}`}.
          </p>
          <ul className="list">
            {saved.map((it) => (
              <li key={it.id}>
                <span>
                  <span className="muted">{TYPE_LABEL[it.type]} · </span>
                  {it.text}
                </span>
              </li>
            ))}
          </ul>
          <div className="inline">
            <button type="button" onClick={() => { setRaw(''); setStage('paste'); }}>
              Add more notes
            </button>
            <a href="#/meetings">Back to meetings</a>
          </div>
        </div>
      )}

      {message && <p role="status">{message}</p>}
    </section>
  );
}
