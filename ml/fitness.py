"""Muscle and fitness baseline (Bones and muscles on the body map).

1. Fits age- and sex-specific percentile curves for three fitness tests from the Korean
   "Body performance" dataset (13,393 adults aged 21-64, general human data, not astronauts):
   for each age, weighted percentiles of people of the same sex around that age (Gaussian kernel).
   The smoothing width is picked by 5-fold cross-validation and checked on a 20% hold-out:
   a good curve has ~5% of unseen people below its 5th-percentile line, ~50% below the median.
2. Writes a synthetic fitness record for each crew member: preflight grip, broad jump and
   sit-ups, plus weekly in-flight grip strength (the one test that works in microgravity).

The app compares each person's latest grip with their OWN preflight value; the watch and alert
lines live in next-app/src/content/limits.js (grip_drop), not here.

Data: data/raw/bodyPerformance.csv (Kaggle "Body performance data").
Run from the repo root:  python ml/fitness.py
Writes: next-app/src/data/fitness.json
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import KFold, train_test_split

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "bodyPerformance.csv"
OUT = ROOT / "next-app" / "src" / "data" / "fitness.json"

QUANTILES = [0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95]
AGE_MIN, AGE_MAX = 21, 64
SEED = 42

# id -> (column in the CSV, display name, unit, can it be done in microgravity?)
TESTS = {
    "grip_force": ("gripForce", "Grip strength", "kg", True),
    "broad_jump": ("broad jump_cm", "Standing broad jump", "cm", False),
    "sit_ups": ("sit-ups counts", "Sit-ups", "count", False),
}



# ---------------------------------------------------------------- load + clean
def load_clean(path: Path = RAW) -> tuple[pd.DataFrame, dict]:
    df = pd.read_csv(path)
    report = {"rows_raw": int(len(df))}

    df = df.drop_duplicates()
    report["duplicates_removed"] = report["rows_raw"] - int(len(df))

    df = df.rename(columns={col: tid for tid, (col, *_ ) in TESTS.items()})
    df["sex"] = df["gender"].map({"M": "male", "F": "female"})
    df = df.dropna(subset=["sex", "age"])

    # 0 kg grip and 0 cm jump are missing tests, not real results.
    # 0 sit-ups is kept: almost all are people aged 50+, so they are plausible.
    removed = {}
    for tid in ("grip_force", "broad_jump"):
        bad = df[tid] <= 0
        removed[tid] = int(bad.sum())
        df.loc[bad, tid] = np.nan
    report["zero_values_set_missing"] = removed
    report["rows_clean"] = int(len(df))
    report["by_sex"] = df["sex"].value_counts().to_dict()
    return df, report


# ------------------------------------------------------------------- modelling
# Smoothed age-sex percentile curves. For each age a..b, take everyone of the
# same sex, weight them by how close their age is (Gaussian kernel, width =
# bandwidth in years), and compute weighted percentiles. The bandwidth is
# chosen by cross-validation in evaluate(). Fast, and every number can be
# explained: "the 25th percentile of grip for women around 35 is X kg".
BANDWIDTHS = [1.5, 3.0, 5.0, 8.0]
DEFAULT_BANDWIDTH = 3.0


def _weighted_quantiles(values, weights, qs):
    order = np.argsort(values)
    v, w = values[order], weights[order]
    cw = np.cumsum(w) - 0.5 * w
    cw /= w.sum()
    return np.interp(qs, cw, v)


def fit_curves(df: pd.DataFrame, bandwidth=DEFAULT_BANDWIDTH) -> dict:
    """bandwidth: one number for all tests, or {test_id: years}."""
    bw_map = bandwidth if isinstance(bandwidth, dict) else {t: bandwidth for t in TESTS}
    ages = np.arange(AGE_MIN, AGE_MAX + 1, dtype=float)
    models = {"bandwidth": bw_map, "ages": ages}
    for tid in TESTS:
        bandwidth = bw_map[tid]
        for sex in ("male", "female"):
            d = df[(df.sex == sex) & df[tid].notna()]
            a, y = d["age"].to_numpy(float), d[tid].to_numpy(float)
            table = np.vstack([
                _weighted_quantiles(y, np.exp(-0.5 * ((a - age) / bandwidth) ** 2), QUANTILES)
                for age in ages
            ])
            models[(tid, sex)] = table
    return models


def predict_quantiles(models: dict, tid: str, sex: str, ages) -> np.ndarray:
    ages = np.clip(np.asarray(ages, float), AGE_MIN, AGE_MAX)
    table, grid = models[(tid, sex)], models["ages"]
    return np.column_stack([np.interp(ages, grid, table[:, i]) for i in range(len(QUANTILES))])


def percentile_of(value: float, qvals) -> float:
    """Approximate percentile (0-100) of a value given the 7 quantile values."""
    qs = np.array(QUANTILES) * 100
    if value <= qvals[0]:
        return float(max(1.0, qs[0] * value / qvals[0])) if qvals[0] > 0 else 1.0
    if value >= qvals[-1]:
        return 99.0
    return float(np.interp(value, qvals, qs))


# ------------------------------------------------------------------ evaluation
def _pinball(y, pred, q):
    diff = y - pred
    return float(np.mean(np.maximum(q * diff, (q - 1) * diff)))


def _coverage_error(train, test, tid, bandwidth):
    m = fit_curves(train, bandwidth)
    errs = []
    for sex in ("male", "female"):
        t = test[test.sex == sex]
        p = predict_quantiles(m, tid, sex, t.age)
        for q_i, q in enumerate(QUANTILES):
            errs.append(abs((t[tid].to_numpy() < p[:, q_i]).mean() - q))
    return float(np.mean(errs))


def evaluate(df: pd.DataFrame) -> dict:
    """Hold-out test + 5-fold CV.

    1. Split 80/20. On the 80%, pick the smoothing bandwidth by 5-fold CV
       (lowest coverage error).
    2. Refit on the 80% with that bandwidth and test on the unseen 20%.
       Coverage: share of unseen people below each percentile line.
       Good = ~5% below the 5th line, ~50% below the median, etc.
    3. Pinball (quantile) loss vs a baseline that ignores age (sex only),
       to show the age curve actually helps.
    """
    result = {}
    for tid in TESTS:
        d = df[df[tid].notna()]
        train, test = train_test_split(d, test_size=0.2, random_state=SEED, stratify=d["sex"])

        cv = {}
        for bw in BANDWIDTHS:
            folds = KFold(5, shuffle=True, random_state=SEED).split(train)
            cv[bw] = float(np.mean([_coverage_error(train.iloc[a], train.iloc[b], tid, bw) for a, b in folds]))
        best_bw = min(cv, key=cv.get)

        models = fit_curves(train, best_bw)
        cov, loss_model, loss_base = {}, [], []
        for q_i, q in enumerate(QUANTILES):
            below, n = 0, 0
            for sex in ("male", "female"):
                t, tr = test[test.sex == sex], train[train.sex == sex]
                y = t[tid].to_numpy()
                pred = predict_quantiles(models, tid, sex, t.age)[:, q_i]
                below += int((y < pred).sum()); n += len(t)
                loss_model.append(_pinball(y, pred, q))
                loss_base.append(_pinball(y, np.quantile(tr[tid], q), q))
            cov[f"p{int(q*100)}"] = round(below / n, 3)
        result[tid] = {
            "train_rows": int(len(train)),
            "test_rows": int(len(test)),
            "cv5_coverage_error_by_bandwidth": {str(k): round(v, 4) for k, v in cv.items()},
            "chosen_bandwidth_years": best_bw,
            "coverage_on_test": cov,
            "coverage_error_on_test": round(_coverage_error(train, test, tid, best_bw), 4),
            "pinball_loss_model": round(float(np.mean(loss_model)), 3),
            "pinball_loss_sex_only_baseline": round(float(np.mean(loss_base)), 3),
            "improvement_pct": round(100 * (1 - np.mean(loss_model) / np.mean(loss_base)), 1),
        }
    return result



# ------------------------------------------------------------------ synthetic crew
# Fictional crew (ids, names and roles match ml/generate_data.py). Age and sex are needed for the
# percentile; weekly_change_pct is how fast grip falls in flight despite exercise.
CREW = [
    {"crewId": "crew-01", "sex": "female", "age": 38, "pre": {"grip_force": 31.5, "broad_jump": 172.0, "sit_ups": 40}, "weekly_change_pct": -0.25},
    {"crewId": "crew-02", "sex": "male", "age": 47, "pre": {"grip_force": 46.0, "broad_jump": 205.0, "sit_ups": 42}, "weekly_change_pct": -0.65},
    {"crewId": "crew-03", "sex": "female", "age": 41, "pre": {"grip_force": 29.0, "broad_jump": 165.0, "sit_ups": 37}, "weekly_change_pct": -0.15},
    {"crewId": "crew-04", "sex": "male", "age": 34, "pre": {"grip_force": 52.0, "broad_jump": 238.0, "sit_ups": 52}, "weekly_change_pct": -1.15},
]
WEEKS = 20  # mission day 140 is the end of week 20; crew.json covers mission days 83-142
SEED = 2026


def crew_records():
    rng = np.random.default_rng(SEED)
    out = []
    for c in CREW:
        base = c["pre"]["grip_force"]
        weekly = []
        for w in range(1, WEEKS + 1):
            change = c["weekly_change_pct"] * w + rng.normal(0, 1.2)  # % from preflight, with test-to-test noise
            weekly.append({"week": w, "missionDay": w * 7, "grip_force": round(base * (1 + change / 100), 1)})
        out.append({"crewId": c["crewId"], "sex": c["sex"], "age": c["age"], "preflight": c["pre"], "inflight_grip": weekly})
    return out


def export(models: dict, ev: dict, clean: dict) -> dict:
    ages = list(range(AGE_MIN, AGE_MAX + 1))
    tests = {}
    for tid, (_, name, unit, in_flight) in TESTS.items():
        tests[tid] = {
            "name": name,
            "unit": unit,
            "possible_in_microgravity": in_flight,
            "by_sex": {
                sex: [[round(float(v), 1) for v in row] for row in predict_quantiles(models, tid, sex, ages)]
                for sex in ("male", "female")
            },
        }
    return {
        "source": "general human data (Body performance dataset, Korea Sports Promotion Foundation via Kaggle)",
        "label": "General adult fitness norms, not astronaut fitness standards",
        "crew_source": "Synthetic (fictional crew)",
        "ages": [AGE_MIN, AGE_MAX],
        "quantiles": [int(q * 100) for q in QUANTILES],
        "tests": tests,
        "evaluation": {
            "cleaning": clean,
            "by_test": {
                t: {k: r[k] for k in ("chosen_bandwidth_years", "coverage_on_test", "coverage_error_on_test", "improvement_pct")}
                for t, r in ev.items()
            },
        },
        "crew": crew_records(),
    }


def main():
    df, clean = load_clean()
    ev = evaluate(df)
    for tid, r in ev.items():
        print(f"{tid}: coverage {r['coverage_on_test']} | better than sex-only by {r['improvement_pct']}% | "
              f"bandwidth {r['chosen_bandwidth_years']} y")
    models = fit_curves(df, {t: r["chosen_bandwidth_years"] for t, r in ev.items()})
    out = export(models, ev, clean)
    OUT.write_text(json.dumps(out, indent=1) + "\n")
    print("wrote", OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
