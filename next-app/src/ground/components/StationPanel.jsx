'use client';

// Station environment: the crew app's Environment view (cabin CO₂, temperature and humidity tiles and
// the radiation chart), imported unchanged. It reads the bundled environment.json.
// MissionProvider reads the same mission setting as the crew app (ahm.missionProfile.v1), so the title
// and the "Sample: ISS data" label follow the current mission. Read only: canChange is false.

import Environment from '../../views/Environment.jsx';
import { MissionProvider } from '../../hooks/useMission.jsx';

export default function StationPanel() {
  return (
    <section aria-labelledby="gr-station-title" className="gr-station">
      <div className="gr-section-head">
        <div>
          <h2 id="gr-station-title">Station</h2>
          <p className="gr-muted">Read only. Habitat measurements, not any crew member&apos;s personal exposure.</p>
        </div>
      </div>
      <MissionProvider canChange={false}>
        <Environment />
      </MissionProvider>
    </section>
  );
}
