# Nightly heart-rate model: evaluation

Anomalies planted on copies of real PhysioNet nights; people split with GroupKFold (5 folds), so the
people used to set thresholds are never the people scored. False alarms fixed near 5% on untouched nights.

| Detector                                    | False alarms (untouched nights)   | HR +3 bpm   | HR +5 bpm   | HR +8 bpm   | HR +12 bpm   | Disrupted sleep   |
|:--------------------------------------------|:----------------------------------|:------------|:------------|:------------|:-------------|:------------------|
| z-score, separate HR and sleep checks (app) | 6%                                | 11%         | 19%         | 45%         | 83%          | 29%               |
| z-score, one combined score                 | 6%                                | 9%          | 14%         | 26%         | 61%          | 57%               |
| Isolation Forest, all 6 features            | 7%                                | 9%          | 14%         | 30%         | 66%          | 27%               |
| z-score, heart rate only                    | 5%                                | 15%         | 29%         | 60%         | 92%          | 5%                |
| z-score, sleep only                         | 7%                                | 7%          | 7%          | 7%          | 7%           | 61%               |

The app uses the first row: separate heart-rate and sleep checks. Isolation Forest was tested on the
same personal deviations and not used: it catches fewer heart-rate rises and cannot say why a night was flagged.
