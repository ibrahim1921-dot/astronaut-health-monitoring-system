"""Build one row per person per night from the raw PhysioNet bidsleep files.

Dataset: "A Multi-Night Instantaneous Heart Rate and Accelerometry Dataset with EEG Sleep
Stage Labels" v1.0.1, PhysioNet, ODC-By 1.0. Healthy adults on Earth, not astronauts.

Each night folder has:
  hr.csv      unix timestamp (s), heart rate (bpm) from an Apple Watch, about 1 per 5 s
  labels.mat  expert_label: one sleep stage per 30 s epoch from recStart
              (0 Wake, 1 N1, 2 N2, 3 N3, 4 REM, 5 Unknown); recStart is US Eastern time

Usage (from the repo root): python ml/build_nights.py [raw folder] [output csv]
       defaults: data/raw/bidsleep -> data/interim/bidsleep_nights.csv
"""

import os
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
import scipy.io as sio

EPOCH_S = 30
SLEEP_STAGES = {1, 2, 3, 4}


def night_features(night_dir: Path):
    m = sio.loadmat(night_dir / "labels.mat")
    stages = np.ravel(m["expert_label"]).astype(int)
    rec_start = str(np.ravel(m["recStart"])[0])
    t0 = datetime.strptime(rec_start, "%Y-%m-%d %H:%M:%S").replace(
        tzinfo=ZoneInfo("America/New_York")).timestamp()

    hr = pd.read_csv(night_dir / "hr.csv", header=None, names=["t", "hr"])
    malformed = int(hr.isna().any(axis=1).sum())
    hr = hr.dropna()
    duplicates = int(hr.duplicated(subset="t").sum())
    hr = hr.drop_duplicates(subset="t")

    # Which 30 s epoch each HR reading falls in; readings outside the labelled
    # recording are dropped.
    epoch = np.floor((hr["t"].to_numpy() - t0) / EPOCH_S).astype(int)
    inside = (epoch >= 0) & (epoch < len(stages))
    dropped = int((~inside).sum())
    hr, epoch = hr[inside], epoch[inside]
    asleep = np.isin(stages[epoch], list(SLEEP_STAGES))
    sleep_hr = hr["hr"].to_numpy()[asleep]

    n = len(stages)
    counts = np.bincount(stages, minlength=6)
    sleep_epochs = counts[1:5].sum()
    total_sleep_h = sleep_epochs * EPOCH_S / 3600
    return {
        "subject_id": night_dir.parent.name,
        "night_folder": night_dir.name,
        "rec_start_et": rec_start,
        "recorded_h": round(n * EPOCH_S / 3600, 2),
        "total_sleep_h": round(total_sleep_h, 2),
        "wake_pct": round(counts[0] / n * 100, 1),
        "n3_pct_of_sleep": round(counts[3] / max(sleep_epochs, 1) * 100, 1),
        "rem_pct_of_sleep": round(counts[4] / max(sleep_epochs, 1) * 100, 1),
        "unknown_pct": round(counts[5] / n * 100, 1),
        "sleep_hr_mean": round(float(sleep_hr.mean()), 2) if len(sleep_hr) else np.nan,
        "sleep_hr_median": float(np.median(sleep_hr)) if len(sleep_hr) else np.nan,
        "sleep_hr_p5": float(np.percentile(sleep_hr, 5)) if len(sleep_hr) else np.nan,
        "sleep_hr_std": round(float(sleep_hr.std(ddof=1)), 2) if len(sleep_hr) > 1 else np.nan,
        "hr_readings_asleep": int(len(sleep_hr)),
        "hr_per_sleep_hour": round(len(sleep_hr) / total_sleep_h, 1) if total_sleep_h else np.nan,
        "hr_dropped_outside_labels": dropped,
        "hr_duplicate_timestamps": duplicates,
        "hr_malformed_rows": malformed,
    }


def main(raw: str, out: str):
    nights = sorted(p.parent for p in Path(raw).glob("*/*/labels.mat"))
    df = pd.DataFrame(night_features(p) for p in nights)
    df = df.sort_values(["subject_id", "rec_start_et"]).reset_index(drop=True)
    df["night_index"] = df.groupby("subject_id").cumcount() + 1
    df["source"] = "PhysioNet bidsleep v1.0.1 (general human data, Earth)"
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    df.to_csv(out, index=False)
    print(f"{len(df)} nights from {df['subject_id'].nunique()} people -> {out}")


if __name__ == "__main__":
    # Defaults match ml/fetch_bidsleep.py; run from the repo root.
    raw = sys.argv[1] if len(sys.argv) > 1 else "data/raw/bidsleep"
    out = sys.argv[2] if len(sys.argv) > 2 else "data/interim/bidsleep_nights.csv"
    main(raw, out)
