"""Generate synthetic daily health data for a fictional 4-person crew.

No public dataset has daily vitals for astronauts, so this script builds one from
published figures (see ml/README.md for sources) and plants known events in it.
Because we know where the events are, we can measure how well each detection
method finds them.

Usage:
    python ml/generate_data.py --out next-app/src/data
"""

import argparse
import json
from datetime import date, timedelta
from pathlib import Path

import numpy as np

SEED = 2026
DAYS = 60
FIRST_MISSION_DAY = 83  # day 1 of the data is mission day 83
START_DATE = date(2026, 9, 1)
PREFLIGHT_DAYS = 30  # L-30 to L-1, on Earth before launch
LAUNCH_DATE = START_DATE - timedelta(days=FIRST_MISSION_DAY - 1)

# Fictional crew. "profile" values are each person's own resting levels.
CREW = [
    {"id": "crew-01", "name": "Maya Okafor", "role": "Flight engineer"},
    {"id": "crew-02", "name": "Tomas Reyes", "role": "Commander"},
    {"id": "crew-03", "name": "Lena Kowalski", "role": "Crew medical officer"},
    {"id": "crew-04", "name": "Kwame Asante", "role": "Mission specialist"},
]

# Day-to-day noise (standard deviation) for each indicator.
NOISE = {
    "systolic": 4.0,
    "diastolic": 3.0,
    "heartRate": 3.0,
    "glucose": 5.0,
    "temperature": 0.15,
    "sleepHours": 0.4,
    "mood": 0.35,
    "reactionMs": 12.0,
}

# Planted events: (crew id, first day, last day, type, changes per indicator).
# Days are 1-based positions in the 60-day series.
EVENTS = [
    {
        "crewId": "crew-01",
        "startDay": 22,
        "endDay": 24,
        "type": "fever",
        "description": "Viral infection: fever, raised heart rate, poor sleep",
        "changes": {"temperature": 1.4, "heartRate": 14, "sleepHours": -1.0, "mood": -1.0},
    },
    {
        "crewId": "crew-02",
        "startDay": 35,
        "endDay": 41,
        "type": "stress_week",
        "description": "High-workload week: low mood, short sleep, slower reactions",
        "changes": {"mood": -1.5, "sleepHours": -1.3, "reactionMs": 45, "lapses": 4,
                    "heartRate": 6, "systolic": 6},
    },
    {
        "crewId": "crew-03",
        "startDay": 48,
        "endDay": 50,
        "type": "mild_fatigue",
        "description": "Subtle fatigue: each signal small on its own, unusual together",
        "changes": {"sleepHours": -0.7, "reactionMs": 20, "mood": -0.7, "lapses": 1},
    },
    # crew-04 has no events: a control for counting false alarms.
]


def make_profile(rng):
    return {
        "systolic": rng.uniform(110, 122),
        "diastolic": rng.uniform(70, 79),
        "heartRate": rng.uniform(58, 70),
        "glucose": rng.uniform(84, 94),
        "temperature": rng.uniform(36.6, 36.9),
        "sleepHours": rng.uniform(6.8, 7.3),
        "mood": rng.uniform(3.8, 4.3),
        "reactionMs": rng.uniform(250, 290),
        "lapses": rng.uniform(0.5, 1.5),
    }


def preflight_days(profile, rng):
    """30 days on Earth before launch: the person's own levels plus daily noise,
    with no space drift and no planted events. This is the preflight baseline."""
    days = []
    for n in range(PREFLIGHT_DAYS, 0, -1):
        v = {k: profile[k] + rng.normal(0, s) for k, s in NOISE.items()}
        days.append({
            "day": -n,
            "timepoint": f"L-{n}",
            "phase": "preflight",
            "date": (LAUNCH_DATE - timedelta(days=n)).isoformat(),
            "systolic": round(v["systolic"]),
            "diastolic": round(v["diastolic"]),
            "heartRate": round(v["heartRate"]),
            "glucose": round(v["glucose"]),
            "temperature": round(v["temperature"], 1),
            "sleepHours": round(float(np.clip(v["sleepHours"], 2, 10)), 1),
            "mood": int(np.clip(round(v["mood"]), 1, 5)),
            "reactionMs": round(v["reactionMs"]),
            "lapses": int(rng.poisson(profile["lapses"])),
        })
    return days


def generate(seed=SEED):
    rng = np.random.default_rng(seed)
    # A separate random stream for preflight days, so adding them leaves the
    # in-flight days exactly as they were.
    pre_rng = np.random.default_rng(seed + 1000)
    crew_out = []
    for member in CREW:
        profile = make_profile(rng)
        member_events = [e for e in EVENTS if e["crewId"] == member["id"]]
        days = []
        for i in range(DAYS):
            d = i + 1
            # Slow sleep drift: about 0.6 h lost over the 60 days, toward the
            # ~6 h average reported for ISS crews.
            sleep_drift = -0.6 * i / (DAYS - 1)
            v = {k: profile[k] + rng.normal(0, s) for k, s in NOISE.items()}
            v["sleepHours"] += sleep_drift
            lam = profile["lapses"]
            for e in member_events:
                if e["startDay"] <= d <= e["endDay"]:
                    for key, delta in e["changes"].items():
                        if key == "lapses":
                            lam += delta
                        else:
                            v[key] += delta
            lapses = int(rng.poisson(lam))
            days.append({
                "day": d,
                "missionDay": FIRST_MISSION_DAY + i,
                "date": (START_DATE + timedelta(days=i)).isoformat(),
                "systolic": round(v["systolic"]),
                "diastolic": round(v["diastolic"]),
                "heartRate": round(v["heartRate"]),
                "glucose": round(v["glucose"]),
                "temperature": round(v["temperature"], 1),
                "sleepHours": round(float(np.clip(v["sleepHours"], 2, 10)), 1),
                "mood": int(np.clip(round(v["mood"]), 1, 5)),
                "reactionMs": round(v["reactionMs"]),
                "lapses": lapses,
            })
        crew_out.append({**member, "launchDate": LAUNCH_DATE.isoformat(),
                         "preflight": preflight_days(profile, pre_rng), "days": days})
    return crew_out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="next-app/src/data", help="folder for crew.json")
    parser.add_argument("--events-out", default="ml", help="folder for planted_events.json")
    parser.add_argument("--seed", type=int, default=SEED, help="change to get a fresh test dataset")
    args = parser.parse_args()

    crew = generate(args.seed)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    payload = {
        "note": "Synthetic data for a fictional crew. Not real astronaut records.",
        "seed": args.seed,
        "crew": crew,
    }
    (out / "crew.json").write_text(json.dumps(payload, indent=1))

    ev_out = Path(args.events_out)
    ev_out.mkdir(parents=True, exist_ok=True)
    events = [{k: v for k, v in e.items()} for e in EVENTS]
    (ev_out / "planted_events.json").write_text(json.dumps(events, indent=2))
    print(f"Wrote {out / 'crew.json'} ({len(crew)} crew x {PREFLIGHT_DAYS} preflight + {DAYS} in-flight days)")
    print(f"Wrote {ev_out / 'planted_events.json'} ({len(events)} events)")


if __name__ == "__main__":
    main()
