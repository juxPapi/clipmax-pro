import { useMemo, useRef, useState } from 'react';
import { useApp } from '../store.jsx';
import { navigate } from '../lib/router.js';
import { Icon } from '../components/Icons.jsx';
import { relative, scoreTone, statusLabel, statusTone, timecode } from '../lib/format.js';

function sourceLabel(project) {
  const source = project.source;
  if (!source) return 'Source';
  if (source.uploader) return source.uploader;
  if (source.extractor) return source.extractor;
  if (source.type === 'url') {
    try {
      return new URL(source.url).hostname.replace(/^www\./, '');
    } catch {
      return 'Link';
    }
  }
  return 'Local file';
}

function Thumb({ project }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="project-thumb">
      {!failed ? (
        <img
          src={`${project.thumb}?v=${encodeURIComponent(project.updatedAt || '')}`}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="thumb-fallback">
          <Icon name="film" size={26} />
          <span>{project.status === 'downloading' ? 'Fetching' : 'No frame yet'}</span>
        </div>
      )}
      {project.duration ? <span className="chip duration">{timecode(project.duration, { hours: true })}</span> : null}
      {project.topScore ? (
        <span className={`chip score ${scoreTone(project.topScore)}`}>{project.topScore}</span>
      ) : null}
      {project.status === 'analyzing' || project.status === 'downloading' ? (
        <div className="card-progress" aria-hidden="true">
          <span style={{ width: `${project.progress?.pct || 3}%` }} />
        </div>
      ) : null}
    </div>
  );
}

function ProjectCard({ project, onDelete }) {
  return (
    <article
      className={`project-card ${project.status}`}
      tabIndex={0}
      role="button"
      onClick={() => navigate(`studio/${project.id}`)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          navigate(`studio/${project.id}`);
        }
      }}
    >
      <Thumb project={project} />
      <div className="project-body">
        <h3 title={project.name}>{project.name}</h3>
        <p className="project-meta">
          {sourceLabel(project)}
          <span className="sep">·</span>
          {relative(project.updatedAt)}
        </p>
        <div className="project-foot">
          <span className={`status ${statusTone(project)}`}>
            <span className="dot" />
            {statusLabel(project)}
          </span>
          <span className="project-count">
            {project.clips || 0} moment{project.clips === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            className="icon-btn danger"
            aria-label={`Delete ${project.name}`}
            onClick={(event) => {
              event.stopPropagation();
              onDelete(project);
            }}
          >
            <Icon name="trash" size={15} />
          </button>
        </div>
      </div>
    </article>
  );
}

export function Library() {
  const { projects, queue, createFromUrl, createFromUpload, removeProject, refreshProjects, notify } = useApp();
  const [url, setUrl] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [uploadPct, setUploadPct] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState('');
  const fileInput = useRef(null);

  const stats = useMemo(() => {
    const moments = projects.reduce((sum, project) => sum + (project.clips || 0), 0);
    const renders = projects.reduce((sum, project) => sum + (project.exports || 0), 0);
    const pending = queue.filter((item) => item.status === 'scheduled' || item.status === 'running').length;
    return { moments, renders, pending };
  }, [projects, queue]);

  async function submitLink(event) {
    event.preventDefault();
    const value = url.trim();
    if (!value) return;
    try {
      const parsed = new URL(value);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Use an http or https link.');
    } catch {
      setLinkError('Paste a full link, starting with https://');
      return;
    }
    setLinkError('');
    setLinkBusy(true);
    try {
      const project = await createFromUrl(value);
      setUrl('');
      navigate(`studio/${project.id}`);
    } catch (error) {
      setLinkError(error.message);
    } finally {
      setLinkBusy(false);
    }
  }

  async function takeFile(file) {
    if (!file) return;
    if (!/^video\//.test(file.type) && !/\.(mp4|mov|mkv|webm|m4v|avi|ts)$/i.test(file.name)) {
      setFileError('That does not look like a video file.');
      return;
    }
    setFileError('');
    setUploadPct(0);
    try {
      const project = await createFromUpload(file, setUploadPct);
      navigate(`studio/${project.id}`);
    } catch (error) {
      setFileError(error.message);
      setUploadPct(null);
    }
  }

  async function handleDelete(project) {
    const ok = window.confirm(`Delete “${project.name}” and every export made from it?`);
    if (!ok) return;
    try {
      await removeProject(project.id);
    } catch (error) {
      notify(error.message, 'bad');
    }
  }

  return (
    <div className="library">
      <section className="hero">
        <div className="hero-main">
          <h1>
            Find the
            <br />
            <span className="signal-word">moment.</span>
          </h1>
          <p className="hero-copy">
            Paste a stream or drop a recording. A local Whisper pass finds where the room reacts, then the cutter
            reframes it, captions it, and leaves it ready for every feed.
          </p>
          <ol className="pipeline" aria-label="Pipeline">
            <li>
              <span>01</span>Link or file
            </li>
            <li>
              <span>02</span>Listen locally
            </li>
            <li>
              <span>03</span>Score the peaks
            </li>
            <li>
              <span>04</span>Cut vertical
            </li>
          </ol>
        </div>
        <div className="hero-stats">
          <div className="stat">
            <strong>{stats.moments}</strong>
            <span>moments found</span>
          </div>
          <div className="stat">
            <strong>{stats.renders}</strong>
            <span>exports rendered</span>
          </div>
          <div className="stat">
            <strong>{stats.pending}</strong>
            <span>posts queued</span>
          </div>
        </div>
      </section>

      <section className="ingest-grid" aria-label="Add a source">
        <form className="panel ingest" onSubmit={submitLink}>
          <div className="panel-head">
                        <h2>From a link</h2>
          </div>
          <p className="panel-note">Twitch VODs and clips, YouTube, Kick, X. yt-dlp pulls the best mp4 it can see.</p>
          <div className="link-row">
            <div className="field">
              <input
                type="url"
                value={url}
                placeholder="https://twitch.tv/streamer/clip/..."
                onChange={(event) => {
                  setUrl(event.target.value);
                  setLinkError('');
                }}
                aria-label="Stream or clip link"
                disabled={linkBusy}
              />
            </div>
            <button className="btn primary" type="submit" disabled={linkBusy || !url.trim()}>
              {linkBusy ? 'Pulling…' : 'Pull the stream'}
              <Icon name="link" size={16} />
            </button>
          </div>
          {linkError ? (
            <p className="inline-error">
              <Icon name="alert" size={15} /> {linkError}
            </p>
          ) : (
            <p className="hint">Live streams download from the start unless the platform blocks it.</p>
          )}
        </form>

        <div
          className={`panel ingest dropzone ${dragging ? 'dragging' : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            takeFile(event.dataTransfer.files?.[0]);
          }}
        >
          <div className="panel-head">
                        <h2>From a file</h2>
          </div>
          <button type="button" className="drop-hit" onClick={() => fileInput.current?.click()}>
            <span className="drop-icon">
              <Icon name="upload" size={22} />
            </span>
            <span className="drop-title">Drop a recording here</span>
            <span className="drop-sub">or choose a file / MP4, MOV, MKV / up to 4 GB</span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="video/*,.mkv,.ts"
            hidden
            onChange={(event) => {
              takeFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          {uploadPct !== null ? (
            <div className="upload-state">
              <div className="upload-bar">
                <span style={{ transform: `scaleX(${uploadPct / 100})` }} />
              </div>
              <span>{uploadPct < 100 ? `Uploading ${uploadPct}%` : 'Uploaded. Listening next.'}</span>
            </div>
          ) : null}
          {fileError ? (
            <p className="inline-error">
              <Icon name="alert" size={15} /> {fileError}
            </p>
          ) : (
            <p className="hint">The file never leaves this machine.</p>
          )}
        </div>
      </section>

      <section className="sources">
        <header className="section-head">
          <div>
            <h2>Sources</h2>
            <p className="section-sub">
              {projects.length ? `${projects.length} in the crate` : 'The crate is empty'}
            </p>
          </div>
          <button type="button" className="btn ghost small" onClick={() => refreshProjects()}>
            <Icon name="refresh" size={15} /> Refresh
          </button>
        </header>

        {projects.length ? (
          <div className="project-grid">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} onDelete={handleDelete} />
            ))}
          </div>
        ) : (
          <div className="empty">
            <div className="empty-mark">
              <Icon name="scissors" size={30} />
            </div>
            <h3>No sources yet.</h3>
            <p>Paste a link above or drop a recording. The first pass takes a few minutes on a long stream.</p>
          </div>
        )}
      </section>
    </div>
  );
}
