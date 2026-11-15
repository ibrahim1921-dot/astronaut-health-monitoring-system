// Small shared pieces of the ground console. Icons are decorative and always paired with words.

import { timesText } from '../lib/delay.js';

const svg = (size) => ({
  width: size,
  height: size,
  viewBox: '0 0 16 16',
  'aria-hidden': 'true',
  focusable: 'false',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
});

export function Icon({ name, size = 14 }) {
  switch (name) {
    case 'fresh':
      return (
        <svg {...svg(size)}>
          <path d="M3 8.5 6.5 12 13 4.5" />
        </svg>
      );
    case 'stale':
      return (
        <svg {...svg(size)}>
          <circle cx="8" cy="8" r="6" />
          <path d="M8 4.5V8l2.5 1.5" />
        </svg>
      );
    case 'no data':
      return (
        <svg {...svg(size)}>
          <circle cx="8" cy="8" r="6" />
          <path d="M5 8h6" />
        </svg>
      );
    case 'warning':
      return (
        <svg {...svg(size)}>
          <path d="M8 1.8 15 14H1z" />
          <path d="M8 6.5v3.2M8 11.8v.1" />
        </svg>
      );
    case 'transit':
      return (
        <svg {...svg(size)}>
          <path d="M2 8h9M8 4.5 11.5 8 8 11.5" />
          <path d="M14 3v10" />
        </svg>
      );
    case 'delivered':
      return (
        <svg {...svg(size)}>
          <path d="M3 8.5 6.5 12 13 4.5" />
        </svg>
      );
    case 'read':
      return (
        <svg {...svg(size)}>
          <path d="M1.5 8.5 5 12l6.5-7.5M7.5 11l1 1L15 4.5" />
        </svg>
      );
    case 'ended':
      return (
        <svg {...svg(size)}>
          <rect x="3" y="3" width="10" height="10" rx="2" />
        </svg>
      );
    case 'overview':
      return (
        <svg {...svg(size)}>
          <rect x="2" y="2" width="5" height="5" rx="1.2" />
          <rect x="9" y="2" width="5" height="5" rx="1.2" />
          <rect x="2" y="9" width="5" height="5" rx="1.2" />
          <rect x="9" y="9" width="5" height="5" rx="1.2" />
        </svg>
      );
    case 'emergencies':
      return (
        <svg {...svg(size)}>
          <path d="M4 13V9a4 4 0 0 1 8 0v4" />
          <path d="M2.5 13.5h11M8 2v1.5M3 4l1 1M13 4l-1 1" />
        </svg>
      );
    case 'messages':
      return (
        <svg {...svg(size)}>
          <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" />
        </svg>
      );
    case 'station':
      return (
        <svg {...svg(size)}>
          <rect x="6" y="6" width="4" height="4" rx="0.8" />
          <path d="M1.5 5v6M4 5v6M1.5 8H6M12 5v6M14.5 5v6M10 8h4.5" />
        </svg>
      );
    case 'signal':
      return (
        <svg {...svg(size)}>
          <path d="M8 13.5v-4" />
          <circle cx="8" cy="8" r="1.2" />
          <path d="M5.2 5.2a4 4 0 0 0 0 5.6M10.8 5.2a4 4 0 0 1 0 5.6M3 3a7 7 0 0 0 0 10M13 3a7 7 0 0 1 0 10" />
        </svg>
      );
    case 'clock':
      return (
        <svg {...svg(size)}>
          <circle cx="8" cy="8" r="6" />
          <path d="M8 4.5V8h3" />
        </svg>
      );
    case 'missed':
      return (
        <svg {...svg(size)}>
          <rect x="2" y="3" width="12" height="11" rx="1.5" />
          <path d="M2 6.5h12M5 1.8v2.4M11 1.8v2.4M6 9l4 3M10 9l-4 3" />
        </svg>
      );
    case 'crew':
      return (
        <svg {...svg(size)}>
          <circle cx="6" cy="5.5" r="2.3" />
          <path d="M1.8 13.5a4.2 4.2 0 0 1 8.4 0" />
          <circle cx="11.5" cy="6" r="1.8" />
          <path d="M11 9.7a3.4 3.4 0 0 1 3.5 3.3" />
        </svg>
      );
    case 'arrow':
      return (
        <svg {...svg(size)}>
          <path d="M3 8h10M9 4l4 4-4 4" />
        </svg>
      );
    case 'back':
      return (
        <svg {...svg(size)}>
          <path d="M13 8H3M7 4 3 8l4 4" />
        </svg>
      );
    case 'clear':
      return (
        <svg {...svg(size)}>
          <circle cx="8" cy="8" r="6" />
          <path d="M5.2 8.3 7.2 10.2 10.9 6" />
        </svg>
      );
    default:
      return null;
  }
}

/** The console's mark: a small orbit around a dot. */
export function Mark({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true" focusable="false" className="gr-mark">
      <circle cx="17" cy="17" r="15.5" fill="none" stroke="currentColor" strokeOpacity="0.35" />
      <ellipse cx="17" cy="17" rx="13" ry="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" transform="rotate(-28 17 17)" />
      <circle cx="17" cy="17" r="3.4" fill="currentColor" />
      <circle cx="27.6" cy="11.4" r="1.9" fill="currentColor" />
    </svg>
  );
}

/** Initials in a circle whose ring shows the person's status (the chip next to it says it in words). */
export function Avatar({ name, status, size = 44 }) {
  const initials = String(name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
  return (
    <span className={`gr-avatar gr-avatar--${status ?? 'none'}`} style={{ width: size, height: size }} aria-hidden="true">
      {initials}
    </span>
  );
}

/** Freshness as icon + word, with the age in plain text. */
export function FreshnessChip({ freshness, showText = true }) {
  const cls = freshness.state.replace(' ', '-');
  return (
    <span className="gr-fresh">
      <span className={`gr-tag gr-tag--${cls}`}>
        <Icon name={freshness.state} />
        {freshness.label}
      </span>
      {showText && <span className="gr-muted">{freshness.text}</span>}
    </span>
  );
}

/** "Recorded 14:02 onboard · reached Earth 14:22 (UTC)"; on a live link only the recorded time. */
export function TimesLine({ recordedAt, profile }) {
  if (!recordedAt) return <span className="gr-muted">No record yet</span>;
  if (!profile?.delaySeconds) {
    return (
      <span className="gr-times">
        Recorded {utcText(recordedAt)}
        <span className="gr-muted"> · live link, no signal delay</span>
      </span>
    );
  }
  return (
    <span className="gr-times">
      {timesText(recordedAt, profile)}
      <span className="gr-muted"> · arrival estimated from the signal delay</span>
    </span>
  );
}

const pad = (n) => String(n).padStart(2, '0');
/** "14 Nov 14:02 UTC" */
export function utcText(iso) {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${day} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/** "14:02:09" (UTC) */
export const utcClock = (d) => `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;

/** Short signal text for the header: "Live link" on the station, otherwise the one-way delay. */
export function signalText(profile) {
  const s = profile?.delaySeconds ?? 0;
  if (s < 1) return 'Live link · no delay';
  if (s < 60) return `${Math.round(s * 10) / 10} s one way`;
  return `${Math.round(s / 60)} min one way`;
}
