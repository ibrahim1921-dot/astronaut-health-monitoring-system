'use client';

import { useEffect, useRef } from 'react';
import { DEMO_ACCOUNT_LIST, roleNoteFor } from '../lib/demoAccounts.js';
import { useOnboard } from '../hooks/useOnboard.jsx';
import EmergencyButton from './EmergencyButton.jsx';

/** Signed-out state: what the app is, and one demo door per crew member. No sign-up, no password. */
export default function Landing() {
  const { enter, busy, server } = useOnboard();
  const headingRef = useRef(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className="landing">
      <div className="landing__topbar">
        <EmergencyButton />
      </div>
      <section className="card card--lg landing__panel" aria-labelledby="landing-title">
        <p className="cmo__eyebrow">Demo mission</p>
        <h1 id="landing-title" ref={headingRef} tabIndex={-1} className="landing__title">
          Crew health monitor
        </h1>
        <p className="landing__lede">
          Daily vitals and stand tests for a {DEMO_ACCOUNT_LIST.length}-person spaceflight crew, checked on the device against each person’s own baseline
          and published limits, with a live whole-crew view for the Crew Medical Officer.
        </p>

        <div className="landing__doors" role="group" aria-label="Choose a demo person">
          {DEMO_ACCOUNT_LIST.map((a) => (
            <button
              key={a.who}
              type="button"
              className="landing__door"
              onClick={() => enter(a.who)}
              disabled={busy}
            >
              <span className="landing__door-name">
                {a.button}
                {a.role === 'cmo' && <span className="landing__pill">CMO</span>}
              </span>
              <span className="landing__door-note">{roleNoteFor(a)}</span>
            </button>
          ))}
        </div>

        <p className="muted landing__note">
          Demo accounts: one click, no sign-up and no password.{' '}
          {server === 'connected'
            ? 'Onboard server: connected.'
            : server === 'offline'
              ? 'Onboard server offline: everything is saved on this device.'
              : ''}
        </p>
      </section>
      <p className="landing__foot muted">
        Crew data is synthetic, for a fictional crew. Sleep nights are general human data from PhysioNet; lab values
        are from NASA’s Inspiration4 mission; station radiation and cabin air from NASA&apos;s RR-1 mission. Prototype for
        decision support: not a medical device and not a diagnosis.
      </p>
    </main>
  );
}
