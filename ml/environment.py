"""Station environment: radiation timeline and cabin air checks (NASA Rodent Research-1, ISS 2014).

Data: NASA OSDR Environmental Data App tables for RR-1, put in data/raw/:
    RR-1_EDA_Radiation_table.csv   daily dose (GCR, SAA, total, accumulated), mGy
    RR-1_EDA_Telemetry_table.csv   5-minute cabin temperature, humidity and CO2, ISS and ground copy

What this script does:
  1. Radiation: daily dose and running total, as recorded.
  2. Cabin air: hourly averages of CO2 (converted to mmHg), temperature and humidity.
  3. "Unusual for this cabin": each day's average is compared with the previous 7 days
     (median and robust spread, MAD x 1.4826). A day 3 or more spreads away is flagged.
     The limit lines (NASA-STD-3001) are NOT applied here: the app reads them from
     next-app/src/content/limits.js, the one place every limit lives.
  4. Evaluation: spikes of known size are planted on random days; we report how many are
     caught and how many unplanted days are flagged (false alarms).

Run from the repo root:  python ml/environment.py
Writes: next-app/src/data/environment.json
"""

import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "next-app" / "src" / "data" / "environment.json"

CABIN_MMHG = 760.0  # ISS cabin total pressure, about 14.7 psia = 760 mmHg
WINDOW = 7  # days of history for "usual for this cabin"
MIN_HISTORY = 5
UNUSUAL_Z = 3.0
SEED = 2026


def ppm_to_mmhg(ppm):
    return ppm * 1e-6 * CABIN_MMHG


def load_radiation():
    r = pd.read_csv(RAW / "RR-1_EDA_Radiation_table.csv")
    return [
        {
            "date": row.Date,
            "gcr": round(float(row.GCR_Dose_mGy_d), 3),
            "saa": round(float(row.SAA_Dose_mGy_d), 3),
            "total": round(float(row.Total_Dose_mGy_d), 3),
            "accumulated": round(float(row.Accumulated_Dose_mGy_d), 3),
        }
        for row in r.itertuples()
    ]


def load_cabin():
    t = pd.read_csv(RAW / "RR-1_EDA_Telemetry_table.csv")
    t["time"] = pd.to_datetime(t["Controller_Time_GMT"])
    t = t.sort_values("time").drop_duplicates("time").set_index("time")
    cabin = pd.DataFrame(
        {
            "co2_mmhg": ppm_to_mmhg(t["CO2_ppm_ISS"]),
            "temp_c": t["Temp_degC_ISS"],
            "rh_pct": t["RH_percent_ISS"],
        }
    )
    hourly = cabin.resample("1h").mean().dropna()
    return hourly



def unusual_flags(series, min_spread):
    """For each day: z against the previous WINDOW days; None until there is enough history."""
    out = []
    values = list(series)
    for i, v in enumerate(values):
        hist = values[max(0, i - WINDOW) : i]
        if len(hist) < MIN_HISTORY:
            out.append((None, None))
            continue
        med = float(np.median(hist))
        mad = float(np.median(np.abs(np.asarray(hist) - med))) * 1.4826
        z = (v - med) / max(mad, min_spread)
        out.append((round(z, 2), round(med, 2)))
    return out


# Smallest spread allowed per measure, so a very steady week doesn't make tiny changes look big.
MIN_SPREAD = {"co2_mean": 0.1, "temp_mean": 0.2, "rh_mean": 1.5}
LABEL = {"co2_mean": ("CO2", "mmHg", 2), "temp_mean": ("Temperature", "°C", 1), "rh_mean": ("Humidity", "%", 0)}
# Which way is a problem: lower CO2 is good news, temperature and humidity matter both ways.
BAD_SIDE = {"co2_mean": "high", "temp_mean": "both", "rh_mean": "both"}


def is_unusual(k, z):
    if z is None:
        return False
    return z >= UNUSUAL_Z if BAD_SIDE[k] == "high" else abs(z) >= UNUSUAL_Z


def daily_rows(hourly):
    g = hourly.resample("1D")
    daily = pd.DataFrame(
        {
            "co2_mean": g["co2_mmhg"].mean(),
            "co2_max_1h": g["co2_mmhg"].max(),
            "temp_mean": g["temp_c"].mean(),
            "temp_min": g["temp_c"].min(),
            "temp_max": g["temp_c"].max(),
            "rh_mean": g["rh_pct"].mean(),
            "rh_min": g["rh_pct"].min(),
            "rh_max": g["rh_pct"].max(),
            "hours": g["co2_mmhg"].count(),
        }
    )
    daily = daily[daily["hours"] >= 12]  # skip partial days at the edges
    daily["co2_7d_mean"] = daily["co2_mean"].rolling(7, min_periods=1).mean()
    return daily


def score_unusual(daily):
    flags = {k: unusual_flags(daily[k], MIN_SPREAD[k]) for k in MIN_SPREAD}
    rows = []
    for i, (day, d) in enumerate(daily.iterrows()):
        unusual = []
        for k, (name, unit, digits) in LABEL.items():
            z, med = flags[k][i]
            if is_unusual(k, z):
                side = "above" if z > 0 else "below"
                unusual.append(
                    f"{name} {d[k]:.{digits}f} {unit} is {abs(z):.1f} spreads {side} this cabin's usual "
                    f"of {med:.{digits}f} {unit} (previous {WINDOW} days)"
                )
        rows.append(
            {
                "date": day.strftime("%Y-%m-%d"),
                "co2_mean": round(float(d.co2_mean), 2),
                "co2_max_1h": round(float(d.co2_max_1h), 2),
                "co2_7d_mean": round(float(d.co2_7d_mean), 2),
                "temp_mean": round(float(d.temp_mean), 1),
                "temp_min": round(float(d.temp_min), 1),
                "temp_max": round(float(d.temp_max), 1),
                "rh_mean": round(float(d.rh_mean), 1),
                "rh_min": round(float(d.rh_min), 1),
                "rh_max": round(float(d.rh_max), 1),
                "unusual": unusual,
            }
        )
    return rows


def evaluate(daily, trials=200):
    """Plant one spike per trial on a random day (after the warm-up) and see if it is caught."""
    rng = np.random.default_rng(SEED)
    sizes = {"co2_mean": 0.6, "temp_mean": 1.5, "rh_mean": 10.0}  # mmHg, °C, % points
    caught = {k: 0 for k in sizes}
    false_alarm_days = 0
    checked_days = 0
    n = len(daily)
    for _ in range(trials):
        for k, size in sizes.items():
            i = int(rng.integers(MIN_HISTORY, n))
            s = daily[k].to_numpy(copy=True)
            sign = 1 if BAD_SIDE[k] == "high" or rng.random() < 0.5 else -1
            s[i] += size * sign
            z, _ = unusual_flags(s, MIN_SPREAD[k])[i]
            if is_unusual(k, z):
                caught[k] += 1
    # False alarms: unplanted days flagged on the real data
    for k in sizes:
        for z, _ in unusual_flags(daily[k], MIN_SPREAD[k]):
            if z is None:
                continue
            checked_days += 1
            false_alarm_days += is_unusual(k, z)
    return {
        "planted_spike_size": {"co2_mmhg": 0.6, "temp_c": 1.5, "rh_pct": 10.0},
        "trials_per_measure": trials,
        "caught_pct": {k.replace("_mean", ""): round(100 * v / trials, 1) for k, v in caught.items()},
        "flagged_pct_of_real_days": round(100 * false_alarm_days / max(checked_days, 1), 1),
        "note": "Flagged real days are not all false alarms: some are real changes in the cabin.",
    }


def main():
    radiation = load_radiation()
    hourly = load_cabin()
    daily = daily_rows(hourly)
    days = score_unusual(daily)
    ev = evaluate(daily)
    hourly_co2 = [
        {"time": t.strftime("%Y-%m-%dT%H:00Z"), "co2": round(float(v), 2)} for t, v in hourly["co2_mmhg"].items()
    ]
    out = {
        "source": "Environment (NASA OSDR Environmental Data App, Rodent Research-1, ISS 2014)",
        "note": "Station measurements, not any crew member's personal exposure.",
        "assumptions": f"CO2 converted from ppm with a cabin pressure of {CABIN_MMHG:.0f} mmHg (14.7 psia).",
        "method": (
            f"Each day's average compared with the previous {WINDOW} days (median and robust spread); "
            f"{UNUSUAL_Z:.0f} or more spreads away is 'unusual for this cabin'. Limit lines come from NASA-STD-3001."
        ),
        "evaluation": ev,
        "radiation": {"unit": "mGy", "days": radiation},
        "cabin": {"days": days, "hourly_co2_mmhg": hourly_co2},
    }
    OUT.write_text(json.dumps(out, indent=1) + "\n")
    print(f"radiation days {len(radiation)}, cabin days {len(days)}, hourly points {len(hourly_co2)}")
    print("hours over 3 mmHg:", int((hourly["co2_mmhg"] > 3).sum()), "| days with a 7-day mean >= 2.5:",
          sum(d["co2_7d_mean"] >= 2.5 for d in days))
    print("unusual days:", sum(bool(d["unusual"]) for d in days))
    print("evaluation:", json.dumps(ev))
    print("wrote", OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
