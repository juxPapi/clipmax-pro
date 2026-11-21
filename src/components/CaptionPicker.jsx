import { useState } from 'react';
import { Icon } from './Icons.jsx';

function rgba(hex, alpha) {
  const clean = String(hex || '#000000').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean.padEnd(6, '0').slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function CaptionPicker({ groups, value, onChange }) {
  const activeStyle = groups.flatMap((group) => group.styles).find((style) => style.id === value);
  const [group, setGroup] = useState(activeStyle?.group || groups[0]?.group);
  const list = groups.find((entry) => entry.group === group)?.styles || [];

  return (
    <div className="caption-picker">
      <div className="chip-row" role="tablist" aria-label="Caption style group">
        {groups.map((entry) => (
          <button
            key={entry.group}
            type="button"
            role="tab"
            aria-selected={group === entry.group}
            className={`chip-btn ${group === entry.group ? 'active' : ''}`}
            onClick={() => setGroup(entry.group)}
          >
            {entry.group}
          </button>
        ))}
      </div>
      <div className="style-grid">
        {list.map((style) => {
          const selected = style.id === value;
          return (
            <button
              key={style.id}
              type="button"
              className={`style-swatch ${selected ? 'active' : ''}`}
              onClick={() => onChange(style.id)}
              title={`${style.group} · ${style.name}`}
            >
              <span
                className="style-sample"
                style={{
                  color: style.color,
                  background: style.box ? rgba(style.box, style.boxOpacity ?? 0.9) : 'rgba(var(--lit-003), 0.55)',
                  WebkitTextStroke: style.outlineWidth ? `${Math.max(0.6, style.outlineWidth * 0.28)}px ${style.outline}` : undefined,
                  fontFamily: `"${style.font}", "Arial Black", sans-serif`,
                  fontStyle: style.italic ? 'italic' : 'normal',
                  transform: style.tilt ? `rotate(${style.tilt}deg)` : undefined,
                  textShadow: style.shadow ? `0 2px 6px rgba(0,0,0,0.5)` : undefined,
                  textTransform: style.uppercase ? 'uppercase' : 'none',
                }}
              >
                Aa
              </span>
              <span className="style-name">{style.name}</span>
              {selected ? (
                <span className="style-check">
                  <Icon name="check" size={12} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
