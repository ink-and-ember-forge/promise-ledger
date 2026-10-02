import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type FormEvent } from 'react';
import type { Meeting, Person, Project } from '../../domain';
import { repo } from '../repo';

type Kind = Meeting['kind'];
const KINDS: Array<{ value: Kind; label: string }> = [
  { value: 'project', label: 'Project' },
  { value: 'one-to-one', label: 'One-to-one' },
  { value: 'team', label: 'Team' },
  { value: 'other', label: 'Other' },
];

const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time

const toggle = (xs: string[], id: string) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]);

interface FormProps {
  people: Person[];
  projects: Project[];
  initial?: Meeting;
  onDone: () => void;
}

function MeetingForm({ people, projects, initial, onDone }: FormProps) {
  const selfId = people.find((p) => p.isSelf)?.id;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [date, setDate] = useState(initial?.date ?? today());
  const [kind, setKind] = useState<Kind>(initial?.kind ?? 'project');
  const [status, setStatus] = useState<Meeting['status']>(initial?.status ?? 'held');
  const [attendeeIds, setAttendeeIds] = useState<string[]>(initial?.attendeeIds ?? (selfId ? [selfId] : []));
  const [projectIds, setProjectIds] = useState<string[]>(initial?.projectIds ?? []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    if (initial) await repo.updateMeeting(initial.id, { title, date, kind, status, attendeeIds, projectIds });
    else await repo.createMeeting({ title, date, kind, status, attendeeIds, projectIds });
    if (!initial) {
      setTitle('');
      setProjectIds([]);
    }
    onDone();
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="inline">
        <label>
          Title <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label>
          Date <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label>
          Kind
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as Meeting['status'])}>
            <option value="held">Held</option>
            <option value="upcoming">Upcoming</option>
          </select>
        </label>
      </div>
      <fieldset>
        <legend>Attendees</legend>
        {people.map((p) => (
          <label key={p.id} className="check">
            <input
              type="checkbox"
              checked={attendeeIds.includes(p.id)}
              onChange={() => setAttendeeIds(toggle(attendeeIds, p.id))}
            />
            {p.name}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Projects</legend>
        {projects.length === 0 && <span className="muted">No projects yet.</span>}
        {projects.map((p) => (
          <label key={p.id} className="check">
            <input
              type="checkbox"
              checked={projectIds.includes(p.id)}
              onChange={() => setProjectIds(toggle(projectIds, p.id))}
            />
            {p.name}
          </label>
        ))}
      </fieldset>
      <div className="inline">
        <button type="submit">{initial ? 'Save meeting' : 'Add meeting'}</button>
        {initial && (
          <button type="button" onClick={onDone}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

export function MeetingsScreen() {
  const people = useLiveQuery(() => repo.listPeople(), []);
  const projects = useLiveQuery(() => repo.listProjects(), []);
  const meetings = useLiveQuery(() => repo.listMeetings(), []);
  const [editingId, setEditingId] = useState<string | null>(null);

  if (!people || !projects || !meetings) return null;

  // Soft-deleted people/projects are simply omitted from views (SPEC section 7).
  const nameOf = <T extends { id: string; name: string }>(pool: T[], id: string) =>
    pool.find((x) => x.id === id)?.name;
  const names = (pool: Array<{ id: string; name: string }>, ids: string[]) =>
    ids.map((id) => nameOf(pool, id)).filter((n): n is string => Boolean(n));

  const sorted = [...meetings].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <section aria-labelledby="meetings-h">
      <h1 id="meetings-h">Meetings</h1>
      <p className="muted">Register a meeting, then paste your notes to sort them.</p>
      {!editingId && <MeetingForm people={people} projects={projects} onDone={() => undefined} />}
      {sorted.length === 0 && <p className="empty">No meetings yet. Add one above to start sorting notes.</p>}
      <ul className="list">
        {sorted.map((m) =>
          editingId === m.id ? (
            <li key={m.id}>
              <MeetingForm people={people} projects={projects} initial={m} onDone={() => setEditingId(null)} />
            </li>
          ) : (
            <li key={m.id}>
              <span>
                {m.title}
                <span className="muted">
                  {' '}
                  · {m.date} · {KINDS.find((k) => k.value === m.kind)?.label}
                  {m.status === 'upcoming' && ' · upcoming'}
                </span>
                <span className="muted block">
                  {[...names(people, m.attendeeIds), ...names(projects, m.projectIds).map((n) => `#${n}`)].join(', ')}
                </span>
              </span>
              <span className="actions">
                <button type="button" onClick={() => setEditingId(m.id)} aria-label={`Edit ${m.title}`}>
                  Edit
                </button>
                <button type="button" onClick={() => void repo.softDeleteMeeting(m.id)} aria-label={`Remove ${m.title}`}>
                  Remove
                </button>
              </span>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}
