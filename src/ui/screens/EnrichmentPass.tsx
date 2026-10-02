import { useState, type KeyboardEvent } from 'react';
import {
  enrichItem,
  enrichmentFieldsFor,
  isEmptyEnrichment,
  normaliseUrl,
  type Enrichment,
  type Item,
  type ItemType,
  type Person,
} from '../../domain';
import { repo } from '../repo';

const TYPE_LABEL: Record<ItemType, string> = { note: 'Note', task: 'Task', question: 'Question' };

interface Props {
  items: Item[];
  people: Person[];
  /** The origin meeting's date, used as the default for "when you told them". */
  meetingDate: string;
  /** Called when the pass ends. `updated` is the number of items that gained details. */
  onDone: (updated: number) => void;
}

/** Optional, skippable pass over just-saved items. Skipping loses nothing: the items are already stored. */
export function EnrichmentPass({ items, people, meetingDate, onDone }: Props) {
  const [forms, setForms] = useState<Record<string, Enrichment>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const selfId = people.find((p) => p.isSelf)?.id;

  const set = (id: string, patch: Partial<Enrichment>) =>
    setForms((f) => ({ ...f, [id]: { ...f[id], ...patch } }));

  const badLink = (e: Enrichment | undefined) => Boolean(e?.linkUrl?.trim()) && !normaliseUrl(e?.linkUrl);

  async function save() {
    // A link that would be dropped is flagged rather than silently lost.
    if (items.some((item) => badLink(forms[item.id]))) {
      setMessage('A link needs to start with http or https. Fix it or clear it, then save.');
      return;
    }
    setMessage('');
    setBusy(true);
    const entries = items
      .map((item) => ({ item, e: forms[item.id] }))
      .filter((x): x is { item: Item; e: Enrichment } => Boolean(x.e) && !isEmptyEnrichment(x.e!))
      .map(({ item, e }) => ({ id: item.id, patch: enrichItem(item, e, { selfId, madeOn: meetingDate }) }))
      .filter((x) => Object.keys(x.patch).length > 0);
    if (entries.length > 0) await repo.updateItems(entries);
    onDone(entries.length);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void save();
    }
  }

  return (
    <div className="stack" onKeyDown={onKey}>
      <h2>Add details (optional)</h2>
      <p className="muted">
        Your items are already saved. Fill in whatever is useful now and leave the rest. You can skip this and
        nothing is lost.
      </p>
      <div className="inline">
        <button type="button" onClick={() => void save()} disabled={busy}>
          Save details (Ctrl+Enter)
        </button>
        <button type="button" onClick={() => onDone(0)} disabled={busy}>
          Skip for now
        </button>
      </div>
      {message && <p role="status">{message}</p>}
      <ul className="list enrich">
        {items.map((item, i) => {
          const fields = enrichmentFieldsFor(item.type);
          const f = forms[item.id] ?? {};
          const has = (name: (typeof fields)[number]) => fields.includes(name);
          const recipient = people.find((p) => p.id === f.recipientId);
          const told = Boolean(f.told && recipient);
          const toldLabel = recipient
            ? `I told ${recipient.name} I'd do this`
            : "I told them I'd do this (pick who it's for first)";
          const n = i + 1;
          return (
            <li key={item.id} className="enrich-item">
              <div>
                <span className="muted">{TYPE_LABEL[item.type]} · </span>
                {item.text}
              </div>
              <div className="enrich-fields">
                {has('owner') && (
                  <label>
                    Owner
                    <select
                      aria-label={`Item ${n} owner`}
                      value={told ? (selfId ?? '') : (f.ownerId ?? '')}
                      disabled={told}
                      onChange={(e) => set(item.id, { ownerId: e.target.value || undefined })}
                    >
                      <option value="">—</option>
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {has('recipient') && (
                  <label>
                    Who it's for
                    <select
                      aria-label={`Item ${n} recipient`}
                      value={f.recipientId ?? ''}
                      onChange={(e) =>
                        set(item.id, {
                          recipientId: e.target.value || undefined,
                          ...(e.target.value ? {} : { told: false }),
                        })
                      }
                    >
                      <option value="">—</option>
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {has('told') && (
                  <label className="check">
                    <input
                      type="checkbox"
                      aria-label={`Item ${n}: ${toldLabel}`}
                      checked={told}
                      disabled={!recipient}
                      onChange={(e) => set(item.id, { told: e.target.checked })}
                    />
                    {toldLabel}
                  </label>
                )}
                {has('dueBy') && (
                  <label>
                    Deadline
                    <input
                      type="date"
                      aria-label={`Item ${n} deadline`}
                      value={f.dueBy ?? ''}
                      onChange={(e) => set(item.id, { dueBy: e.target.value })}
                    />
                  </label>
                )}
                {has('importance') && (
                  <label>
                    Importance
                    <select
                      aria-label={`Item ${n} importance`}
                      value={f.importance ?? ''}
                      onChange={(e) => set(item.id, { importance: (e.target.value || undefined) as Enrichment['importance'] })}
                    >
                      <option value="">—</option>
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                    </select>
                  </label>
                )}
                {has('effort') && (
                  <label>
                    Effort (minutes)
                    <input
                      type="number"
                      min={1}
                      step={5}
                      aria-label={`Item ${n} effort in minutes`}
                      value={f.effortMinutes ?? ''}
                      onChange={(e) => set(item.id, { effortMinutes: e.target.value ? Number(e.target.value) : undefined })}
                    />
                  </label>
                )}
                {has('link') && (
                  <>
                    <label>
                      Link
                      <input
                        type="url"
                        aria-label={`Item ${n} link`}
                        placeholder="Link address"
                        value={f.linkUrl ?? ''}
                        aria-invalid={badLink(f) || undefined}
                        onChange={(e) => set(item.id, { linkUrl: e.target.value })}
                      />
                      {badLink(f) && <span className="muted">Start with http or https.</span>}
                    </label>
                    <label>
                      Link label
                      <input
                        aria-label={`Item ${n} link label`}
                        placeholder="e.g. ClickUp: build pages"
                        value={f.linkLabel ?? ''}
                        onChange={(e) => set(item.id, { linkLabel: e.target.value })}
                      />
                    </label>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="inline">
        <button type="button" onClick={() => void save()} disabled={busy}>
          Save details
        </button>
        <button type="button" onClick={() => onDone(0)} disabled={busy}>
          Skip for now
        </button>
      </div>
    </div>
  );
}
