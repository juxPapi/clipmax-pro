import { useMemo } from 'react';
import { timecode } from '../lib/format.js';

const WIDTH = 1000;
const HEIGHT = 132;
const BASELINE = 106;
const BARS = 190;

export function Heatmap({ heat, duration, clips = [], selectedId, onSeek, time = 0 }) {
  const bars = useMemo(() => {
    const values = heat?.values || [];
    if (!values.length || !duration) return [];
    const out = [];
    const count = Math.min(BARS, values.length);
    for (let index = 0; index < count; index += 1) {
      const from = Math.floor((index / count) * values.length);
      const to = Math.max(from + 1, Math.floor(((index + 1) / count) * values.length));
      let peak = 0;
      for (let i = from; i < to; i += 1) peak = Math.max(peak, values[i] || 0);
      out.push(peak);
    }
    return out;
  }, [heat, duration]);

  const step = WIDTH / Math.max(1, bars.length);
  const barWidth = Math.max(1.5, step - 1.7);

  function seekFromEvent(event) {
    if (!onSeek || !duration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    onSeek(ratio * duration);
  }

  return (
    <div className="heatmap">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Interest curve across ${timecode(duration, { hours: true })}. Click to jump.`}
        onClick={seekFromEvent}
      >
        <defs>
          <linearGradient id="heatFill" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#6E2A1B" />
            <stop offset="48%" stopColor="#E4572E" />
            <stop offset="100%" stopColor="#F2C14E" />
          </linearGradient>
          <linearGradient id="clipWash" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(242,193,78,0.03)" />
            <stop offset="100%" stopColor="rgba(242,193,78,0.09)" />
          </linearGradient>
        </defs>

        <line x1="0" y1={BASELINE + 1} x2={WIDTH} y2={BASELINE + 1} className="heat-base" />

        {bars.map((value, index) => {
          const height = 4 + Math.pow(value, 1.15) * 92;
          return (
            <rect
              key={index}
              x={index * step}
              y={BASELINE - height}
              width={barWidth}
              height={height}
              rx="1.4"
              fill="url(#heatFill)"
              opacity={0.35 + value * 0.65}
            />
          );
        })}

        {clips.map((clip) => {
          const x = duration ? (clip.start / duration) * WIDTH : 0;
          const width = duration ? Math.max(3, ((clip.end - clip.start) / duration) * WIDTH) : 0;
          const active = clip.id === selectedId;
          return (
            <g key={clip.id} className={active ? 'clip-window active' : 'clip-window'}>
              <rect
                x={x}
                y="6"
                width={width}
                height="108"
                rx="4"
                fill={active ? 'rgba(242,193,78,0.13)' : 'url(#clipWash)'}
                stroke={active ? '#F2C14E' : 'rgba(245,238,227,0.18)'}
                strokeWidth={active ? 1.6 : 1}
              />
              {width > 26 ? (
                <text x={x + 6} y="21" className={active ? 'clip-tag active' : 'clip-tag'}>
                  {active ? `#${clip.index} · ${clip.score}` : `#${clip.index}`}
                </text>
              ) : null}
            </g>
          );
        })}

        {duration ? (
          <line
            x1={(Math.min(time, duration) / duration) * WIDTH}
            y1="2"
            x2={(Math.min(time, duration) / duration) * WIDTH}
            y2={HEIGHT - 16}
            className="playhead"
          />
        ) : null}

        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
          <text key={ratio} x={Math.min(WIDTH - 2, Math.max(2, ratio * WIDTH))} y={HEIGHT - 2} className="heat-tick" textAnchor={ratio === 0 ? 'start' : ratio === 1 ? 'end' : 'middle'}>
            {timecode(duration * ratio, { hours: true })}
          </text>
        ))}
      </svg>
      <div className="heat-foot">
        <span>Audio energy + spoken word density</span>
        <span>Click the curve to move the playhead</span>
      </div>
    </div>
  );
}
