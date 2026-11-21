import { useEffect, useMemo } from 'react';
import { useApp } from '../store.jsx';
import { navigate } from '../lib/router.js';
import { Icon } from '../components/Icons.jsx';
import { relative, timecode } from '../lib/format.js';

const STATUS = {
  scheduled: { label: 'Scheduled', tone: 'busy' },
  running: { label: 'Posting', tone: 'busy' },
  done: { label: 'Posted', tone: 'good' },
  partial: { label: 'Partly posted', tone: 'warn' },
  failed: { label: 'Failed', tone: 'bad' },
};

function targetLabel(catalog, id) {
  return catalog?.targets?.find((target) => target.id === id)?.label || id;
}

export function QueueView() {
  const { queue, projects, catalog, settings, refreshQueue, retryPost, cancelPost, notify } = useApp();

  useEffect(() => {
    refreshQueue().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = useMemo(() => {
    const active = queue.filter((item) => item.status === 'scheduled' || item.status === 'running');
    const history = queue.filter((item) => !['scheduled', 'running'].includes(item.status));
    return { active, history };
  }, [queue]);

  const stats = useMemo(() => {
    const posted = queue.filter((item) => item.status === 'done').length;
    const failed = queue.filter((item) => item.status === 'failed' || item.status === 'partial').length;
    return { waiting: groups.active.length, posted, failed };
  }, [queue, groups]);

  function projectName(projectId) {
    return projects.find((project) => project.id === projectId)?.name || 'Deleted source';
  }

  async function retry(item) {
    try {
      await retryPost(item.id);
    } catch (error) {
      notify(error.message, 'bad');
    }
  }

  async function cancel(item) {
    try {
      await cancelPost(item.id);
    } catch (error) {
      notify(error.message, 'bad');
    }
  }

  function renderItem(item) {
    const status = STATUS[item.status] || STATUS.scheduled;
    return (
      <article key={item.id} className={`queue-item ${status.tone}`}>
        <div className="queue-status">
          <span className={`status ${status.tone}`}>
            <span className="dot" />
            {status.label}
          </span>
          <span className="queue-time">{relative(item.scheduleAt)}</span>
        </div>

        <div className="queue-body">
          <div className="queue-title-row">
            <h3>{item.title}</h3>
            <span className="queue-meta">
              {item.aspect} · {item.targets.length} platform{item.targets.length === 1 ? '' : 's'} ·{' '}
              {item.scheduleAt ? new Date(item.scheduleAt).toLocaleString() : 'now'}
            </span>
          </div>
          <p className="queue-desc">{item.description || 'No caption set.'}</p>
          <div className="queue-tags">
            {(item.hashtags || []).slice(0, 6).map((tag) => (
              <span key={tag} className="tag">
                {tag}
              </span>
            ))}
          </div>

          <div className="result-grid">
            {item.targets.map((target) => {
              const result = item.results?.[target];
              const state = !result ? 'pending' : result.ok ? 'ok' : 'err';
              return (
                <div key={target} className={`result ${state}`}>
                  <span className="dot" />
                  <span className="result-name">{targetLabel(catalog, target)}</span>
                  <span className="result-note" title={result?.error || result?.note || ''}>
                    {!result
                      ? 'Waiting'
                      : result.ok
                        ? result.simulated
                          ? 'Simulated'
                          : result.note || 'Posted'
                        : result.error || 'Failed'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="queue-actions">
          <button type="button" className="btn ghost small" onClick={() => navigate(`studio/${item.projectId}`)}>
            Open cut
          </button>
          {['failed', 'partial'].includes(item.status) ? (
            <button type="button" className="btn primary small" onClick={() => retry(item)}>
              <Icon name="refresh" size={14} /> Retry
            </button>
          ) : null}
          {item.status === 'scheduled' ? (
            <button type="button" className="icon-btn danger" onClick={() => cancel(item)} aria-label="Remove from queue">
              <Icon name="trash" size={15} />
            </button>
          ) : null}
          <span className="queue-source" title={projectName(item.projectId)}>
            {projectName(item.projectId)}
          </span>
        </div>
      </article>
    );
  }

  return (
    <div className="queue-view">
      <header className="page-head">
        <div>
          <h1>The queue</h1>
          <p className="page-copy">
            Every cut waiting for a slot, and every post that already left. Each platform reports on its own line.
          </p>
        </div>
        <div className="page-stats">
          <div className="mini-stat">
            <strong>{stats.waiting}</strong>
            <span>waiting</span>
          </div>
          <div className="mini-stat">
            <strong>{stats.posted}</strong>
            <span>posted</span>
          </div>
          <div className="mini-stat">
            <strong>{stats.failed}</strong>
            <span>need a look</span>
          </div>
        </div>
      </header>

      {settings?.dryRun ? (
        <div className="callout warn">
          <Icon name="alert" size={16} />
          <p>Dry run is on. Posts below are simulated and nothing is sent to a platform.</p>
          <button type="button" className="btn ghost small" onClick={() => navigate('settings')}>
            Turn off
          </button>
        </div>
      ) : null}

      {queue.length ? (
        <div className="queue-lists">
          <section>
            <header className="section-head">
              <div>
                <h2>Waiting</h2>
                <p className="section-sub">{groups.active.length ? 'Due now or scheduled later' : 'Nothing waiting'}</p>
              </div>
              <button type="button" className="btn ghost small" onClick={() => refreshQueue()}>
                <Icon name="refresh" size={15} /> Refresh
              </button>
            </header>
            <div className="queue-list">
              {groups.active.map(renderItem)}
              {!groups.active.length ? <p className="side-empty">No scheduled posts.</p> : null}
            </div>
          </section>

          <section>
            <header className="section-head">
              <div>
                <h2>History</h2>
                <p className="section-sub">{groups.history.length ? 'Finished attempts' : 'No attempts yet'}</p>
              </div>
            </header>
            <div className="queue-list">
              {groups.history.map(renderItem)}
              {!groups.history.length ? <p className="side-empty">A finished post lands here.</p> : null}
            </div>
          </section>
        </div>
      ) : (
        <div className="empty">
          <div className="empty-mark">
            <Icon name="queue" size={30} />
          </div>
          <h3>Nothing queued.</h3>
          <p>Render a cut in the studio, then hit Post on the export. It lands here with its schedule.</p>
          <button type="button" className="btn primary" onClick={() => navigate('library')}>
            Find a moment
          </button>
        </div>
      )}
    </div>
  );
}
