"""
OSDR ingestion + first-look EDA for the Inspiration4 blood panels.

Endpoints below were tested by hand on 12 Nov 2026 (HTTP 200, no API key):
  - files list : https://osdr.nasa.gov/osdr/data/osd/files/<id>      (bare form only;
                 adding ?page=&size= returned an empty "studies" object)
  - download   : https://osdr.nasa.gov + remote_url from the files list
Run:  pip install requests pandas matplotlib
      python ml/osdr_ingest.py           (from the repo root)
Output goes to ./data/raw (untouched downloads) and ./data/interim (cleaned tables).
"""

from pathlib import Path
import requests
import pandas as pd
import matplotlib.pyplot as plt

BASE = "https://osdr.nasa.gov"
RAW = Path("data/raw")
INTERIM = Path("data/interim")
RAW.mkdir(parents=True, exist_ok=True)
INTERIM.mkdir(parents=True, exist_ok=True)

# The long-format "SUBMITTED" files keep a UNITS column per row, so we use them
# instead of the wide "TRANSFORMED" files (whose column names mislabel hemoglobin).
WANTED = {
    569: ["LSDS-7_Complete_Blood_Count_CBC.upload_SUBMITTED.csv"],
    575: ["LSDS-8_Comprehensive_Metabolic_Panel_CMP.upload_SUBMITTED.csv"],
}

# Time-point labels: L = days before launch, R = days after return.
# Converting them to a signed day number lets us sort and plot them.
def timepoint_to_day(tp: str) -> int:
    tp = tp.strip()
    sign = -1 if tp.startswith("L") else 1
    return sign * int(tp.split("-" if sign < 0 else "+")[1])


def list_files(study_id: int) -> list[dict]:
    """Return the file records for one OSD study (one API call)."""
    r = requests.get(f"{BASE}/osdr/data/osd/files/{study_id}", timeout=30)
    r.raise_for_status()
    studies = r.json()["studies"]
    if not studies:
        raise RuntimeError(f"OSD-{study_id}: empty file list, check the URL form")
    return studies[f"OSD-{study_id}"]["study_files"]


def download(study_id: int, file_name: str) -> Path:
    """Download one file (skips it if already on disk, so reruns are cheap)."""
    out = RAW / f"OSD-{study_id}" / file_name
    if out.exists():
        return out
    record = next(f for f in list_files(study_id) if f["file_name"] == file_name)
    if record["restricted"]:
        raise PermissionError(f"{file_name} is restricted")
    r = requests.get(BASE + record["remote_url"], timeout=60)
    r.raise_for_status()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(r.content)
    return out


def load_panel(path: Path) -> pd.DataFrame:
    """Read a long-format lab panel and give it consistent column names."""
    # 'NA' and 'N/A' strings appear in these files: treat them as missing.
    df = pd.read_csv(path, na_values=["NA", "N/A", ""])
    df.columns = [c.strip().lower() for c in df.columns]
    # CBC calls the time column TEST_DATE, CMP calls it timepoint.
    df = df.rename(columns={"test_date": "timepoint"})
    df["day"] = df["timepoint"].map(timepoint_to_day)
    df["phase"] = df["day"].map(lambda d: "preflight" if d < 0 else "postflight")
    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    df["source_file"] = path.name          # provenance, kept on every row
    return df


def personal_baseline(df: pd.DataFrame) -> pd.DataFrame:
    """Mean and SD of each person's preflight draws (L-92, L-44, L-3) per analyte.
    With only 3 points the SD is very rough: treat it as a demo, not a clinical limit."""
    pre = df[df["phase"] == "preflight"]
    return (pre.groupby(["subject_id", "analyte", "units"])["value"]
               .agg(baseline_mean="mean", baseline_sd="std", n="count")
               .reset_index())


if __name__ == "__main__":
    frames = []
    for sid, names in WANTED.items():
        for name in names:
            frames.append(load_panel(download(sid, name)))
    labs = pd.concat(frames, ignore_index=True)
    labs.to_csv(INTERIM / "i4_labs_long.csv", index=False)

    # --- Quick checks you should read before doing anything else -------------
    print(labs.shape)                                   # expect about 1,084 rows
    print(labs.groupby("subject_id")["timepoint"].nunique())  # expect 7 each
    print(labs["value"].isna().sum(), "missing values")
    print(labs[["analyte", "units"]].drop_duplicates().to_string(index=False))

    # --- Baseline deviation: the idea the whole prototype rests on -----------
    base = personal_baseline(labs)
    merged = labs.merge(base, on=["subject_id", "analyte", "units"])
    merged["delta_from_baseline"] = merged["value"] - merged["baseline_mean"]
    merged.to_csv(INTERIM / "i4_labs_with_baseline.csv", index=False)

    # --- One plot: each person's white cell count over time ------------------
    wbc = labs[labs["analyte"] == "WHITE BLOOD CELL COUNT"].sort_values("day")
    for sid, g in wbc.groupby("subject_id"):
        plt.plot(g["day"], g["value"], marker="o", label=sid)
    plt.axvline(0, color="grey", linestyle="--", linewidth=1)  # flight (3 days)
    plt.xlabel("Days relative to flight (negative = before launch)")
    plt.ylabel("WBC (Thousand/uL)")
    plt.title("Inspiration4 WBC by crew member (OSD-569, n=4)")
    plt.legend()
    plt.tight_layout()
    plt.savefig(INTERIM / "wbc_by_subject.png", dpi=150)
    print("Saved", INTERIM / "wbc_by_subject.png")
