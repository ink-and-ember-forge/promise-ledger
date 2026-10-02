import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type FormEvent } from 'react';
import type { Project } from '../../domain';
import { repo } from '../repo';

function ProjectRow({ project }: { project: Project }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);
  const [purpose, setPurpose] = useState(project.purpose ?? '');

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await repo.updateProject(project.id, { name: name.trim(), purpose: purpose.trim() || undefined });
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
            Purpose <input value={purpose} onChange={(e) => setPurpose(e.target.value)} />
          </label>
          <button type="submit">Save</button>
          <button type="button" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </form>
      </li>
    );
  }

  const archived = project.status === 'archived';
  return (
    <li>
      <span>
        {project.name}
        {archived && <span className="muted"> · archived</span>}
        {project.purpose && <span className="muted"> · {project.purpose}</span>}
      </span>
      <span className="actions">
        <button type="button" onClick={() => setEditing(true)} aria-label={`Edit ${project.name}`}>
          Edit
        </button>
        <button
          type="button"
          onClick={() => void repo.updateProject(project.id, { status: archived ? 'active' : 'archived' })}
          aria-label={`${archived ? 'Reopen' : 'Archive'} ${project.name}`}
        >
          {archived ? 'Reopen' : 'Archive'}
        </button>
        <button
          type="button"
          onClick={() => void repo.softDeleteProject(project.id)}
          aria-label={`Remove ${project.name}`}
        >
          Remove
        </button>
      </span>
    </li>
  );
}

export function ProjectsScreen() {
  const projects = useLiveQuery(() => repo.listProjects(), []);
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await repo.createProject({ name, purpose });
    setName('');
    setPurpose('');
  }

  return (
    <section aria-labelledby="projects-h">
      <h1 id="projects-h">Projects</h1>
      <p className="muted">What your notes belong to. Tag them with #Project.</p>
      <form className="inline" onSubmit={add}>
        <label>
          Name <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Purpose <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Optional" />
        </label>
        <button type="submit">Add project</button>
      </form>
      {projects && projects.length === 0 && (
        <p className="empty">No projects yet. Add the first one, then tag notes to it.</p>
      )}
      <ul className="list">{projects?.map((p) => <ProjectRow key={p.id} project={p} />)}</ul>
    </section>
  );
}
