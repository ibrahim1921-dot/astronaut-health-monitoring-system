"""
Download only hr.csv + labels.mat from the PhysioNet dataset
"A Multi-Night Instantaneous Heart Rate and Accelerometry Dataset with EEG Sleep
Stage Labels" v1.0.1 (https://physionet.org/content/bidsleep-dataset/1.0.1/).

Why not the ZIP: the ZIP is 5.9 GB (27.9 GB unzipped) and almost all of that is
motion.csv (about 99 MB per night). hr.csv is about 112 KB and labels.mat about
0.5 KB per night, so this script fetches roughly 30 MB instead of 6 GB.

Licence: Open Data Commons Attribution v1.0 (cite the dataset when you use it).
Run:  pip install requests
      python ml/fetch_bidsleep.py         # all 47 subjects (from the repo root)
      python ml/fetch_bidsleep.py 5       # first 5 subjects, for a quick test
"""

import re
import sys
from pathlib import Path
import requests

BASE = "https://physionet.org/files/bidsleep-dataset/1.0.1/"
OUT = Path("data/raw/bidsleep")
WANTED = ["hr.csv", "labels.mat"]          # motion.csv deliberately skipped


def list_dirs(url: str) -> list[str]:
    """Return sub-folder names from a PhysioNet directory listing page."""
    html = requests.get(url, timeout=30).text
    return [h.rstrip("/") for h in re.findall(r'href="([^"./][^"]*/)"', html)]


def main(limit: int | None) -> None:
    subjects = list_dirs(BASE)[:limit]      # e.g. Bidslab00, Bidslab01, ...
    print(f"{len(subjects)} subjects")
    for subj in subjects:
        for night in list_dirs(f"{BASE}{subj}/"):   # "1", "2", ... "7"
            for name in WANTED:
                dest = OUT / subj / night / name
                if dest.exists():                    # rerun-safe
                    continue
                r = requests.get(f"{BASE}{subj}/{night}/{name}", timeout=60)
                r.raise_for_status()
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(r.content)
        print("done", subj)


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else None)
