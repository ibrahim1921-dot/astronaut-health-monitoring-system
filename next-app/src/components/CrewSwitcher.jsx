'use client';

import { STATUS_LABELS } from '../constants/status.js';
import StatusIcon from './StatusIcon.jsx';

/**
 * Crew Medical Officer only: one card per crew member. Choosing a card shows that person's
 * dashboard; the officer's own card says "My data".
 * @param {{ crew: { id, name, role, status }[], selfId: string, viewedId: string, onSelect: (id: string) => void }} props
 */
export default function CrewSwitcher({ crew, selfId, viewedId, onSelect }) {
  return (
    <section className="crew-switcher" aria-labelledby="crew-switcher-title">
      <h2 id="crew-switcher-title" className="crew-switcher__title">
        Crew
      </h2>
      <ul className="crew-switcher__list">
        {crew.map((c) => {
          const active = c.id === viewedId;
          const self = c.id === selfId;
          return (
            <li key={c.id}>
              <button
                type="button"
                className={`crew-switcher__card crew-switcher__card--${c.status}${active ? ' is-active' : ''}`}
                aria-pressed={active}
                onClick={() => onSelect(c.id)}
              >
                <span className="crew-switcher__name">
                  {c.name}
                  {self && <span className="crew-switcher__me">My data</span>}
                </span>
                <span className="crew-switcher__role muted">{c.role}</span>
                <span className={`crew-switcher__status status-text--${c.status}`}>
                  <StatusIcon status={c.status} size={14} />
                  {STATUS_LABELS[c.status]}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
