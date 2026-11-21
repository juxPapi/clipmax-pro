export function timecode(value, { hours = false } = {}) {
  const total = Math.max(0, Number(value) || 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  if (hours || h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function bytes(size) {
  const value = Number(size) || 0;
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

export function relative(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days} d ago`;
  return new Date(iso).toLocaleDateString();
}

export function scoreTone(score) {
  if (score >= 84) return 'high';
  if (score >= 70) return 'mid';
  return 'low';
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function statusLabel(project) {
  if (!project) return 'Unknown';
  if (project.status === 'downloading') return 'Fetching the stream';
  if (project.status === 'analyzing') {
    const stage = project.progress?.stage;
    if (stage === 'transcribe') return 'Listening';
    if (stage === 'score') return 'Scoring moments';
    if (stage === 'preview') return 'Preparing preview';
    if (stage === 'audio') return 'Reading audio';
    return 'Analyzing';
  }
  if (project.status === 'ready') return 'Ready to cut';
  if (project.status === 'failed') return 'Needs attention';
  return project.status;
}

export function statusTone(project) {
  if (!project) return 'neutral';
  if (project.status === 'ready') return 'good';
  if (project.status === 'failed') return 'bad';
  return 'busy';
}
