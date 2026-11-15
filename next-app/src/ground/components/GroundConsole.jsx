'use client';

// The flight surgeon's console: mission header, emergency band, sidebar and the current view. Views live
// in the URL hash (#/overview, #/crew/<id>, #/emergencies, #/messages, #/station), so Back works and a
// view can be linked to without changing the app's routes.

import { useCallback, useEffect, useState } from 'react';
import { useGroundData } from '../hooks/useGroundData.js';
import { Icon, Mark, signalText, utcClock } from './GroundBits.jsx';
import CrewOverview from './CrewOverview.jsx';
import CrewDetail from './CrewDetail.jsx';
import EmergencyPanel from './EmergencyPanel.jsx';
import MessagesPanel from './MessagesPanel.jsx';
import StationPanel from './StationPanel.jsx';
import PrintSummary from './PrintSummary.jsx';

const NAV = [
  { id: 'overview', label: 'Crew overview' },
  { id: 'emergencies', label: 'Emergencies' },
  { id: 'messages', label: 'Messages' },
  { id: 'station', label: 'Station' },
];

const EMPTY_DRAFT = { to: 'cmo', subject: '', body: '', priority: 'routine', related: { kind: null, id: null } };

function parseHash(hash) {
  const [view = 'overview', id = null] = hash.replace(/^#\/?/, '').split('/');
  if (view === 'crew' && id) return { view: 'crew', id };
  return { view: NAV.some((n) => n.id === view) ? view : 'overview', id: null };
}

function useRoute() {
  const [route, setRoute] = useState({ view: 'overview', id: null });
  useEffect(() => {
    const read = () => setRoute(parseHash(window.location.hash));
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  const go = useCallback((view, id = null) => {
    window.location.hash = id ? `#/${view}/${id}` : `#/${view}`;
    document.getElementById('gr-main')?.focus({ preventScroll: false });
  }, []);
  return [route, go];
}

/** UTC clock that ticks every second (rendered after mount, so server and client HTML match). */
function UtcClock() {
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="num">{now ? utcClock(now) : '--:--:--'}</span>;
}

function Header({ info }) {
  const profile = info?.profile;
  return (
    <header className="gr-top">
      <div className="gr-brand">
        <Mark />
        <div className="gr-brand__text">
          <span className="gr-brand__eyebrow">
            <span className="gr-pill">GROUND</span> Flight surgeon console
          </span>
          <h1 className="gr-brand__title">Mission Control</h1>
        </div>
      </div>
      {info && (
        <dl className="gr-strip">
          <div className="gr-strip__item">
            <dt>Mission</dt>
            <dd title={profile.title ?? profile.label}>{profile.title ?? profile.label}</dd>
          </div>
          <div className="gr-strip__item">
            <dt>Mission day</dt>
            <dd>
              <span className="num">{info.missionDay}</span> <span className="gr-muted">· {info.today}</span>
            </dd>
          </div>
          <div className="gr-strip__item">
            <dt>
              <Icon name="signal" size={12} /> Signal
            </dt>
            <dd>{signalText(profile)}</dd>
          </div>
          <div className="gr-strip__item">
            <dt>
              <Icon name="clock" size={12} /> UTC
            </dt>
            <dd>
              <UtcClock />
            </dd>
          </div>
        </dl>
      )}
    </header>
  );
}

function Band({ band, onOpen }) {
  if (!band) return null;
  return (
    <div className={`gr-band gr-band--${band.kind}`} role="region" aria-label={band.kind === 'drill' ? 'Emergency drill in progress' : 'Emergency in progress'}>
      <span className="gr-band__mark" aria-hidden="true">
        <Icon name="warning" size={16} />
      </span>
      <span className="gr-band__text">
        {band.text}
        {band.count > 1 && <span className="gr-band__more"> · {band.count} open</span>}
      </span>
      <button type="button" className="gr-btn gr-btn--band" onClick={onOpen}>
        Follow the emergency
        <Icon name="arrow" />
      </button>
    </div>
  );
}

export default function GroundConsole() {
  const { source, version, data, refresh } = useGroundData();
  const [route, go] = useRoute();
  const [draft, setDraft] = useState(EMPTY_DRAFT);

  /** Open the composer pre-filled (e.g. "Reply to CMO about this"). */
  const compose = useCallback(
    (partial) => {
      setDraft({ ...EMPTY_DRAFT, ...partial });
      go('messages');
    },
    [go],
  );

  const openCount = data?.emergencies?.filter((e) => e.open).length ?? 0;
  const transitCount = data?.messages?.filter((m) => m.status.state === 'transit').length ?? 0;
  const active = route.view === 'crew' ? 'overview' : route.view;

  let view;
  if (!data) view = <p className="gr-muted gr-loading">Reading this browser&apos;s data…</p>;
  else if (data.error) view = <p className="gr-error" role="alert">{data.error}</p>;
  else if (route.view === 'crew')
    view = <CrewDetail source={source} version={version} crewId={route.id} info={data.info} onBack={() => go('overview')} onCompose={compose} />;
  else if (route.view === 'emergencies') view = <EmergencyPanel emergencies={data.emergencies} onCompose={compose} />;
  else if (route.view === 'messages')
    view = <MessagesPanel source={source} messages={data.messages} draft={draft} setDraft={setDraft} info={data.info} onSent={refresh} />;
  else if (route.view === 'station') view = <StationPanel />;
  else
    view = (
      <CrewOverview
        crew={data.crew}
        info={data.info}
        emergencies={data.emergencies}
        messages={data.messages}
        missed={data.missed ?? []}
        onOpen={(id) => go('crew', id)}
        onGo={go}
      />
    );

  const badge = (id) => {
    if (id === 'emergencies' && openCount > 0) return <span className="gr-count gr-count--alert">{openCount} open</span>;
    if (id === 'messages' && transitCount > 0) return <span className="gr-count">{transitCount} in transit</span>;
    return null;
  };

  return (
    <div className="gr-console">
      <div className="gr-screen">
        <a className="gr-skip" href="#gr-main">
          Skip to content
        </a>
        <Header info={data?.info} />
        <Band band={data?.band} onOpen={() => go('emergencies')} />
        <div className="gr-shell">
          <nav className="gr-nav" aria-label="Console">
            <ul>
              {NAV.map((n) => (
                <li key={n.id}>
                  <a href={`#/${n.id}`} className={`gr-nav__link${active === n.id ? ' is-active' : ''}`} aria-current={active === n.id ? 'page' : undefined}>
                    <span className="gr-nav__icon">
                      <Icon name={n.id} size={16} />
                    </span>
                    <span className="gr-nav__label">{n.label}</span>
                    {badge(n.id)}
                  </a>
                </li>
              ))}
            </ul>
            <div className="gr-nav__foot">
              <span className="gr-demo-chip">Demo data</span>
              <p className="gr-muted">Reads this browser&apos;s crew app data. A live link to the onboard server comes later. Times in UTC.</p>
            </div>
          </nav>
          <main id="gr-main" className="gr-main" tabIndex={-1}>
            {view}
          </main>
        </div>
      </div>
      {route.view === 'crew' && source && data && !data.error && <PrintSummary source={source} version={version} crewId={route.id} />}
    </div>
  );
}
