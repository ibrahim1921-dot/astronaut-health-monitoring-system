'use client';

import StatusChip from '../../components/StatusChip.jsx';
import { Avatar, FreshnessChip, Icon } from './GroundBits.jsx';

const GROUND_DAYS = 3; // matches lib/reminders.js groundEscalations (team-set)

function Kpi({ icon, label, value, detail, tone = 'plain', onClick, action }) {
  const body = (
    <>
      <span className="gr-kpi__label">
        <Icon name={icon} size={14} /> {label}
      </span>
      <span className="gr-kpi__value num">{value}</span>
      <span className="gr-kpi__detail">{detail}</span>
      {action && (
        <span className="gr-kpi__action">
          {action} <Icon name="arrow" size={12} />
        </span>
      )}
    </>
  );
  return onClick ? (
    <button type="button" className={`gr-kpi gr-kpi--${tone} gr-kpi--link`} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className={`gr-kpi gr-kpi--${tone}`}>{body}</div>
  );
}

function CrewCard({ member, onOpen }) {
  const em = member.openEmergency;
  const top = member.reasons[0];
  const more = member.reasons.length - 1;
  const missed = member.missed?.[0];
  const tone = em ? (em.drill ? 'drill' : 'emergency') : member.status;
  return (
    <article className={`gr-crew gr-crew--${tone}`} aria-labelledby={`gr-crew-${member.id}`}>
      <header className="gr-crew__head">
        <Avatar name={member.name} status={member.status} />
        <div className="gr-crew__who">
          <h3 id={`gr-crew-${member.id}`} className="gr-crew__name">
            {member.name}
          </h3>
          <span className="gr-crew__role">{member.title ?? member.role}</span>
        </div>
        <StatusChip status={member.status} icon />
      </header>

      {em && (
        <p className={`gr-flag gr-flag--${em.drill ? 'drill' : 'real'}`}>
          <Icon name="warning" /> Open emergency{em.drill ? ' · DRILL' : ''}
        </p>
      )}
      {missed && (
        <p className={`gr-flag gr-flag--missed`}>
          <Icon name="missed" /> {missed.text}
          {missed.missedDays >= GROUND_DAYS && <span className="gr-flag__note"> · escalated to ground</span>}
        </p>
      )}

      <div className="gr-crew__reason">
        {top ? (
          <>
            <p>{top}</p>
            {more > 0 && <span className="gr-muted">+{more} more in the file</span>}
          </>
        ) : (
          <p className="gr-muted">Nothing flagged on the latest reading.</p>
        )}
      </div>

      <footer className="gr-crew__foot">
        <FreshnessChip freshness={member.freshness} showText={false} />
        <span className="gr-muted gr-crew__age">{member.freshness.text.replace('Last record reached Earth ', '')}</span>
        <button type="button" className="gr-crew__open" onClick={() => onOpen(member.id)} aria-label={`Open ${member.name}'s medical file`}>
          Open file <Icon name="arrow" />
        </button>
      </footer>
    </article>
  );
}

export default function CrewOverview({ crew, info, emergencies = [], messages = [], missed = [], onOpen, onGo }) {
  const counts = crew.reduce((acc, m) => ({ ...acc, [m.status]: (acc[m.status] ?? 0) + 1 }), {});
  const open = emergencies.filter((e) => e.open);
  const realOpen = open.filter((e) => !e.drill).length;
  const transit = messages.filter((m) => m.status.state === 'transit').length;
  const unread = messages.filter((m) => m.status.state === 'delivered').length;
  const fresh = crew.filter((m) => m.freshness.state === 'fresh').length;
  const missedPeople = new Set(missed.map((m) => m.crewId)).size;

  return (
    <section aria-labelledby="gr-overview-title" className="gr-overview">
      <div className="gr-section-head">
        <div>
          <h2 id="gr-overview-title">Crew overview</h2>
          <p className="gr-muted">Open emergencies first, then alert, watch and normal.</p>
        </div>
      </div>

      <div className="gr-kpis">
        <Kpi
          icon="crew"
          label="Crew status"
          value={`${crew.length}`}
          detail={
            <>
              <span className="gr-dot gr-dot--alert" /> {counts.alert ?? 0} alert <span className="gr-dot gr-dot--watch" /> {counts.watch ?? 0} watch{' '}
              <span className="gr-dot gr-dot--normal" /> {counts.normal ?? 0} normal
            </>
          }
        />
        <Kpi
          icon="emergencies"
          label="Emergencies"
          value={open.length ? `${open.length} open` : 'None'}
          detail={open.length ? (realOpen ? `${realOpen} real · ${open.length - realOpen} drill` : 'Drill only') : 'No open emergency'}
          tone={realOpen ? 'alert' : open.length ? 'drill' : 'plain'}
          onClick={() => onGo('emergencies')}
          action="Follow"
        />
        <Kpi
          icon="missed"
          label="Missed routines"
          value={missed.length ? `${missedPeople} crew` : 'None'}
          detail={missed.length ? `${missed.length} item${missed.length === 1 ? '' : 's'} missed ${GROUND_DAYS}+ days` : `Nothing missed ${GROUND_DAYS}+ days (team-set)`}
          tone={missed.length ? 'watch' : 'plain'}
        />
        <Kpi
          icon="messages"
          label="Advice sent"
          value={`${messages.length}`}
          detail={transit ? `${transit} in transit · ${unread} not read yet` : unread ? `${unread} delivered, not read yet` : 'Nothing waiting'}
          onClick={() => onGo('messages')}
          action="Messages"
        />
      </div>

      <div className="gr-grid">
        {crew.map((m) => (
          <CrewCard key={m.id} member={m} onOpen={onOpen} />
        ))}
      </div>

      <p className="gr-source gr-muted">
        Data on Earth: {fresh} of {crew.length} fresh. {info.freshnessRule.label}, judged on the demo clock (day {info.missionDay}). Source: this browser,
        with synthetic crew records, simulated sensor days and readings saved on this device, scored the same way as the CMO&apos;s Crew tab.
      </p>
    </section>
  );
}
