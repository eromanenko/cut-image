# Machine Learning Training History

This document tracks the history of YOLOv8-OBB model training for card detection.

## Training Metrics

| Model Version | Run Directory | Images | Epochs | Precision | Recall | mAP50 | mAP50-95 |
| ------------- | ------------- | ------ | ------ | --------- | ------ | ----- | -------- |
| v0.1          | `train`       | 512    | 50     | 0.993     | 0.997  | 0.992 | 0.982    |
| v0.2          | `train-3`     | 512    | 30     | 0.993     | 0.997  | 0.991 | 0.982    |
| v0.3          | `train-4`     | 1216   | 30     | 0.986     | 0.995  | 0.992 | 0.981    |

*Note: The `train-2` run is excluded from this history as it was an interrupted attempt due to a system restart.*

## Metrics Description

- **Precision:** Measures the accuracy of the model's positive predictions. High precision means that when the model detects a card, it is very likely to actually be a card (minimal false positives).
- **Recall:** Measures the model's ability to find all actual cards in the image. High recall means the model misses almost no cards (minimal false negatives).
- **mAP50 (Mean Average Precision at IoU 0.50):** The average precision calculated when a predicted bounding box is considered correct if it overlaps the ground truth box by at least 50%. This is a standard indicator of general detection capability.
- **mAP50-95 (Mean Average Precision at IoU 0.50 to 0.95):** The average precision calculated at multiple strictness levels (from 50% overlap up to 95% overlap). **This is the most critical metric for OBB (Oriented Bounding Boxes).** A high mAP50-95 score indicates that the model not only finds the card but also draws the box extremely accurately, tightly hugging its exact edges and orientation angles.
