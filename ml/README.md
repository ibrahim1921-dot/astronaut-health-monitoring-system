# ML

Every data file the app ships with is rebuilt by a script in this folder. Run everything from the
repository root: `pip install -r ml/requirements.txt`.

## Pipeline

| Step | Command | Input | Output |
| --- | --- | --- | --- |
| Synthetic crew | `python ml/generate_data.py --out next-app/src/data` | published resting values (in the script) | `crew.json`, `ml/planted_events.json` |
| PhysioNet download | `python ml/fetch_bidsleep.py` | PhysioNet bidsleep v1.0.1 | `data/raw/bidsleep/` (about 37 MB) |
| Nights table | `python ml/build_nights.py` | `data/raw/bidsleep/` | `data/interim/bidsleep_nights.csv` |
| Inspiration4 download | `python ml/osdr_ingest.py` | NASA OSDR OSD-569, OSD-575 | `data/interim/i4_labs_with_baseline.csv` |
| Nights + labs scoring | `python ml/export_app_data.py` | the two interim files | `nights_scored.json`, `bidsleep_nights.csv`, `i4_personal_changes.csv`, `ml/reports/nightly_evaluation.md` |
| Muscle and fitness | `python ml/fitness.py` | `data/raw/bodyPerformance.csv` | `fitness.json` |
| Station environment | `python ml/environment.py` | `data/raw/RR-1_EDA_*.csv` | `environment.json` |

App outputs go to `next-app/src/data/`. Raw and interim data are not committed (`/data/` is in
`.gitignore`). Running the pipeline from the raw files gives byte-identical copies of the files
the app ships with.

## Models and how they were tested

**Personal baseline (daily vitals).** Each reading is compared with cited limits, with the
person's own last 14 days (z-score; alert-level days are left out of the baseline) and for slow
drift (smoothed average vs mission start). Runs in the app (`next-app/src/lib/baseline.js`).
Tested on the synthetic crew with planted events (`ml/planted_events.json`); see
`notebooks/baseline_ml_colab.ipynb`.

**Nightly heart rate and sleep (real PhysioNet nights, 47 people, 253 nights).**
Leave-one-night-out personal median, night-to-night spread pooled across other people, separate
heart-rate and sleep checks. Anomalies planted on copies of real nights; people split with
GroupKFold so thresholds never come from the people being scored; false alarms fixed near 5%.
Results in `reports/nightly_evaluation.md`. Isolation Forest was tested the same way and not
used: it caught fewer heart-rate rises and cannot explain a flag.

**Inspiration4 labs (NASA, 4 crew, 7 blood draws).** Change from each person's own preflight
average, scaled by the preflight spread pooled across the crew. Descriptive only.

**Muscle and fitness (Body performance, 13,393 adults).** Age- and sex-specific percentile
curves (kernel-weighted percentiles), smoothing width picked by 5-fold cross-validation and
checked on a 20% hold-out: about 5% of unseen people fall below the 5th-percentile line and 50%
below the median. In the app, grip strength is compared with the person's own preflight value.

**Station environment (NASA RR-1, ISS 2014).** Cabin CO2, temperature and humidity checked
against NASA-STD-3001 lines (in `next-app/src/content/limits.js`), plus "unusual for this
cabin": each day against the previous 7 days (median and robust spread). Tested by planting
spikes on random days; results are in `environment.json` under `evaluation`.

## Labels

Every output says where it came from: Synthetic, General human data (PhysioNet, Body
performance), NASA (Inspiration4), or Environment (RR-1). Sources are never merged into one
training table.

`experiments/` holds what we tried and did not ship, with the reasons.
