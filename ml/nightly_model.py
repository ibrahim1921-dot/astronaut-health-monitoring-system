"""Personal nightly resting-heart-rate anomaly detection on real PhysioNet nights.

Method (z-score):
  - centre  = median of the same person's OTHER clean nights (leave-one-night-out)
  - spread  = typical night-to-night variation, pooled across OTHER people
  - score   = (tonight - centre) / spread, in the direction that matters
Compared with Isolation Forest on the same personal deviations, split by person.

Evaluation: anomalies are planted on copies of real nights. A planted night is never in
its own baseline, and the people used to set thresholds are never the people scored.
"""

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.model_selection import GroupKFold

# Feature -> which direction is bad
FEATURES = {
    "sleep_hr_median": "high",
    "sleep_hr_p5": "high",       # the resting floor
    "total_sleep_h": "low",
    "wake_pct": "high",
    "n3_pct_of_sleep": "low",
    "rem_pct_of_sleep": "low",
}
LABELS = {
    "sleep_hr_median": ("Sleeping heart rate", "bpm", 0),
    "sleep_hr_p5": ("Lowest sleeping heart rate (5th pct)", "bpm", 0),
    "total_sleep_h": ("Total sleep", "h", 1),
    "wake_pct": ("Time awake", "%", 0),
    "n3_pct_of_sleep": ("Deep sleep (N3)", "% of sleep", 0),
    "rem_pct_of_sleep": ("REM sleep", "% of sleep", 0),
}
HR_FEATURES = ["sleep_hr_median", "sleep_hr_p5"]
SLEEP_FEATURES = ["total_sleep_h", "wake_pct", "n3_pct_of_sleep", "rem_pct_of_sleep"]
TARGET_FALSE_ALARM = 0.05
SHIFTS_BPM = [3, 5, 8, 12]


def add_quality_flags(df):
    """Data-quality problems only. A genuinely bad night (lots of wake) is NOT a flag."""
    df = df.copy()
    reasons = pd.Series("", index=df.index)
    reasons[df["hr_per_sleep_hour"] < 500] += "low HR coverage; "
    reasons[df["hr_per_sleep_hour"] > 1000] += "about double the normal HR rate; "
    reasons[df["unknown_pct"] > 15] += "over 15% unknown sleep stage; "
    df["quality_issue"] = reasons.str.rstrip("; ")
    df["clean"] = df["quality_issue"] == ""
    return df


def loo_deviations(df):
    """Each night minus the median of the same person's other clean nights."""
    out = []
    for _, g in df.groupby("subject_id"):
        clean = g[g["clean"]]
        for idx, row in g.iterrows():
            others = clean.drop(index=idx, errors="ignore")
            dev = {f: row[f] - others[f].median() if len(others) >= 2 else np.nan for f in FEATURES}
            out.append({"idx": idx, "n_baseline": len(others), **{f"dev_{f}": v for f, v in dev.items()}})
    return pd.DataFrame(out).set_index("idx")


def pooled_spread(dev, people):
    """Robust spread (1.4826 x MAD) of leave-one-out deviations among the given people."""
    sub = dev[dev["subject_id"].isin(people) & dev["clean"]]
    return {f: 1.4826 * np.nanmedian(np.abs(sub[f"dev_{f}"] - np.nanmedian(sub[f"dev_{f}"])))
            for f in FEATURES}


def z_scores(dev, spread):
    z = pd.DataFrame(index=dev.index)
    for f, direction in FEATURES.items():
        raw = dev[f"dev_{f}"] / spread[f]
        z[f] = raw if direction == "high" else -raw  # positive = worse
    return z


def plant(df, rng):
    """Copies of clean nights with planted changes. Baselines still use the originals."""
    base = df[df["clean"]]
    rows = []
    for idx, r in base.iterrows():
        for s in SHIFTS_BPM:
            p = r.copy()
            p["sleep_hr_median"] += s
            p["sleep_hr_p5"] += s
            rows.append({**p, "orig_idx": idx, "plant": f"HR +{s} bpm"})
        p = r.copy()  # disrupted night: less sleep, more wake, less deep sleep
        lost = min(1.5, p["total_sleep_h"] - 2)
        p["total_sleep_h"] -= lost
        p["wake_pct"] += 15
        p["n3_pct_of_sleep"] = max(0, p["n3_pct_of_sleep"] - 8)
        rows.append({**p, "orig_idx": idx, "plant": "Disrupted sleep"})
    return pd.DataFrame(rows)


def deviations_for_planted(df, planted):
    """Deviation of each planted copy from the person's other clean ORIGINAL nights."""
    out = []
    for _, r in planted.iterrows():
        others = df[(df["subject_id"] == r["subject_id"]) & df["clean"]].drop(index=r["orig_idx"])
        out.append({f"dev_{f}": r[f] - others[f].median() if len(others) >= 2 else np.nan for f in FEATURES})
    return pd.DataFrame(out, index=planted.index)


def _fmt(f, v, diff=False):
    name, unit, digits = LABELS[f]
    if unit.startswith("%"):
        return f"{v:.0f} points" if diff else f"{v:.0f}%"
    return f"{v:.{digits}f} {unit}"


def explain(zrow, raw_row, dev_row, top=2):
    """Plain-English reasons for the worst features of one night."""
    parts = []
    for f in zrow.sort_values(ascending=False).index[:top]:
        if not zrow[f] >= 1.5:
            continue
        d = dev_row[f"dev_{f}"]
        parts.append(f"{LABELS[f][0]} {_fmt(f, raw_row[f])} is {_fmt(f, abs(d), diff=True)} "
                     f"{'above' if d > 0 else 'below'} your usual ({zrow[f]:.1f}x a typical night-to-night change)")
    return "; ".join(parts) if parts else "Within your usual range"


def evaluate(nights, seed=0, n_splits=5):
    """Leave-people-out evaluation of the z-score and Isolation Forest detectors."""
    rng = np.random.default_rng(seed)
    df = add_quality_flags(nights)
    dev = loo_deviations(df).join(df[["subject_id", "clean"]])
    ok = dev[[f"dev_{f}" for f in FEATURES]].notna().all(axis=1)
    planted = plant(df, rng)
    pdev = deviations_for_planted(df, planted)
    pdev["subject_id"] = planted["subject_id"].to_numpy()
    pdev["plant"] = planted["plant"].to_numpy()
    pdev = pdev[pdev[[f"dev_{f}" for f in FEATURES]].notna().all(axis=1)]

    people = np.array(sorted(df["subject_id"].unique()))
    results = []
    for train_idx, test_idx in GroupKFold(n_splits=n_splits).split(people, groups=people):
        train_p, test_p = people[train_idx], people[test_idx]
        spread = pooled_spread(dev, train_p)  # never uses the people being scored

        z_tr = z_scores(dev[ok & dev["subject_id"].isin(train_p) & dev["clean"]], spread)
        z_te = z_scores(dev[ok & dev["subject_id"].isin(test_p) & dev["clean"]], spread)
        z_pl = z_scores(pdev[pdev["subject_id"].isin(test_p)], spread)
        plant_lbl = pdev.loc[z_pl.index, "plant"]

        # Detector 1: z-score. HR plants are judged on HR features, sleep plants on sleep features.
        for name, feats in [("all", list(FEATURES)), ("hr", HR_FEATURES), ("sleep", SLEEP_FEATURES)]:
            thr = np.quantile(z_tr[feats].max(axis=1), 1 - TARGET_FALSE_ALARM)
            results.append({"method": "z-score", "group": name, "kind": "untouched",
                            "hits": int((z_te[feats].max(axis=1) > thr).sum()), "n": len(z_te)})
            for lbl in plant_lbl.unique():
                m = plant_lbl == lbl
                results.append({"method": "z-score", "group": name, "kind": lbl,
                                "hits": int((z_pl[m][feats].max(axis=1) > thr).sum()), "n": int(m.sum())})

        # Detector 1b: two separate checks (heart rate, sleep), each with half the false-alarm budget.
        half = TARGET_FALSE_ALARM / 2
        t_hr = np.quantile(z_tr[HR_FEATURES].max(axis=1), 1 - half)
        t_sl = np.quantile(z_tr[SLEEP_FEATURES].max(axis=1), 1 - half)
        flag = lambda z: (z[HR_FEATURES].max(axis=1) > t_hr) | (z[SLEEP_FEATURES].max(axis=1) > t_sl)
        results.append({"method": "z-score", "group": "two", "kind": "untouched", "hits": int(flag(z_te).sum()), "n": len(z_te)})
        for lbl in plant_lbl.unique():
            m = (plant_lbl == lbl).to_numpy()
            results.append({"method": "z-score", "group": "two", "kind": lbl, "hits": int(flag(z_pl[m]).sum()), "n": int(m.sum())})

        # Detector 2: Isolation Forest on all six personal z-features.
        model = IsolationForest(n_estimators=300, random_state=seed).fit(z_tr)
        thr = np.quantile(-model.score_samples(z_tr), 1 - TARGET_FALSE_ALARM)
        results.append({"method": "Isolation Forest", "group": "if", "kind": "untouched",
                        "hits": int((-model.score_samples(z_te) > thr).sum()), "n": len(z_te)})
        for lbl in plant_lbl.unique():
            m = (plant_lbl == lbl).to_numpy()
            results.append({"method": "Isolation Forest", "group": "if", "kind": lbl,
                            "hits": int((-model.score_samples(z_pl[m]) > thr).sum()), "n": int(m.sum())})
    return pd.DataFrame(results)


def summary_table(res):
    agg = res.groupby(["method", "group", "kind"])[["hits", "n"]].sum()
    agg["rate"] = agg["hits"] / agg["n"]
    rows = []
    for (method, group), g in agg.groupby(level=[0, 1]):
        g = g.droplevel([0, 1])
        label = {"all": "z-score, one combined score", "two": "z-score, separate HR and sleep checks (app)",
                 "hr": "z-score, heart rate only",
                 "sleep": "z-score, sleep only", "if": "Isolation Forest, all 6 features"}[group]
        row = {"Detector": label, "False alarms (untouched nights)": f"{g.loc['untouched', 'rate']:.0%}"}
        for k in [f"HR +{s} bpm" for s in SHIFTS_BPM] + ["Disrupted sleep"]:
            row[k] = f"{g.loc[k, 'rate']:.0%}"
        rows.append(row)
    order = ["z-score, separate HR and sleep checks (app)", "z-score, one combined score", "Isolation Forest, all 6 features",
             "z-score, heart rate only", "z-score, sleep only"]
    return pd.DataFrame(rows).set_index("Detector").loc[order].reset_index()


def score_all_nights(nights):
    """Final scores for every real night, as the app would show them.

    Two checks, heart rate and sleep, each with its own thresholds taken from clean
    nights: watch = top 2.5% (so about 5% of normal nights get a watch in total),
    alert = top 0.5%.
    """
    df = add_quality_flags(nights)
    dev = loo_deviations(df).join(df[["subject_id", "clean"]])
    spread = pooled_spread(dev, df["subject_id"].unique())
    z = z_scores(dev, spread)
    clean = dev["clean"]
    out = df.copy()
    thresholds = {}
    status = pd.Series("normal", index=df.index)
    rank = {"normal": 0, "watch": 1, "alert": 2}
    for name, feats in [("heart_rate", HR_FEATURES), ("sleep", SLEEP_FEATURES)]:
        score = z[feats].max(axis=1)
        watch, alert = np.nanquantile(score[clean], 0.975), np.nanquantile(score[clean], 0.995)
        thresholds[name] = {"watch": round(float(watch), 2), "alert": round(float(alert), 2)}
        out[f"{name}_score"] = score.round(2)
        s_ = np.where(score >= alert, "alert", np.where(score >= watch, "watch", "normal"))
        status = pd.Series([a if rank[a] >= rank[b] else b for a, b in zip(status, s_)], index=df.index)
    out["status"] = status.astype(str)
    out.loc[z.isna().any(axis=1), "status"] = "not enough history"
    out.loc[~out["clean"], "status"] = "data quality issue"
    out["reason"] = [explain(z.loc[i], df.loc[i], dev.loc[i]) if out.loc[i, "status"] in ("watch", "alert") else ""
                     for i in out.index]
    return out, spread, thresholds
