import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store.jsx';
import { navigate } from '../lib/router.js';
import { Icon } from '../components/Icons.jsx';
import { Heatmap } from '../components/Heatmap.jsx';
import { CaptionPicker } from '../components/CaptionPicker.jsx';
import { PublishDialog } from '../components/PublishDialog.jsx';
import { cueAt, resolveStyle, toCues } from '../../shared/captions.js';
import { bytes, clamp, relative, scoreTone, statusLabel, statusTone, timecode } from '../lib/format.js';

function rgba(hex, alpha) {
  const clean = String(hex || '#000000').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean.padEnd(6, '0').slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function Preview({
  project,
  clip,
  style,
  cues,
  aspect,
  layout,
  focus,
  focusY,
  zoom,
  trim,
  seekRequest,
  onTime,
  watermark,
}) {
  const master = useRef(null);
  const slaves = useRef([]);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [muted, setMuted] = useState(true);
  const duration = Math.max(0.1, trim.end - trim.start);
  const src = project.playbackUrl || project.mediaUrl;
  const ratio = aspect.width / aspect.height;

  useEffect(() => {
    const video = master.current;
    if (!video) return;
    video.currentTime = trim.start;
    setTime(0);
    setPlaying(false);
    video.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip?.id, project.id]);

  useEffect(() => {
    const video = master.current;
    if (!video || !seekRequest) return;
    const target = clamp(seekRequest.t, 0, Math.max(0, project.duration || trim.end));
    video.currentTime = target;
    setTime(target - trim.start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekRequest]);

  useEffect(() => {
    const video = master.current;
    if (!video) return;
    video.muted = muted;
    for (const slave of slaves.current) if (slave) slave.muted = true;
  }, [muted]);

  function syncSlaves(playingNow = playing) {
    const video = master.current;
    if (!video) return;
    for (const slave of slaves.current) {
      if (!slave) continue;
      if (Math.abs(slave.currentTime - video.currentTime) > 0.25) slave.currentTime = video.currentTime;
      if (playingNow && slave.paused) slave.play().catch(() => {});
      if (!playingNow && !slave.paused) slave.pause();
    }
  }

  async function toggle() {
    const video = master.current;
    if (!video) return;
    if (video.paused) {
      if (video.currentTime < trim.start || video.currentTime >= trim.end) video.currentTime = trim.start;
      try {
        await video.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    } else {
      video.pause();
      setPlaying(false);
    }
  }

  function handleTime() {
    const video = master.current;
    if (!video) return;
    if (video.currentTime > trim.end + 0.03) {
      video.currentTime = trim.start;
    }
    setTime(Math.max(0, video.currentTime - trim.start));
    onTime?.(video.currentTime);
    syncSlaves();
  }

  function seek(value) {
    const video = master.current;
    if (!video) return;
    const target = clamp(trim.start + Number(value), trim.start, trim.end);
    video.currentTime = target;
    setTime(target - trim.start);
    onTime?.(target);
    syncSlaves();
  }

  const layerStyle = {
    objectPosition: `${focus * 100}% ${focusY * 100}%`,
    transform: `scale(${zoom})`,
    transformOrigin: `${focus * 100}% ${focusY * 100}%`,
  };

  const cue = cueAt(cues, time);
  const captionStyle = {
    color: style.color,
    fontFamily: `"${style.font}", "Arial Black", "Inter Variable", sans-serif`,
    fontSize: `${6.8 * (style.size || 1)}cqw`,
    lineHeight: 0.98,
    WebkitTextStroke: style.outlineWidth ? `${(style.outlineWidth / 10.8).toFixed(2)}cqw ${style.outline}` : undefined,
    textShadow: style.shadow ? `0 ${(style.shadow / 9).toFixed(2)}cqw ${(style.shadow / 4).toFixed(2)}cqw rgba(0,0,0,0.65)` : undefined,
    textTransform: style.uppercase ? 'uppercase' : 'none',
    fontStyle: style.italic ? 'italic' : 'normal',
    transform: style.tilt ? `rotate(${style.tilt}deg)` : undefined,
    background: style.box ? rgba(style.box, style.boxOpacity ?? 0.9) : 'transparent',
    padding: style.box ? '1.1cqw 2cqw' : 0,
    borderRadius: style.box ? '1.2cqw' : 0,
    textAlign: 'center',
    fontWeight: 900,
    letterSpacing: '-0.01em',
  };

  const primaryVideo = (
    <video
      ref={master}
      className="video-layer"
      style={layerStyle}
      src={src}
      playsInline
      muted={muted}
      preload="auto"
      onTimeUpdate={handleTime}
      onPlay={() => {
        setPlaying(true);
        syncSlaves(true);
      }}
      onPause={() => {
        setPlaying(false);
        syncSlaves(false);
      }}
      onClick={toggle}
    />
  );

  return (
    <div className="preview">
      <div className="preview-head">
        <div>
          <h2>{clip ? clip.title : 'Preview'}</h2>
          <p className="preview-meta">
            {clip ? `Suggested cut · ${timecode(clip.start)} to ${timecode(clip.end)}` : 'Select a moment to preview'}
          </p>
        </div>
        {clip ? <span className={`score-badge ${scoreTone(clip.score)}`}>{clip.score}</span> : null}
      </div>

      <div className="stage-wrap">
        <div
          className={`preview-stage layout-${layout}`}
          style={{ width: `min(100%, calc(min(54vh, 580px) * ${ratio}))`, aspectRatio: `${aspect.width} / ${aspect.height}` }}
        >
          {layout === 'blur' ? (
            <>
              <video ref={(node) => { slaves.current[0] = node; }} className="video-layer blur-bg" src={src} muted playsInline preload="auto" />
              <div className="blur-fg">{primaryVideo}</div>
            </>
          ) : layout === 'split' || layout === 'triple' ? (
            <div className={`tile-stack tiles-${layout}`}>
              {Array.from({ length: layout === 'split' ? 2 : 3 }, (_, index) =>
                index === 0 ? (
                  <div className="tile" key="master">
                    {primaryVideo}
                  </div>
                ) : (
                  <div className="tile" key={`slave-${index}`}>
                    <video
                      ref={(node) => { slaves.current[index] = node; }}
                      className="video-layer"
                      style={layerStyle}
                      src={src}
                      muted
                      playsInline
                      preload="auto"
                    />
                  </div>
                )
              )}
            </div>
          ) : (
            primaryVideo
          )}

          {watermark ? <span className="preview-mark">{watermark}</span> : null}

          {cue ? (
            <div className={`caption-layer pos-${style.position}`}>
              <span className="caption-text" style={captionStyle}>
                {cue.words.map((word, index) => {
                  const active = time >= word.start && time <= word.end;
                  const accent = style.highlight === 'line' ? true : style.highlight === 'word' && active;
                  return (
                    <span
                      key={`${word.text}-${index}`}
                      style={accent ? { color: style.accent } : undefined}
                      className={accent ? 'word accent' : 'word'}
                    >
                      {index ? ' ' : ''}
                      {word.text}
                    </span>
                  );
                })}
              </span>
            </div>
          ) : null}

          {!playing ? (
            <button type="button" className="play-overlay" onClick={toggle} aria-label="Play preview">
              <Icon name="play" size={26} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="transport">
        <button type="button" className="icon-btn" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
          <Icon name={playing ? 'pause' : 'play'} size={18} />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => seek(0)}
          aria-label="Back to start"
        >
          <Icon name="refresh" size={16} />
        </button>
        <span className="time-readout">
          {timecode(time)} <span className="muted">/ {timecode(duration)}</span>
        </span>
        <input
          className="scrub"
          type="range"
          min="0"
          max={duration}
          step="0.05"
          value={clamp(time, 0, duration)}
          onChange={(event) => seek(event.target.value)}
          aria-label="Preview position"
        />
        <button type="button" className="icon-btn" onClick={() => setMuted((value) => !value)} aria-label={muted ? 'Unmute' : 'Mute'}>
          <Icon name={muted ? 'mute' : 'volume'} size={17} />
        </button>
      </div>
      {layout !== 'fill' ? (
        <p className="preview-note">Tiles and blur are approximate here; the render applies the exact layout.</p>
      ) : null}
      {!clip?.words?.length ? null : null}
    </div>
  );
}

function ClipRail({ clips, selectedId, onSelect }) {
  return (
    <section className="side-card clip-rail">
      <header className="side-head">
        <h2>Cut list</h2>
        <span className="count">{clips.length}</span>
      </header>
      <div className="clip-list">
        {clips.map((clip) => (
          <button
            key={clip.id}
            type="button"
            className={`clip-item ${clip.id === selectedId ? 'active' : ''}`}
            onClick={() => onSelect(clip)}
          >
            <span className={`clip-score ${scoreTone(clip.score)}`}>{clip.score}</span>
            <span className="clip-copy">
              <strong>{clip.title}</strong>
              <span className="clip-time">
                {timecode(clip.start)} to {timecode(clip.end)} · {Math.round(clip.duration)}s · {clip.scoreLabel}
              </span>
              <span className="clip-excerpt">{clip.excerpt}</span>
              <span className="reason-row">
                {clip.reasons?.slice(0, 2).map((reason) => (
                  <span key={reason.label} className={`reason ${reason.tone}`}>
                    {reason.points > 0 ? '+' : ''}
                    {reason.points} {reason.label}
                  </span>
                ))}
              </span>
            </span>
          </button>
        ))}
        {!clips.length ? <p className="side-empty">No moments yet.</p> : null}
      </div>
    </section>
  );
}

function ExportCard({ project, clip, aspect, style, layout, trim, rendering, onRender, onPublish, onPreview, onDeleteExport }) {
  return (
    <section className="side-card export-card">
      <header className="side-head">
        <h2>Exports</h2>
        <span className="count">{project.exports?.length || 0}</span>
      </header>
      <div className="render-summary">
        <div>
          <span>Frame</span>
          <strong>
            {aspect.width} × {aspect.height}
          </strong>
        </div>
        <div>
          <span>Length</span>
          <strong>{timecode(trim.end - trim.start)}</strong>
        </div>
        <div>
          <span>Style</span>
          <strong>{style.name}</strong>
        </div>
        <div>
          <span>Layout</span>
          <strong>{layout}</strong>
        </div>
      </div>
      <button type="button" className="btn primary wide" onClick={onRender} disabled={rendering || !clip}>
        {rendering ? 'Rendering…' : 'Render this cut'}
        <Icon name="scissors" size={17} />
      </button>
      {rendering ? (
        <div className="render-progress">
          <div className="big-bar">
            <span style={{ width: `${project.progress?.pct || 2}%` }} />
          </div>
          <span>{project.progress?.stage === 'render' ? `${project.progress.pct}%` : 'Starting…'}</span>
        </div>
      ) : null}

      <div className="export-list">
        {(project.exports || []).map((record) => (
          <div key={record.id} className="export-item">
            <button type="button" className="export-main" onClick={() => onPreview(record)}>
              <span className="export-aspect">{record.aspect}</span>
              <span className="export-copy">
                <strong>{record.title || record.styleName}</strong>
                <span>
                  {record.styleName} · {record.duration}s · {bytes(record.size)} · {relative(record.createdAt)}
                </span>
              </span>
            </button>
            <div className="export-actions">
              <button type="button" className="btn primary small" onClick={() => onPublish(record)}>
                Post
              </button>
              <button
                type="button"
                className="icon-btn danger"
                aria-label="Delete export"
                onClick={() => onDeleteExport(record)}
              >
                <Icon name="trash" size={14} />
              </button>
            </div>
          </div>
        ))}
        {!project.exports?.length ? (
          <p className="side-empty">No exports yet. Set the frame and render a cut.</p>
        ) : null}
      </div>
    </section>
  );
}

function ProcessingCard({ project, logs }) {
  const pct = project.progress?.pct || 0;
  return (
    <section className="panel process-card">
      <div className="process-top">
        <span className="live-dot" />
        <h2>{statusLabel(project)}</h2>
        <strong>{pct}%</strong>
      </div>
      <div className="big-bar">
        <span style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
      <p className="process-note">
        {project.progress?.note ||
          (project.progress?.stage === 'transcribe'
            ? 'Whisper is listening. Long streams take a while on the first pass.'
            : 'Working through the pipeline…')}
      </p>
      {logs.length ? (
        <div className="log-tail">
          {logs.slice(-5).map((line, index) => (
            <span key={`${line}-${index}`}>{line}</span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function FailureCard({ project, onRetry, models, languages, model, setModel, language, setLanguage, busy }) {
  return (
    <section className="panel fail-card">
      <div className="fail-top">
        <Icon name="alert" size={20} />
        <div>
          <h2>This source needs another pass.</h2>
          <p>{project.error || 'The pipeline stopped before it found any moments.'}</p>
        </div>
      </div>
      {project.filePath !== undefined || project.mediaUrl ? (
        <div className="retry-controls">
          <label className="field compact">
            <span className="field-label">Whisper model</span>
            <select value={model} onChange={(event) => setModel(event.target.value)}>
              {Object.entries(models).map(([id, entry]) => (
                <option key={id} value={id}>
                  {entry.label} · {entry.size}
                </option>
              ))}
            </select>
          </label>
          <label className="field compact">
            <span className="field-label">Spoken language</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value)}>
              {languages.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn primary" onClick={onRetry} disabled={busy}>
            {busy ? 'Starting…' : 'Listen again'}
          </button>
        </div>
      ) : (
        <button type="button" className="btn ghost" onClick={() => navigate('library')}>
          Back to the library
        </button>
      )}
    </section>
  );
}

export function Studio({ id }) {
  const app = useApp();
  const project = app.details[id];
  const [loadError, setLoadError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [aspectId, setAspectId] = useState(() => app.settings?.defaults.aspect || '9:16');
  const [styleId, setStyleId] = useState(() => app.settings?.defaults.captionStyle || app.catalog?.defaultStyle);
  const [layout, setLayout] = useState(() => app.settings?.defaults.layout || 'fill');
  const [focus, setFocus] = useState(0.5);
  const [focusY, setFocusY] = useState(0.5);
  const [zoom, setZoom] = useState(1);
  const [wordsPerCue, setWordsPerCue] = useState(() => app.settings?.defaults.wordsPerCue || 4);
  const [position, setPosition] = useState('bottom');
  const [size, setSize] = useState(1);
  const [trim, setTrim] = useState({ start: 0, end: 0 });
  const [rendering, setRendering] = useState(false);
  const [playTime, setPlayTime] = useState(0);
  const [seekRequest, setSeekRequest] = useState(null);
  const [publishExport, setPublishExport] = useState(null);
  const [previewExport, setPreviewExport] = useState(null);
  const [retryOpen, setRetryOpen] = useState(false);
  const [reModel, setReModel] = useState(() => app.settings?.defaults.model || 'base');
  const [reLanguage, setReLanguage] = useState(() => app.settings?.defaults.language || 'auto');
  const [retryBusy, setRetryBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!id) return;
    setLoadError('');
    app.loadProject(id).catch((error) => {
      if (alive) setLoadError(error.message);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    setSelectedId(null);
    setSeekRequest(null);
    setPlayTime(0);
  }, [id]);

  const clips = useMemo(() => project?.clips || [], [project?.clips]);
  const clip = clips.find((entry) => entry.id === selectedId) || clips[0] || null;

  useEffect(() => {
    if (!selectedId && clips[0]) setSelectedId(clips[0].id);
  }, [clips, selectedId]);

  useEffect(() => {
    if (!clip) return;
    setTrim({ start: clamp(clip.start, 0, project.duration), end: clamp(clip.end, 0, project.duration) });
    setFocus(clip.focus ?? 0.5);
    setFocusY(clip.focusY ?? 0.5);
    setZoom(clip.zoom ?? 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip?.id]);

  const catalog = app.catalog;
  const style = useMemo(
    () => resolveStyle(styleId, { wordsPerCue, position, size }),
    [styleId, wordsPerCue, position, size]
  );
  const aspect = catalog?.aspects?.[aspectId] || { width: 1080, height: 1920, label: aspectId, id: aspectId };
  const duration = Math.max(0.1, trim.end - trim.start);

  const cues = useMemo(() => {
    if (!clip) return [];
    const delta = trim.start - clip.start;
    const local = (clip.words || [])
      .map((word) => ({ start: word.start - delta, end: word.end - delta, text: word.text }))
      .filter((word) => word.end > 0 && word.start < duration);
    return toCues(local, { maxWords: wordsPerCue, maxChars: wordsPerCue >= 6 ? 34 : 24 });
  }, [clip, trim.start, duration, wordsPerCue]);

  if (!project) {
    return (
      <div className="studio">
        {loadError ? (
          <div className="panel fail-card">
            <div className="fail-top">
              <Icon name="alert" size={20} />
              <div>
                <h2>Could not open that source.</h2>
                <p>{loadError}</p>
              </div>
            </div>
            <button type="button" className="btn ghost" onClick={() => navigate('library')}>
              Back to the library
            </button>
          </div>
        ) : (
          <div className="panel studio-skeleton">
            <div className="skel skel-title" />
            <div className="skel skel-stage" />
            <div className="skel skel-row" />
          </div>
        )}
      </div>
    );
  }

  const isWorking = project.status === 'analyzing' || project.status === 'downloading';
  const isFailed = project.status === 'failed';
  const settings = app.settings || {};
  const watermark = settings.brand?.watermark && settings.brand?.handle ? settings.brand.handle : null;

  async function retryAnalysis() {
    setRetryBusy(true);
    try {
      await app.reanalyze(project.id, { model: reModel, language: reLanguage });
      setRetryOpen(false);
    } catch (error) {
      app.notify(error.message, 'bad');
    } finally {
      setRetryBusy(false);
    }
  }

  async function doRender() {
    if (!clip) return;
    setRendering(true);
    try {
      await app.renderClip(project.id, {
        clipId: clip.id,
        aspect: aspectId,
        styleId,
        layout,
        focus,
        focusY,
        zoom,
        start: trim.start,
        end: trim.end,
        wordsPerCue,
        position,
        size,
      });
    } catch (error) {
      app.notify(error.message, 'bad');
    } finally {
      setRendering(false);
    }
  }

  async function handleDelete() {
    const ok = window.confirm(`Delete “${project.name}” and every export made from it?`);
    if (!ok) return;
    try {
      await app.removeProject(project.id);
      navigate('library');
    } catch (error) {
      app.notify(error.message, 'bad');
    }
  }

  function selectClip(next) {
    setSelectedId(next.id);
    setSeekRequest({ t: next.start, key: Date.now() });
    setPlayTime(next.start);
  }

  function seekFromHeat(t) {
    const target = clips.find((entry) => t >= entry.start && t <= entry.end);
    if (target && target.id !== selectedId) {
      setSelectedId(target.id);
      setSeekRequest({ t, key: Date.now() });
    } else {
      setSeekRequest({ t, key: Date.now() });
    }
    setPlayTime(t);
  }

  return (
    <div className="studio">
      <header className="studio-head">
        <div className="studio-title">
          <h1>{project.name}</h1>
          <p className="studio-meta">
            {project.source?.uploader || project.source?.extractor || (project.source?.type === 'url' ? 'Link' : 'Local file')}
            {project.duration ? <span className="sep">·</span> : null}
            {project.duration ? timecode(project.duration, { hours: true }) : null}
            {project.width ? <span className="sep">·</span> : null}
            {project.width ? `${project.width}×${project.height}` : null}
            {project.fps ? <span className="sep">·</span> : null}
            {project.fps ? `${Math.round(project.fps)} fps` : null}
            <span className="sep">·</span>
            <span className={`status ${statusTone(project)}`}>
              <span className="dot" />
              {statusLabel(project)}
            </span>
          </p>
        </div>
        <div className="studio-actions">
          <button type="button" className="btn ghost small" onClick={() => setRetryOpen((value) => !value)}>
            <Icon name="refresh" size={15} /> Listen again
          </button>
          <button type="button" className="icon-btn danger" onClick={handleDelete} aria-label="Delete source">
            <Icon name="trash" size={16} />
          </button>
        </div>
      </header>

      {retryOpen && !isFailed ? (
        <section className="panel retry-panel">
          <div className="retry-controls">
            <label className="field compact">
              <span className="field-label">Whisper model</span>
              <select value={reModel} onChange={(event) => setReModel(event.target.value)}>
                {Object.entries(catalog.models).map(([modelId, entry]) => (
                  <option key={modelId} value={modelId}>
                    {entry.label} · {entry.size}
                  </option>
                ))}
              </select>
            </label>
            <label className="field compact">
              <span className="field-label">Spoken language</span>
              <select value={reLanguage} onChange={(event) => setReLanguage(event.target.value)}>
                {catalog.languages.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn primary" onClick={retryAnalysis} disabled={retryBusy || isWorking}>
              {retryBusy ? 'Starting…' : 'Re-run the listen'}
            </button>
          </div>
          <p className="hint">
            A bigger model is slower but steadier with accents. Auto-detect is fine unless the transcript drifts.
          </p>
        </section>
      ) : null}

      {isFailed ? (
        <FailureCard
          project={project}
          onRetry={retryAnalysis}
          models={catalog.models}
          languages={catalog.languages}
          model={reModel}
          setModel={setReModel}
          language={reLanguage}
          setLanguage={setReLanguage}
          busy={retryBusy}
        />
      ) : null}

      {isWorking && !clips.length ? <ProcessingCard project={project} logs={app.logs[project.id] || []} /> : null}

      {!isFailed && clips.length ? (
        <div className="studio-grid">
          <div className="studio-main">
            <section className="panel preview-panel">
              <Preview
                project={project}
                clip={clip}
                style={style}
                cues={cues}
                aspect={aspect}
                layout={layout}
                focus={focus}
                focusY={focusY}
                zoom={zoom}
                trim={trim}
                seekRequest={seekRequest}
                onTime={setPlayTime}
                watermark={watermark}
              />
            </section>

            <section className="panel heat-panel">
              <header className="heat-head">
                <div>
                  <h2>Where the room spikes</h2>
                  <p className="section-sub">Suggested cuts sit on the loud, word-dense stretches.</p>
                </div>
                <div className="heat-key">
                  <span className="key-swatch" />
                  <span>Interest</span>
                </div>
              </header>
              <Heatmap
                heat={project.analysis?.heat}
                duration={project.duration || 0}
                clips={clips}
                selectedId={clip?.id}
                onSeek={seekFromHeat}
                time={playTime}
              />
            </section>

            <section className="panel editor-panel">
              <div className="editor-block">
                <header className="block-head">
                  <h2>Frame</h2>
                  <span className="block-note">Crop, pan, zoom</span>
                </header>

                <div className="control-group">
                  <span className="control-label">Aspect</span>
                  <div className="segmented">
                    {Object.values(catalog.aspects).map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        className={aspectId === entry.id ? 'active' : ''}
                        onClick={() => setAspectId(entry.id)}
                      >
                        {entry.id}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="control-group">
                  <span className="control-label">Layout</span>
                  <div className="segmented four">
                    {catalog.layouts.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        className={layout === entry.id ? 'active' : ''}
                        onClick={() => setLayout(entry.id)}
                        title={entry.hint}
                      >
                        {entry.label}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="slider-row">
                  <span>Horizontal</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={focus}
                    onChange={(event) => setFocus(Number(event.target.value))}
                  />
                  <output>{Math.round(focus * 100)}</output>
                </label>
                <label className="slider-row">
                  <span>Vertical</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={focusY}
                    onChange={(event) => setFocusY(Number(event.target.value))}
                  />
                  <output>{Math.round(focusY * 100)}</output>
                </label>
                <label className="slider-row">
                  <span>Zoom</span>
                  <input
                    type="range"
                    min="1"
                    max="2"
                    step="0.01"
                    value={zoom}
                    onChange={(event) => setZoom(Number(event.target.value))}
                  />
                  <output>{zoom.toFixed(2)}×</output>
                </label>

                <div className="trim-row">
                  <label className="field compact">
                    <span className="field-label">In</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max={trim.end - 2}
                      value={Number(trim.start.toFixed(1))}
                      onChange={(event) => {
                        const next = clamp(Number(event.target.value), 0, trim.end - 2);
                        setTrim((current) => ({ ...current, start: next }));
                        setSeekRequest({ t: next, key: Date.now() });
                      }}
                    />
                  </label>
                  <label className="field compact">
                    <span className="field-label">Out</span>
                    <input
                      type="number"
                      step="0.1"
                      min={trim.start + 2}
                      max={project.duration}
                      value={Number(trim.end.toFixed(1))}
                      onChange={(event) => {
                        const next = clamp(Number(event.target.value), trim.start + 2, project.duration);
                        setTrim((current) => ({ ...current, end: next }));
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => {
                      setTrim({ start: clip.start, end: clip.end });
                      setSeekRequest({ t: clip.start, key: Date.now() });
                    }}
                  >
                    Reset
                  </button>
                </div>
              </div>

              <div className="editor-block">
                <header className="block-head">
                  <h2>Captions</h2>
                  <span className="block-note">{catalog.styleCount} styles</span>
                </header>
                <CaptionPicker groups={catalog.styles} value={styleId} onChange={setStyleId} />

                <div className="caption-controls">
                  <div className="control-group">
                    <span className="control-label">Words per cue</span>
                    <div className="segmented">
                      {[3, 4, 5, 6].map((count) => (
                        <button
                          key={count}
                          type="button"
                          className={wordsPerCue === count ? 'active' : ''}
                          onClick={() => setWordsPerCue(count)}
                        >
                          {count}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="control-group">
                    <span className="control-label">Position</span>
                    <div className="segmented">
                      {['top', 'middle', 'bottom'].map((place) => (
                        <button
                          key={place}
                          type="button"
                          className={position === place ? 'active' : ''}
                          onClick={() => setPosition(place)}
                        >
                          {place === 'middle' ? 'Mid' : place[0].toUpperCase() + place.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="slider-row compact">
                    <span>Size</span>
                    <input
                      type="range"
                      min="0.75"
                      max="1.35"
                      step="0.01"
                      value={size}
                      onChange={(event) => setSize(Number(event.target.value))}
                    />
                    <output>{Math.round(size * 100)}%</output>
                  </label>
                </div>
              </div>
            </section>
          </div>

          <aside className="studio-side">
            <ClipRail clips={clips} selectedId={clip?.id} onSelect={selectClip} />
            <ExportCard
              project={project}
              clip={clip}
              aspect={aspect}
              style={style}
              layout={layout}
              trim={trim}
              rendering={rendering}
              onRender={doRender}
              onPublish={(record) => setPublishExport(record)}
              onPreview={(record) => setPreviewExport(record)}
              onDeleteExport={async (record) => {
                const ok = window.confirm('Delete this export?');
                if (!ok) return;
                try {
                  await app.removeExport(project.id, record.id);
                } catch (error) {
                  app.notify(error.message, 'bad');
                }
              }}
            />
            {isWorking && clips.length ? <ProcessingCard project={project} logs={app.logs[project.id] || []} /> : null}
          </aside>
        </div>
      ) : null}

      {!isFailed && !isWorking && project.status === 'ready' && !clips.length ? (
        <section className="panel fail-card">
          <div className="fail-top">
            <Icon name="alert" size={20} />
            <div>
              <h2>No speech found in this source.</h2>
              <p>Try a bigger Whisper model, or pick a source where someone is talking over the gameplay.</p>
            </div>
          </div>
          <button type="button" className="btn primary" onClick={() => setRetryOpen(true)}>
            Choose a model
          </button>
        </section>
      ) : null}

      <PublishDialog open={publishExport} project={project} onClose={() => setPublishExport(null)} />

      {previewExport ? (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setPreviewExport(null)}>
          <div className="modal player-modal">
            <header className="modal-head">
              <div>
                <h2>{previewExport.title}</h2>
                <p className="modal-sub">
                  {previewExport.aspect} · {previewExport.styleName} · {previewExport.duration}s
                </p>
              </div>
              <button type="button" className="icon-btn" onClick={() => setPreviewExport(null)} aria-label="Close">
                <Icon name="close" />
              </button>
            </header>
            <video className="export-player" src={previewExport.url} controls muted playsInline />
            <footer className="modal-foot">
              <a className="btn ghost" href={previewExport.url} target="_blank" rel="noreferrer">
                <Icon name="external" size={15} /> Open file
              </a>
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  setPublishExport(previewExport);
                  setPreviewExport(null);
                }}
              >
                Post this cut
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
