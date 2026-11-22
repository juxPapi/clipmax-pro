import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store.jsx';
import { navigate } from '../lib/router.js';
import { Icon } from '../components/Icons.jsx';
import { api } from '../api';
import { bytes, clamp, relative, timecode } from '../lib/format.js';

function rgba(hex, alpha) {
  const clean = String(hex || '#000000').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean.padEnd(6, '0').slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const RATIO_MIN = 0.2;
const RATIO_MAX = 0.8;
const PRESETS = [
  { label: '50 / 50', value: 0.5 },
  { label: '60 / 40', value: 0.6 },
  { label: '70 / 30', value: 0.7 },
];

const DEFAULT_PANE = {
  focus: 0.5,
  focusY: 0.5,
  zoom: 1,
  start: 0,
  end: 0,
  muted: false,
  volume: 1,
};

function PaneVideo({ project, pane, active }) {
  const src = project ? (project.playbackUrl || project.mediaUrl) : null;
  if (!src) {
    return (
      <div className="split-empty">
        <Icon name="film" size={22} />
        <span>No video</span>
      </div>
    );
  }
  return (
    <video
      src={src}
      muted
      playsInline
      preload="metadata"
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        objectPosition: `${pane.focus * 100}% ${pane.focusY * 100}%`,
        transform: `scale(${pane.zoom})`,
        transformOrigin: `${pane.focus * 100}% ${pane.focusY * 100}%`,
        outline: active ? '2px solid var(--signal)' : 'none',
      }}
    />
  );
}

function PaneControls({ label, project, pane, setPane, active, onSelect }) {
  const duration = project?.duration || 0;
  return (
    <div className={`split-pane-controls ${active ? 'active' : ''}`} onClick={onSelect}>
      <div className="split-pane-head">
        <span className="split-pane-label">{label}</span>
        {project ? <span className="muted small">{project.name}</span> : <span className="muted small">No source</span>}
      </div>

      <div className="control-group">
        <span className="control-label">Zoom</span>
        <input
          type="range"
          min="1"
          max="2"
          step="0.01"
          value={pane.zoom}
          onChange={(e) => setPane({ ...pane, zoom: Number(e.target.value) })}
        />
        <output>{pane.zoom.toFixed(2)}x</output>
      </div>

      <div className="control-group">
        <span className="control-label">Pan X</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={pane.focus}
          onChange={(e) => setPane({ ...pane, focus: Number(e.target.value) })}
        />
        <output>{Math.round(pane.focus * 100)}</output>
      </div>

      <div className="control-group">
        <span className="control-label">Pan Y</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={pane.focusY}
          onChange={(e) => setPane({ ...pane, focusY: Number(e.target.value) })}
        />
        <output>{Math.round(pane.focusY * 100)}</output>
      </div>

      <div className="split-row">
        <button
          type="button"
          className="btn ghost small"
          onClick={(e) => { e.stopPropagation(); setPane({ ...pane, focus: 0.5, focusY: 0.5, zoom: 1 }); }}
        >
          Fit / center
        </button>
        <button
          type="button"
          className={`btn ghost small ${pane.muted ? 'active' : ''}`}
          onClick={(e) => { e.stopPropagation(); setPane({ ...pane, muted: !pane.muted }); }}
        >
          {pane.muted ? 'Muted' : 'Mute'}
        </button>
      </div>

      {duration > 0 ? (
        <div className="split-trim">
          <label className="field compact">
            <span className="field-label">In</span>
            <input
              type="number"
              step="0.1"
              min="0"
              max={duration}
              value={Number(pane.start.toFixed(1))}
              onChange={(e) => setPane({ ...pane, start: clamp(Number(e.target.value), 0, duration) })}
            />
          </label>
          <label className="field compact">
            <span className="field-label">Out</span>
            <input
              type="number"
              step="0.1"
              min="0"
              max={duration}
              value={Number(pane.end.toFixed(1))}
              onChange={(e) => setPane({ ...pane, end: clamp(Number(e.target.value), 0, duration) })}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

export function SplitScreen() {
  const app = useApp();
  const projects = app.projects || [];
  const [topId, setTopId] = useState(null);
  const [bottomId, setBottomId] = useState(null);
  const [topDetail, setTopDetail] = useState(null);
  const [bottomDetail, setBottomDetail] = useState(null);
  const [ratio, setRatio] = useState(0.5);
  const [topPane, setTopPane] = useState({ ...DEFAULT_PANE });
  const [bottomPane, setBottomPane] = useState({ ...DEFAULT_PANE });
  const [active, setActive] = useState('top');
  const [dividerThickness, setDividerThickness] = useState(4);
  const [dividerColor, setDividerColor] = useState('#f2c14e');
  const [rendering, setRendering] = useState(false);
  const [result, setResult] = useState(null);
  const containerRef = useRef(null);
  const dragging = useRef(false);

  useEffect(() => {
    if (!topId) { setTopDetail(null); return; }
    app.details[topId] ? setTopDetail(app.details[topId]) : api.project(topId).then(setTopDetail);
  }, [topId]);
  useEffect(() => {
    if (!bottomId) { setBottomDetail(null); return; }
    app.details[bottomId] ? setBottomDetail(app.details[bottomId]) : api.project(bottomId).then(setBottomDetail);
  }, [bottomId]);

  useEffect(() => {
    if (topDetail && topPane.end === 0) setTopPane((p) => ({ ...p, end: topDetail.duration || 0 }));
  }, [topDetail]);
  useEffect(() => {
    if (bottomDetail && bottomPane.end === 0) setBottomPane((p) => ({ ...p, end: bottomDetail.duration || 0 }));
  }, [bottomDetail]);

  function onDividerDown(e) {
    dragging.current = true;
    e.preventDefault();
  }
  useEffect(() => {
    function onMove(e) {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const y = (e.clientY - rect.top) / rect.height;
      setRatio(clamp(y, RATIO_MIN, RATIO_MAX));
    }
    function onUp() {
      dragging.current = false;
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const topH = `${ratio * 100}%`;
  const bottomH = `${(1 - ratio) * 100}%`;

  async function handleUpload(slot, file) {
    if (!file) return;
    try {
      const data = await api.upload(file);
      app.applyProject?.(data.project);
      if (slot === 'top') setTopId(data.project.id);
      else setBottomId(data.project.id);
      app.notify('Video uploaded and analyzed.', 'good');
    } catch (error) {
      app.notify(error.message, 'bad');
    }
  }

  async function render() {
    if (!topId || !bottomId) {
      app.notify('Upload both a top and a bottom video first.', 'bad');
      return;
    }
    setRendering(true);
    try {
      const data = await api.splitRender({
        topProjectId: topId,
        bottomProjectId: bottomId,
        ratio,
        top: { ...topPane, start: topPane.start || 0, end: topPane.end || topDetail?.duration },
        bottom: { ...bottomPane, start: bottomPane.start || 0, end: bottomPane.end || bottomDetail?.duration },
        fps: 60,
        hasAudio: true,
      });
      setResult(data.export);
      app.notify('Split-screen export ready.', 'good');
    } catch (error) {
      app.notify(error.message, 'bad');
    } finally {
      setRendering(false);
    }
  }

  return (
    <div className="split-screen">
      <div className="split-topbar">
        <h2 className="split-title">Split screen: top / bottom</h2>
        <div className="split-presets">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className={`btn ghost small ${Math.abs(ratio - p.value) < 0.001 ? 'active' : ''}`}
              onClick={() => setRatio(p.value)}
            >
              {p.label}
            </button>
          ))}
          <label className="split-thickness">
            <span>Divider</span>
            <input
              type="range"
              min="2"
              max="12"
              step="1"
              value={dividerThickness}
              onChange={(e) => setDividerThickness(Number(e.target.value))}
            />
            <output>{dividerThickness}px</output>
          </label>
          <label className="split-color">
            <span>Color</span>
            <input
              type="color"
              value={dividerColor}
              onChange={(e) => setDividerColor(e.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="split-layout">
        <div className="split-preview-col">
          <div className="split-canvas" ref={containerRef} style={{ aspectRatio: '9 / 16' }}>
            <div className="split-pane top" style={{ height: topH }} onClick={() => setActive('top')}>
              <PaneVideo project={topDetail} pane={topPane} active={active === 'top'} />
            </div>
            <div
              className="split-divider"
              style={{ height: `${dividerThickness}px`, background: dividerColor, cursor: 'ns-resize' }}
              onMouseDown={onDividerDown}
            />
            <div className="split-pane bottom" style={{ height: bottomH }} onClick={() => setActive('bottom')}>
              <PaneVideo project={bottomDetail} pane={bottomPane} active={active === 'bottom'} />
            </div>
          </div>

          <div className="split-source-row">
            <div className="split-source">
              <span className="field-label">Top source</span>
              <select
                value={topId || ''}
                onChange={(e) => setTopId(e.target.value || null)}
              >
                <option value="">Select a project…</option>
                {projects.map((pr) => (
                  <option key={pr.id} value={pr.id}>{pr.name}</option>
                ))}
              </select>
              <label className="btn ghost small split-upload">
                <Icon name="plus" size={14} /> Upload
                <input
                  type="file"
                  accept="video/*"
                  hidden
                  onChange={(e) => { handleUpload('top', e.target.files?.[0]); e.target.value = ''; }}
                />
              </label>
            </div>
            <div className="split-source">
              <span className="field-label">Bottom source</span>
              <select
                value={bottomId || ''}
                onChange={(e) => setBottomId(e.target.value || null)}
              >
                <option value="">Select a project…</option>
                {projects.map((pr) => (
                  <option key={pr.id} value={pr.id}>{pr.name}</option>
                ))}
              </select>
              <label className="btn ghost small split-upload">
                <Icon name="plus" size={14} /> Upload
                <input
                  type="file"
                  accept="video/*"
                  hidden
                  onChange={(e) => { handleUpload('bottom', e.target.files?.[0]); e.target.value = ''; }}
                />
              </label>
            </div>
          </div>
        </div>

        <div className="split-controls-col">
          <PaneControls
            label="Top pane"
            project={topDetail}
            pane={topPane}
            setPane={setTopPane}
            active={active === 'top'}
            onSelect={() => setActive('top')}
          />
          <PaneControls
            label="Bottom pane"
            project={bottomDetail}
            pane={bottomPane}
            setPane={setBottomPane}
            active={active === 'bottom'}
            onSelect={() => setActive('bottom')}
          />

          <button
            type="button"
            className="btn primary"
            onClick={render}
            disabled={rendering || !topId || !bottomId}
          >
            {rendering ? 'Rendering…' : 'Export split screen (1080×1920)'}
          </button>

          {result ? (
            <div className="split-result">
              <p className="good small">Export ready: {result.file}</p>
              <a className="btn ghost small" href={result.url} target="_blank" rel="noreferrer">
                Open video
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
