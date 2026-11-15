'use client';

import ReadingTiles from '../components/ReadingTiles.jsx';
import IndicatorCard from '../components/IndicatorCard.jsx';

/**
 * Every reading in detail, one at a time: the chosen reading's value, trend, 14-day sparkline,
 * "your usual", what to do now, and the limits behind it.
 * @param {{ cards: object[], selectedId: string, onSelect: (id: string) => void, profile: object, personName?: string }} props
 */
export default function Vitals({ cards, selectedId, onSelect, profile, personName }) {
  const selected = cards.find((c) => c.id === selectedId) ?? cards[0];

  return (
    <div className="vitals">
      <section className="card card--lg vitals__nav" aria-labelledby="vitals-title">
        <h2 id="vitals-title" className="view-title">
          Vitals
        </h2>
        <p className="muted">{personName ? `${personName}’s readings.` : 'Your readings.'} Choose one to see its details.</p>
        <ReadingTiles cards={cards} selectedId={selected?.id} onOpen={onSelect} layout="list" label="Readings" />
      </section>
      <div className="vitals__detail" aria-live="polite">
        {selected && <IndicatorCard indicator={selected} profile={profile} showWhy />}
      </div>
    </div>
  );
}
