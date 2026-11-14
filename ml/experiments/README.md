# Experiments we tried and did not ship

## Population risk classifier (`population_risk_classifier.ipynb`)

A Random Forest and an autoencoder trained on 5,000 rows built by sampling each column from a
different dataset (synthetic Kaggle vitals, Inspiration4 glucose, synthetic sleep, Korean grip
strength, a bone-density study, ISS station radiation), labelled by a hand-written rule.

It scored 100% accuracy, but we did not use it in the app, because:

- **The rows are not people.** Each column comes from a different person or dataset, so links
  between signals (poor sleep and a higher heart rate, say) are lost.
- **The accuracy is circular.** The labels come from a rule on the same columns, and the forest
  learns that rule back.
- **Its lines disagree with the cited limits the app uses.** Diastolic pressure is never checked
  (140/95 is "optimal"), fasting glucose 130 mg/dL is "optimal" (ADA alert from 126), and
  37.9 °C is "optimal" (low-grade fever from 37.5 °C). Its own lines have no source.
- **No personal baseline.** The challenge is about each astronaut's own normal; this model
  compares everyone with one population rule.
- **The autoencoder flags 5% of healthy rows by design** (95th-percentile threshold) and was not
  tested against known problems.

What we kept from it: the per-dataset cleaning steps, and the idea of covering muscle, bone and
radiation, which the app now does with `ml/fitness.py` and `ml/environment.py`.
