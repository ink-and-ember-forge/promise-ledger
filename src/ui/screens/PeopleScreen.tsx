import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type FormEvent } from 'react';
import type { Person } from '../../domain';
import { repo } from '../repo';

function PersonRow({ person }: { person: Person }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(person.name);
  const [role, setRole] = useState(person.roleDescription ?? '');

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await repo.updatePerson(person.id, { name, roleDescription: role.trim() || undefined });
    setEditing(false);
  }

  if (editing) {
    return (
      <li>
        <form className="inline" onSubmit={save}>
          <label>
            Name <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Role <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Stakeholder" />
          </label>
          <button type="submit">Save</button>
          <button type="button" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </form>
      </li>
    );
  }

  return (
    <li>
      <span>
        {person.name}
        {person.roleDescription && <span className="muted"> · {person.roleDescription}</span>}
        {person.isSelf && <span className="muted"> · you</span>}
      </span>
      <span className="actions">
        <button type="button" onClick={() => setEditing(true)} aria-label={`Edit ${person.name}`}>
          Edit
        </button>
        {!person.isSelf && (
          <button
            type="button"
            onClick={() => void repo.softDeletePerson(person.id)}
            aria-label={`Remove ${person.name}`}
          >
            Remove
          </button>
        )}
      </span>
    </li>
  );
}

export function PeopleScreen() {
  const people = useLiveQuery(() => repo.listPeople(), []);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await repo.createPerson({ name, roleDescription: role });
    setName('');
    setRole('');
  }

  return (
    <section aria-labelledby="people-h">
      <h1 id="people-h">People</h1>
      <p className="muted">Colleagues and stakeholders you tag in notes with @Name.</p>
      <form className="inline" onSubmit={add}>
        <label>
          Name <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Role <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Team member" />
        </label>
        <button type="submit">Add person</button>
      </form>
      {people && people.filter((p) => !p.isSelf).length === 0 && (
        <p className="empty">No one added yet. Add the people you meet with, then tag them in your notes.</p>
      )}
      <ul className="list">{people?.map((p) => <PersonRow key={p.id} person={p} />)}</ul>
    </section>
  );
}
