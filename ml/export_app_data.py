"""Scores the PhysioNet nights and the Inspiration4 labs, and writes the files the app ships with.

Needs (run the earlier steps first, see ml/README.md):
    data/interim/bidsleep_nights.csv         from ml/build_nights.py
    data/interim/i4_labs_with_baseline.csv   from ml/osdr_ingest.py

Writes:
    next-app/src/data/bidsleep_nights.csv    the nights the app re-scores (copy)
    next-app/src/data/nights_scored.json     every night's status, scores and reason
    next-app/src/data/i4_personal_changes.csv  each crew member's change from their own preflight average
    ml/reports/nightly_evaluation.md         leave-people-out evaluation: z-score vs Isolation Forest

Run from the repo root:  python ml/export_app_data.py
"""

import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from i4_panel import load_labs, personal_change  # noqa: E402
from nightly_model import evaluate, score_all_nights, summary_table  # noqa: E402

import pandas as pd  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
INTERIM = ROOT / "data" / "interim"
APP = ROOT / "next-app" / "src" / "data"
REPORTS = ROOT / "ml" / "reports"

SOURCE = "PhysioNet bidsleep v1.0.1 (general human data, Earth; not astronauts)"
METHOD = "Leave-one-night-out personal median; night-to-night spread pooled across people; separate heart-rate and sleep checks"


def main():
    nights = pd.read_csv(INTERIM / "bidsleep_nights.csv")

    table = summary_table(evaluate(nights))
    REPORTS.mkdir(exist_ok=True)
    (REPORTS / "nightly_evaluation.md").write_text(
        "# Nightly heart-rate model: evaluation\n\n"
        "Anomalies planted on copies of real PhysioNet nights; people split with GroupKFold (5 folds), so the\n"
        "people used to set thresholds are never the people scored. False alarms fixed near 5% on untouched nights.\n\n"
        + table.to_markdown(index=False)
        + "\n\nThe app uses the first row: separate heart-rate and sleep checks. Isolation Forest was tested on the\n"
        "same personal deviations and not used: it catches fewer heart-rate rises and cannot say why a night was flagged.\n"
    )
    print(table.to_string(index=False))

    scored, spread, thresholds = score_all_nights(nights)
    export = {
        "source": SOURCE,
        "method": METHOD,
        "thresholds": thresholds,
        "pooled_spread": {k: round(float(v), 3) for k, v in spread.items()},
        "nights": json.loads(
            scored[["subject_id", "night_index", "rec_start_et", "status", "heart_rate_score", "sleep_score", "reason", "quality_issue"]]
            .astype({"status": str})
            .to_json(orient="records")
        ),
    }
    (APP / "nights_scored.json").write_text(json.dumps(export, indent=1))
    shutil.copyfile(INTERIM / "bidsleep_nights.csv", APP / "bidsleep_nights.csv")

    labs = personal_change(load_labs(INTERIM / "i4_labs_with_baseline.csv"))
    labs.assign(timepoint=labs["timepoint"].astype(str))[
        ["subject_id", "sex", "analyte", "units", "timepoint", "day", "phase", "value", "range_min", "range_max",
         "base_mean", "pooled_sd", "change", "z", "outside_ref_range"]
    ].to_csv(APP / "i4_personal_changes.csv", index=False)
    print("thresholds:", thresholds)
    print("wrote next-app/src/data/nights_scored.json, bidsleep_nights.csv, i4_personal_changes.csv, ml/reports/nightly_evaluation.md")


if __name__ == "__main__":
    main()
