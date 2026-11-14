"""Inspiration4 lab panel: change at each timepoint from each person's own preflight
average, scaled by the preflight spread pooled across the 4 crew (3 draws each is
too few for a personal spread). Descriptive only: 4 people, no clinical claims."""
import numpy as np
import pandas as pd

ORDER = ["L-92", "L-44", "L-3", "R+1", "R+45", "R+82", "R+194"]


def load_labs(path):
    d = pd.read_csv(path)
    d = d[~d["analyte"].str.startswith("eGFR")]  # race-based eGFR columns dropped
    return d.dropna(subset=["value"])


def personal_change(d):
    pre = d[d["phase"] == "preflight"]
    base = pre.groupby(["subject_id", "analyte"])["value"].agg(base_mean="mean", base_n="count").reset_index()
    pre = pre.merge(base, on=["subject_id", "analyte"])
    pre["resid"] = pre["value"] - pre["base_mean"]
    # pooled within-person preflight SD per analyte (degrees of freedom: n-1 per person)
    pooled = (pre.groupby("analyte")
                 .apply(lambda g: np.sqrt((g["resid"] ** 2).sum() /
                                          max((g.groupby("subject_id").size() - 1).sum(), 1)),
                        include_groups=False)
                 .rename("pooled_sd").reset_index())
    out = d.merge(base, on=["subject_id", "analyte"]).merge(pooled, on="analyte")
    out["change"] = out["value"] - out["base_mean"]
    out["z"] = out["change"] / out["pooled_sd"].replace(0, np.nan)
    out["outside_ref_range"] = (out["value"] < out["range_min"]) | (out["value"] > out["range_max"])
    out["timepoint"] = pd.Categorical(out["timepoint"], ORDER, ordered=True)
    return out
