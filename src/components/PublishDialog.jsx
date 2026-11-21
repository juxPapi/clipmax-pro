import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store.jsx';
import { navigate } from '../lib/router.js';
import { Icon } from '../components/Icons.jsx';

function toLocalInput(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function PublishDialog({ open, project, onClose }) {
  const { settings, catalog, publish } = useApp();
  const clip = useMemo(
    () => (project?.clips || []).find((entry) => entry.id === open?.clipId),
    [project, open]
  );
  const [targets, setTargets] = useState([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [schedule, setSchedule] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const configured = (id) => settings?.platforms?.[id]?.configured;
    const all = (catalog?.targets || []).map((target) => target.id);
    setTargets(settings?.dryRun ? all : all.filter(configured));
    setTitle(clip?.title || open.title || project?.name || 'New clip');
    setDescription(clip?.excerpt || '');
    setHashtags((clip?.hashtags || []).join(' '));
    setSchedule('');
    setError('');
    setBusy(false);
  }, [open, clip, settings, catalog, project]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !project) return null;

  const platforms = settings?.platforms || {};
  const dryRun = Boolean(settings?.dryRun);
  const instagramNeedsUrl = !dryRun && targets.includes('instagram') && !platforms.instagram?.publicBaseUrl;
  const minSchedule = toLocalInput(new Date());

  function toggle(id) {
    setTargets((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));
  }

  async function submit(event) {
    event.preventDefault();
    if (!targets.length) {
      setError('Pick at least one platform.');
      return;
    }
    if (!dryRun) {
      const missing = targets.filter((id) => !platforms[id]?.configured);
      if (missing.length) {
        setError(`Connect ${missing.join(', ')} in Settings, or turn dry run back on.`);
        return;
      }
      if (instagramNeedsUrl) {
        setError('Instagram needs a public HTTPS base URL. Add one in Settings → Instagram.');
        return;
      }
    }
    setBusy(true);
    setError('');
    try {
      const tags = hashtags
        .split(/[\s,]+/)
        .map((tag) => tag.replace(/^#+/, '').trim())
        .filter(Boolean)
        .map((tag) => `#${tag}`);
      await publish({
        projectId: project.id,
        exportId: open.id,
        targets,
        title,
        description,
        hashtags: tags,
        scheduleAt: schedule ? new Date(schedule).toISOString() : null,
      });
      onClose();
      navigate('queue');
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="modal publish-modal" onSubmit={submit}>
        <header className="modal-head">
          <div>
            <h2>Post this cut</h2>
            <p className="modal-sub">
              {open.aspect} · {open.styleName} · {open.duration}s
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>

        <div className="modal-body">
          {dryRun ? (
            <div className="callout warn">
              <Icon name="alert" size={16} />
              <p>
                Dry run is on. The queue will simulate each platform and post nothing. Turn it off in Settings when the
                accounts are connected.
              </p>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => {
                  onClose();
                  navigate('settings');
                }}
              >
                Settings
              </button>
            </div>
          ) : null}

          <fieldset className="targets">
            <legend>Platforms</legend>
            <div className="target-grid">
              {(catalog?.targets || []).map((target) => {
                const selected = targets.includes(target.id);
                const connected = Boolean(platforms[target.id]?.configured);
                return (
                  <button
                    key={target.id}
                    type="button"
                    className={`target ${selected ? 'selected' : ''} ${connected ? '' : 'unconnected'}`}
                    onClick={() => toggle(target.id)}
                    aria-pressed={selected}
                  >
                    <span className="target-top">
                      <span className={`box ${selected ? 'on' : ''}`}>{selected ? <Icon name="check" size={12} /> : null}</span>
                      <span className="target-name">{target.label}</span>
                    </span>
                    <span className="target-state">
                      {dryRun ? 'Simulated' : connected ? 'Connected' : 'Not connected'}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <label className="field">
            <span className="field-label">Title</span>
            <input value={title} maxLength={100} onChange={(event) => setTitle(event.target.value)} autoFocus />
            <span className="field-count">{title.length}/100</span>
          </label>

          <label className="field">
            <span className="field-label">Caption</span>
            <textarea
              rows={3}
              value={description}
              maxLength={2400}
              onChange={(event) => setDescription(event.target.value)}
            />
            <span className="field-count">{description.length}/2400</span>
          </label>

          <label className="field">
            <span className="field-label">Hashtags</span>
            <input
              value={hashtags}
              maxLength={300}
              placeholder="#shorts #reels #fyp"
              onChange={(event) => setHashtags(event.target.value)}
            />
          </label>

          <label className="field">
            <span className="field-label">Schedule</span>
            <input
              type="datetime-local"
              min={minSchedule}
              value={schedule}
              onChange={(event) => setSchedule(event.target.value)}
            />
            <span className="field-hint">{schedule ? 'Queued for that local time.' : 'Leave empty to post now.'}</span>
          </label>

          {instagramNeedsUrl ? (
            <p className="inline-error">
              <Icon name="alert" size={15} /> Instagram fetches the reel from a public HTTPS URL. Add your tunnel address
              in Settings.
            </p>
          ) : null}
          {error ? (
            <p className="inline-error">
              <Icon name="alert" size={15} /> {error}
            </p>
          ) : null}
        </div>

        <footer className="modal-foot">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy || !targets.length}>
            {busy ? 'Queueing…' : 'Add to queue'}
            <Icon name="queue" size={16} />
          </button>
        </footer>
      </form>
    </div>
  );
}
