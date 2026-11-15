# Crew Health Monitor

A web app that checks each astronaut's daily readings against their own normal and against published limits, explains every change in plain words, and keeps working with no link to Earth.

Not a medical device. Prototype using synthetic and public data.

TODO: add screenshot

## Links

- Live app: TODO: deployed URL
- 30-second demo video: TODO: video link
- Challenge: "Create Health Monitoring Software for Astronauts" (NASA Space Apps Challenge 2026, Brazilian Space Agency)

## Team

- TODO: Name, frontend
- TODO: Name, backend
- TODO: Name, machine learning
- TODO: Name, role
- TODO: Name, role (optional)
- TODO: Name, role (optional)

## Summary

Crew Health Monitor is a health app for a small crew far from Earth. Each morning a crew member confirms readings from simulated worn sensors or enters them by hand. Every reading gets a status of normal, watch or alert from three checks: published limits, the same person's last 14 days, and slow drift since the mission started. Each flag says what changed, which line it crossed and its source, why it matters in space, and what to do next. The Crew Medical Officer sees the whole crew, records exams and runs an emergency guide with CPR steps adapted to weightlessness or partial gravity. Everything is scored on the device first, so the app works during a communication blackout or with a 20-minute signal delay to Mars.

## What the app does

### Personal baselines and status

- Each reading is checked three ways: against published limits (AHA, ADA, CDC, Cleveland Clinic, AASM/SRS, NASA-STD-3001, Canadian Space Agency), against the same person's last 14 days (z-score), and for slow drift (a smoothed average that stays off the mission-start average).
- The worst of the three sets the status: normal, watch or alert. Alert-level days are left out of the baseline, so a fever never becomes "normal".
- Every limit lives in one file, `next-app/src/content/limits.js`, with its source. Lines the team chose where no published line fits are labelled "Team-set" in the app.
- The About screen lists every source, every team-set line and how the models were tested.

### Simulated sensor feed and pre-filled check-ins

- Four simulated worn devices fill in the morning check-in: a Bio-Monitor style smart shirt (blood pressure, pulse), a continuous glucose monitor, a core-temperature headband and a wrist actigraph (sleep). Values are simulated from each person's synthetic crew data.
- The crew member confirms the sensor values or enters any reading by hand. Mood is always self-rated; sensors never produce it.
- Each check-in screen has a short how-to (posture, timing, what skews the reading), and each result shows the reason, the person's usual range and what to do now.
- Every saved reading shows where it came from (sensor or entered by hand).

### Body map, Vitals, "Why it matters in space" and "What to do"

- The dashboard shows a body map (head, chest, abdomen, bones and muscles) coloured by status, an overall score and reading cards with sparklines of recent days.
- The Vitals screen shows each reading with its limits and source.
- Each reading has a short "Why it matters in space" note with its source (for example core temperature rising on long missions, Stahn et al. 2017; short sleep on the station, Barger et al. 2014).
- Watch and alert results come with "What to do" steps, such as repeating the reading at the next check-in or telling the Crew Medical Officer today.

### Crew Medical Officer

- One crew member (Lena Kowalski in the demo) is the Crew Medical Officer (CMO) and gets a crew overview, worst status first.
- The CMO can switch to any crew member's dashboard (read only) and back to their own.
- The CMO can record an exam (blood pressure, heart rate) for a crew member. The record shows who entered it, and the crew member sees a notice.
- Each time the CMO opens someone's dashboard it is written to an access log. Crew members see who viewed their data under About, "Your data".

### Emergency mode

- Two flows: chest pain while awake, and collapsed or not responding. If a person with chest pain stops responding, one button moves to the collapse flow.
- CPR steps follow the AHA/ERC adult basic life support guidelines (100–120 compressions a minute, 5–6 cm deep, swap every 2 minutes, AED as soon as it arrives), with a beat and a swap timer on screen.
- The compression position changes with the environment: Evetts-Russomano and handstand methods on a station or spacecraft (Hinkelbein et al. 2020 microgravity CPR guideline), and kneeling CPR on the Moon or Mars, which the team set because the 2020 guideline does not cover partial gravity.
- Every event is time-stamped, and the app builds a summary for the flight surgeon with the patient's latest readings and the signal delay. If the CMO is the patient, the app says to contact the flight surgeon now.

### Mission environments

- Five profiles: space station (low Earth orbit), spacecraft to the Moon, Moon base, spacecraft to Mars, Mars base.
- Each profile sets gravity (0 g in flight, 0.17 g on the Moon, 0.38 g on Mars, from the NASA Planetary Fact Sheet) and the one-way signal delay (about 1.3 s to the Moon; 20 minutes to Mars as a demo value, real range about 3–22 minutes).
- The profile changes what the app shows: the delay on escalation steps, how far help is, the radiation line, the stand-test prompt for arrival in gravity, the CPR position and the Crew Journey route.

### Reminders and escalation

- Reminders for the morning check-in (due by 10:00 crew time, which is UTC), repeating a watch reading, checking a sensor with no data, the weekly grip-strength test, the stand test, CMO exams for anyone on alert with no exam in 24 hours, and unread ground messages.
- One missed day makes a reminder overdue; 2 missed days in a row show on the CMO's crew overview; 3 missed days are also listed for the ground console.
- Optional browser notifications while the app is open, at most once per reminder a day, none between 22:00 and 06:00 crew time. All reminder timings are team-set and labelled that way.

### Health activities

- Reaction Run: a 3-minute reaction game that tracks alertness, compared with the person's own usual (median of the last 7 sessions).
- Calm Orbit: 2 minutes of slow breathing (5 s in, 5 s out).
- Crew Journey: crew members log exercise minutes, and the whole crew's minutes move one ship along an Earth–Moon or Earth–Mars route (game scale, not real distances).
- Mission patches are earned only for taking part, never for scores. Game results are logged and never change a health status.

### Ground console for the flight surgeon

- A separate page at `/ground` with a crew overview, a detail page per crew member, emergencies, messages to the crew and a station view.
- Times are shown in UTC, with when each record would reach Earth given the profile's signal delay.
- A one-page printable summary per crew member.
- In this version the console reads the data saved in the same browser; a Supabase-backed source is planned (see Limitations).

### Offline-first, with an optional onboard server

- Every reading is scored on the device and saved in the browser first, so the app works with no network.
- When the optional onboard server (Supabase) is set up and reachable, readings, exams, the access log and emergency events are synced to it, and the server re-scores each reading; its result is the official one, and the app says when it differs from the device's.
- Without Supabase the app shows "Onboard server offline: saved on this device" and keeps working.

## How it works

```
 Raw downloads (PhysioNet, NASA OSDR, Kaggle)
          |
          v
 Python pipeline (ml/)  ----->  bundled JSON/CSV in next-app/src/data/
                                          |
                                          v
                      Next.js app (browser, JavaScript)
                      - scoring in src/lib/, limits in src/content/limits.js
                      - saves to localStorage first
                                          |
                          when reachable  |  (optional)
                                          v
                      Next.js API routes (src/app/api/)
                      - checks the signed-in user's role in the database
                                          |
                                          v
                      Supabase (Postgres + auth, row-level security)
```

- **App.** Next.js 15 and React 19, written in JavaScript. All scoring logic is in `next-app/src/lib/`, and each file has a test next to it.
- **Local first.** Check-ins, exams, stand tests, emergencies, reminders and activities are saved in the browser's localStorage. An outbox retries anything that has not reached the onboard server.
- **Optional sync.** API routes in `next-app/src/app/api/` sign in demo accounts on the server and accept synced records. The server decides who may write what from the `crew_members` role in the database, never from the browser. For example, a reading for another crew member is accepted only as a CMO exam entered by a user whose role is `cmo`.
- **Data pipeline.** Python scripts in `ml/` build every data file the app ships with. Running them from the raw downloads gives byte-identical copies of the bundled files. See [ml/README.md](ml/README.md).

## Models and how we tested them

The daily crew vitals, stand tests and fitness tests are **synthetic**, for a fictional 4-person crew (built by `ml/generate_data.py` and `ml/fitness.py`). The models below were built and tested on real public data where it exists.

- **Personal baseline (daily vitals, synthetic crew).** Limits, a 14-day z-score and slow drift, as described above. It runs in the app (`next-app/src/lib/baseline.js`) and was tested on the synthetic crew with planted events (`ml/planted_events.json`, `ml/notebooks/baseline_ml_colab.ipynb`).
- **Nightly heart rate and sleep (real PhysioNet nights, 47 adults, 253 nights).** Each night is compared with the same person's other nights. Anomalies were planted on copies of real nights, and people were split with GroupKFold (5 folds), so thresholds never come from the people being scored. With false alarms held near 5% (6% measured on untouched nights), the app's detector catches a rise of 12 bpm in sleeping heart rate 83% of the time, 8 bpm 45%, 5 bpm 19%, 3 bpm 11%, and disrupted sleep 29%. Full table: [ml/reports/nightly_evaluation.md](ml/reports/nightly_evaluation.md).
- **Grip strength percentiles (Body performance, 13,393 adults).** Age- and sex-specific percentile curves, smoothing width picked by 5-fold cross-validation and checked on a 20% hold-out: 4.4% of unseen people fall below the 5th-percentile line and 49% below the median. In the app, grip strength is also compared with the person's own preflight value.
- **Unusual cabin days (NASA RR-1, ISS 2014).** Each day is compared with the previous 7 days (median and robust spread). In 200 trials per measure with planted spikes, 91% of 1.5 °C temperature jumps, 59% of 10% humidity jumps and 47% of 0.6 mmHg CO₂ jumps were caught, while 1.8% of real days were flagged (not all of them false alarms; some are real cabin changes).
- **Inspiration4 labs (NASA, 4 crew, 7 blood draws).** Change from each person's own preflight average, scaled by the preflight spread pooled across the crew. Descriptive only.

**Models we tested and did not use**

- **Isolation Forest** on the same nightly data: 7% false alarms and it caught 66% of 12 bpm rises and 30% of 8 bpm rises, fewer than the app's detector, and it cannot say why a night was flagged.
- **One combined z-score** for heart rate and sleep: caught more disrupted sleep (57%) but only 61% of 12 bpm rises.
- **A population risk classifier** (Random Forest and an autoencoder, in `ml/experiments/`). It scored 100% accuracy, but the rows mixed columns from different datasets, so they were not real people; the labels came from a hand-written rule the forest learned back; its lines disagreed with the cited limits (for example 130 mg/dL fasting glucose counted as "optimal"); it had no personal baseline; and the autoencoder flagged 5% of healthy rows by design. Reasons in full: [ml/experiments/README.md](ml/experiments/README.md).

## NASA data

| Dataset or standard | What we used it for |
| --- | --- |
| NASA OSDR, Inspiration4 blood panels ([OSD-569](https://osdr.nasa.gov/bio/repo/data/studies/OSD-569), [OSD-575](https://osdr.nasa.gov/bio/repo/data/studies/OSD-575)) | Lab baseline: each crew member's change from their own preflight average, 92 days before launch to 194 days after |
| NASA OSDR [Environmental Data Application](https://visualization.osdr.nasa.gov/eda/), Rodent Research-1 (ISS, 2014) | Environment view: station radiation dose timeline and cabin CO₂, temperature and humidity; the "unusual cabin day" check |
| [NASA-STD-3001 Volume 2](https://www.nasa.gov/reference/6-0-natural-and-induced-environments-vol-2), 6.0 Natural and Induced Environments | Cabin CO₂ alert line: 1-hour average above 3 mmHg |
| [NASA OCHMO-TB-004 Carbon Dioxide](https://www.nasa.gov/ochmo-tb-004-carbon-dioxide-2/) | Cabin CO₂ watch line: 7-day average at or above 2.5 mmHg |
| [NASA OCHMO-TB-002 ECLSS](https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-002-eclss.pdf) | Cabin temperature (18–27 °C) and humidity (25–75%) alert lines |
| NASA-STD-3001 Volume 1 (crew health) | "Why it matters in space" note on radiation: the 600 mSv career dose limit (no link in the code; TODO: add URL) |
| [NASA Human Research Program, five hazards](https://www.nasa.gov/hrp/hazards) and [risks](https://www.nasa.gov/hrp/risks/) of human spaceflight | "Why it matters in space" note on mood (isolation and confinement), background on the About screen |
| [NASA Planetary Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/) | Surface gravity of the Moon (about 0.17 g) and Mars (about 0.38 g) in the mission profiles |

Data and visualizations for the environment view are courtesy of the Environmental Data Application (EDA), NASA Open Science Data Repository. The RR-1 values are station measurements, not any crew member's personal exposure.

## Other data and resources

**Space agency partners**

- Canadian Space Agency (CSA): [What happens to muscles in space?](https://asc-csa.gc.ca/eng/sciences/osm/muscles.asp), the source of the grip-strength alert line (20% drop, from "up to 20% loss of muscle mass on flights of 5 to 11 days"). The simulated smart shirt is modelled on the CSA Bio-Monitor.
- European Space Agency (ESA): the simulated core-temperature headband is modelled on an ESA T-Mini style sensor. No ESA dataset is used.
- Brazilian Space Agency: owner of the challenge. No Brazilian Space Agency dataset is used. TODO: confirm whether any AEB resource should be cited.

**Public human data**

- [PhysioNet: Multi-night heart rate and sleep dataset v1.0.1](https://physionet.org/content/bidsleep-dataset/1.0.1/) (47 healthy adults on Earth, 253 nights). Licence: Open Data Commons Attribution v1.0 (ODC-By 1.0), as noted in `ml/fetch_bidsleep.py`. Used for the nightly heart-rate and sleep model.
- [Kaggle: Body performance data](https://www.kaggle.com/datasets/kukuroo3/body-performance-data) (13,393 adults aged 21–64: grip strength, broad jump, sit-ups). Licence: TODO: confirm licence. Used for fitness percentiles by age and sex.

**Clinical guidelines and papers**

- American Heart Association: blood pressure and heart rate lines.
- American Diabetes Association, Standards of Care in Diabetes: fasting blood sugar lines.
- CDC and Cleveland Clinic: fever and hypothermia lines.
- AASM and Sleep Research Society consensus: sleep duration lines.
- Freeman et al. 2011, Clin Auton Res 21:69–72: stand test (orthostatic hypotension) definition.
- Basner, Mollicone & Dinges 2011, Acta Astronautica 69:949–959: brief psychomotor vigilance test (PVT-B) definitions.
- Hinkelbein et al. 2020, Scand J Trauma Resusc Emerg Med 28:108: CPR in microgravity (DGLRM and ESAM-SMG guideline).
- AHA and European Resuscitation Council adult basic life support guidelines: CPR rate, depth and AED steps.
- Stahn et al. 2017, Scientific Reports 7:16180: core body temperature rise on long missions.
- Barger et al. 2014, Lancet Neurology 13:904–912: sleep deficiency in astronauts.

**Open-source libraries** (licences read from each package in `next-app/node_modules`)

- Next.js 15.5.29, MIT
- React, React DOM and react-is 19.1.10, MIT
- Recharts 3.10.1, MIT
- @supabase/supabase-js 2.119.0, MIT
- Python (`ml/requirements.txt`): NumPy, pandas, SciPy, scikit-learn, Matplotlib, Requests, Pillow, tabulate. Licences: TODO: confirm licence (not recorded in the repo).

**Images**

- `scripts/assets/skeleton.png`: the line drawing behind the body map, turned into `next-app/public/skeleton-light.png` by `scripts/make-skeleton-light.py`. Origin and licence: TODO: confirm licence.
- The CPR position figures are inline SVG drawn in `next-app/src/components/CprFigure.jsx`.

## Use of AI

TODO: complete this paragraph before submitting.

We used AI coding assistants to help write and review code, tests and documentation. Every change was planned, reviewed and tested by the team. All health limits, sources and medical text were chosen by the team and cite their sources. No AI-generated images, audio or NASA branding are used.

## Run it locally

You need Node.js (TODO: confirm the minimum version) and npm.

```
cd next-app
npm install
npm run dev      # http://localhost:3000
npm test
```

`npm run build` makes a production build.

**Demo accounts.** The landing page has 4 doors, one per crew member: Maya, Tomas, Lena and Kwame. One click signs you in, with no sign-up and no password. Lena Kowalski is the Crew Medical Officer and also gets the crew overview. The ground console is at http://localhost:3000/ground.

**Demo controls** (More, then Demo controls) only affect this browser:

- advance the demo clock one day, or go back to the start;
- switch the mission environment;
- add a simulated sensor event for a crew member (fever for 3 days, a poor-sleep week, or a high-stress week) and watch the statuses change;
- see which missed items have reached the ground list (advance a few days without checking in);
- remove the check-ins saved in this browser.

**Onboard server (optional).** The app runs without it. To try sync, create a Supabase project, set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `DEMO_ACCOUNT_PASSWORD` in `next-app/.env.local` (never commit it), run the SQL files in `next-app/supabase/migrations/` in date order and then `next-app/supabase/seed.sql`. `next-app/supabase/reset_demo.sql` clears synced data and re-seeds, and `check_demo_users.sql` is a read-only check of the demo users. After regenerating `crew.json`, run `npm run seed:build` in `next-app/` to rebuild the SQL.

**Rebuild the data (optional).** `pip install -r ml/requirements.txt`, then follow the pipeline in [ml/README.md](ml/README.md).

## Limitations and next steps

- The crew data is synthetic. The models were tested on public Earth data (PhysioNet, Body performance) and station data (RR-1), not on astronauts' daily readings.
- Without Supabase, records stay on the device where they were entered. Two devices do not see each other's check-ins.
- There is no service worker, so the app needs a network connection to load the first time. Once loaded, scoring and saving work offline.
- The ground console reads the same browser's data. A second pass will connect it to the onboard server, and message read receipts need an inbox in the crew app.
- Sign-in is one click per demo account. A real crew would need personal sign-in, such as a PIN per crew member.
- Several body-map readings are still labelled sample data (for example bone density, optic nerve sheath, kidney stone risk). Radiation is shown only as the station's RR-1 dose, not a personal dose.
- Some lines are team-set where no published line fits (for example low blood pressure, resting heart rate above 120 bpm, sleep under 4.5 hours, kneeling CPR in partial gravity). They are labelled in the app and need medical review.
- Browser notifications only work while the app is open.

## Licence

MIT, see [LICENSE](LICENSE). Datasets keep their own licences, listed above.
