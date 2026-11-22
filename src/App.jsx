import { useApp } from './store.jsx';
import { Icon } from './components/Icons.jsx';
import { navigate, useRoute } from './lib/router.js';
import { Library } from './views/Library.jsx';
import { Studio } from './views/Studio.jsx';
import { SplitScreen } from './views/SplitScreen.jsx';
import { QueueView } from './views/QueueView.jsx';
import { SettingsView } from './views/SettingsView.jsx';

const NAV = [
  { id: 'library', label: 'Studio library', icon: 'library' },
  { id: 'split', label: 'Split screen', icon: 'film' },
  { id: 'queue', label: 'Posting queue', icon: 'queue' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

function Splash() {
  return (
    <div className="splash">
      <div className="splash-mark">
        <span className="wordmark-word">FACELESS</span>
        <span className="wordmark-sub">clip studio</span>
      </div>
      <div className="splash-bar" aria-hidden="true">
        <span />
      </div>
      <p className="splash-note">Checking the engines and opening the crate…</p>
    </div>
  );
}

function Fatal({ message }) {
  return (
    <div className="splash">
      <div className="splash-mark">
        <span className="wordmark-word">FACELESS</span>
        <span className="wordmark-sub">clip studio</span>
      </div>
      <div className="fatal-card">
        <h1>The local engine is not answering.</h1>
        <p>{message}</p>
        <p className="muted">
          Start it in a terminal with <code>npm run dev</code>, then reload this window. In the desktop build the window
          starts the engine for you.
        </p>
        <button className="btn primary" type="button" onClick={() => window.location.reload()}>
          <Icon name="refresh" /> Try again
        </button>
      </div>
    </div>
  );
}

function Grain() {
  return <div className="grain" aria-hidden="true" />;
}

function Toasts() {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.tone}`}>
          <Icon name={toast.tone === 'good' ? 'check' : toast.tone === 'bad' ? 'alert' : 'film'} size={16} />
          <span>{toast.message}</span>
          <button type="button" className="toast-close" onClick={() => dismissToast(toast.id)} aria-label="Dismiss">
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function EngineStatus({ health }) {
  const ffmpegReady = Boolean(health?.ffmpeg);
  const ytdlpReady = Boolean(health?.ytdlp);
  return (
    <div className="engine-box">
      <div className="engine-row">
        <span>{ffmpegReady ? `FFmpeg ${health.ffmpeg}` : 'FFmpeg missing'}</span>
      </div>
      <div className="engine-row">
        <span>{ytdlpReady ? `yt-dlp ${String(health.ytdlp).slice(0, 12)}` : 'yt-dlp missing'}</span>
      </div>
      <div className="engine-row">
        <span>{health?.modelsCached ? 'Whisper model cached' : 'Whisper downloads once'}</span>
      </div>
    </div>
  );
}

function Shell() {
  const app = useApp();
  const { view, param } = useRoute();
  const queued = app.queue.filter((item) => item.status === 'scheduled' || item.status === 'running').length;
  const detail = param ? app.details[param] : null;

  if (app.booting) return <Splash />;
  if (app.fatal) return <Fatal message={app.fatal} />;

  const title =
    view === 'studio'
      ? detail?.name || 'Studio'
      : view === 'queue'
        ? 'Posting queue'
        : view === 'settings'
          ? 'Settings'
          : 'Studio library';

  return (
    <div className="app">
      <Grain />
      <aside className="rail">
        <button type="button" className="brand" onClick={() => navigate('library')} aria-label="Clipmax Pro home">
          <span className="wordmark-word">CLIPMAX PRO</span>
          <span className="wordmark-sub">clip studio</span>
        </button>

        <nav className="rail-nav" aria-label="Main">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${view === item.id ? 'active' : ''}`}
              onClick={() => navigate(item.id)}
              aria-current={view === item.id ? 'page' : undefined}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.id === 'queue' && queued > 0 ? <span className="nav-badge">{queued}</span> : null}
            </button>
          ))}
        </nav>

        <div className="rail-foot">
          <EngineStatus health={app.health} />
          <p className="rail-note">
            Everything runs on this machine. Files stay in <code>data/</code>.
          </p>
        </div>
      </aside>

      <div className="shell">
        <header className="topbar">
          <div className="topbar-title">
            {view === 'studio' ? (
              <button type="button" className="back-link" onClick={() => navigate('library')}>
                <Icon name="back" size={16} /> Library
              </button>
            ) : null}
            <span className="crumb">{title}</span>
          </div>
          <div className="topbar-actions">
            <button
              type="button"
              className={`mode-pill ${app.settings?.dryRun ? 'dry' : 'live'}`}
              onClick={() => navigate('settings')}
              title="Posting mode"
            >
              {app.settings?.dryRun ? 'Dry run' : 'Live posting'}
            </button>
            <button type="button" className="btn ghost small" onClick={() => navigate('library')}>
              <Icon name="plus" size={16} /> New clip
            </button>
          </div>
        </header>

        <main className="main">
          {view === 'library' ? <Library /> : null}
          {view === 'studio' ? <Studio id={param} /> : null}
            {view === 'split' ? <SplitScreen /> : null}
          {view === 'queue' ? <QueueView /> : null}
          {view === 'settings' ? <SettingsView /> : null}
          {!['library', 'studio', 'split', 'queue', 'settings'].includes(view) ? <Library /> : null}
        </main>
      </div>
      <Toasts />
    </div>
  );
}

export function App() {
  return <Shell />;
}
