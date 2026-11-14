# Crew Health Monitor

NASA Space Apps Challenge 2026: *Create Health Monitoring Software for Astronauts on Space Missions*.

Crew Health Monitor checks each astronaut's daily readings against their own normal and against
published limits, explains every change in plain words, says what to do next, and keeps working
with no link to Earth. The Crew Medical Officer sees the whole crew at a glance.

> Prototype for decision support. Not a medical device and not a diagnosis. Crew data is synthetic,
> for a fictional crew.

## What it does

| Tab | What you see |
| --- | --- |
| **Dashboard** | Body map (head, chest, abdomen, bones and muscles) coloured by status, an overall health score, and six cards: sleep, reaction time, mood, blood pressure, resting heart rate, core temperature. Every card has a 14-day sparkline and the limits behind it. |
| **Check-in** | One reading per screen with a how-to (posture, timing, what skews it), then a result per reading with the reason, the person's usual range and what to do now. A crisis goes to the Crew Medical Officer with the signal delay to Earth. |
| **Sleep & recovery** | Real PhysioNet nights scored against the same person's other nights, with a reason for every flagged night. Log tonight's night and get a score. |
| **Lab baseline** | NASA Inspiration4 blood panels: each crew member's change from their own preflight average. MCV fell in all four after flight while staying inside the normal lab range. |
| **Environment** | ISS radiation dose per day and in total, and cabin CO₂, temperature and humidity checked against NASA-STD-3001, with days that were unusual for the cabin. |
| **Stand test** | Lying-to-standing heart rate and blood pressure test for arrival in gravity (Moon, Mars), scored with the 2011 consensus definition of orthostatic hypotension. |
| **Crew Medical Officer** | Every crew member, worst first, with their change from preflight and the newest flagged readings. |
| **About** | How statuses are decided, the models and how they were tested, every data source and every limit with its source. |

Mission profiles (ISS, Moon, Mars transit) change the signal delay shown with escalation steps
(about 1.3 s to the Moon; 3–22 minutes to Mars, 20 minutes used in the demo) and turn on the
stand-test prompt for arrival in gravity.

## How statuses are decided

Each reading gets **normal**, **watch** or **alert** from the worst of three checks:

1. **Published limits.** AHA (blood pressure, heart rate), ADA (blood sugar), CDC and Cleveland
   Clinic (temperature), AASM (sleep), NASA-STD-3001 (cabin air), Canadian Space Agency (muscle
   loss). Lines the team set are labelled "team-set" in the app.
2. **Personal baseline.** The same person's last 14 days (z-score). Alert-level days are left out
   of the baseline, so a fever never becomes "normal".
3. **Slow drift.** A smoothed average that stays off the mission-start average for 5 days.

Every limit lives in one file, `next-app/src/content/limits.js`, and the About tab lists them all.

## Data

| Label in the app | Source | Used for |
| --- | --- | --- |
| Synthetic | `ml/generate_data.py`, `ml/fitness.py` (fictional crew) | Daily vitals, stand tests, fitness tests |
| General human data (PhysioNet) | [Multi-night heart rate and sleep dataset v1.0.1](https://physionet.org/content/bidsleep-dataset/1.0.1/), 47 adults, 253 nights, ODC-By 1.0 | Nightly heart-rate and sleep model |
| NASA (Inspiration4) | NASA OSDR [OSD-569](https://osdr.nasa.gov/bio/repo/data/studies/OSD-569) and [OSD-575](https://osdr.nasa.gov/bio/repo/data/studies/OSD-575) | Lab baseline |
| Environment (NASA RR-1) | NASA OSDR [Environmental Data Application](https://visualization.osdr.nasa.gov/eda/), Rodent Research-1 | Radiation and cabin air |
| General human data (Body performance) | [Body performance data](https://www.kaggle.com/datasets/kukuroo3/body-performance-data), 13,393 adults | Fitness percentiles for age and sex |

Sources are never merged into one training table. How every file is built, and how each model
was tested, is in [ml/README.md](ml/README.md). Data and visualizations for the environment view
are courtesy of the Environmental Data Application (EDA), NASA Open Science Data Repository.

## Run the app

```
cd next-app
npm install
npm run dev      # http://localhost:3000
npm test         # 120+ tests: scoring, limits, baselines, sync, stand test, environment, fitness
npm run build
```

Choose any of the 4 crew members on the landing page: Maya, Tomas, Lena or Kwame. Lena Kowalski is
the Crew Medical Officer and also gets the whole-crew view. No sign-up, no password.

Without Supabase settings the app runs on the device only ("Onboard server offline: saved on this device").

## Onboard database (optional)

Set these in `next-app/.env.local` and in Vercel:

| Variable | Where |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server |
| `SUPABASE_SERVICE_ROLE_KEY` | server only |
| `DEMO_ACCOUNT_PASSWORD` | server only |

In the Supabase SQL editor, run `next-app/supabase/migrations/20261113000000_onboard_db.sql`
once, then `next-app/supabase/seed.sql`. `next-app/supabase/reset_demo.sql` removes everything
synced from devices and re-seeds. After regenerating `crew.json`, run `npm run seed:build` in
`next-app/` to rebuild both SQL files.

Demo logins are created on first use: the first click on a crew member's door creates their auth
user and links it to their `crew_members` row. `next-app/supabase/check_demo_users.sql` is a
read-only check (select only) that shows which of the crew are linked and that only crew-03 is the CMO.

## Rebuild the data

The app ships with its data in `next-app/src/data/`. To rebuild it from the raw downloads, follow
the pipeline in [ml/README.md](ml/README.md); the result is identical to the shipped files.

The body map image is built with `python scripts/make-skeleton-light.py` from
`scripts/assets/skeleton.png`.

## Project layout

| Path | What |
| --- | --- |
| `next-app/` | The app (Next.js, JavaScript). Scoring logic is in `src/lib/`, each file with a test. |
| `next-app/src/app/api/` | The onboard server's API routes |
| `next-app/supabase/` | Database schema, seed and reset scripts |
| `ml/` | Data pipeline, models, notebooks, evaluation reports, and experiments we did not ship |
| `scripts/` | Body map image builder |

## Team

| Name | Role |
| --- | --- |
| _Name_ | Frontend |
| _Name_ | Backend |
| _Name_ | Machine learning |
| _Name_ | _Role_ |

## Use of AI

_To fill in before submitting: which AI tools the team used (for example coding assistants and
chat models), what for (code, data analysis, writing), and how the output was checked (tests,
review, comparing with sources)._

## Licence

MIT, see [LICENSE](LICENSE). Data sets keep their own licences (see the Data table).
