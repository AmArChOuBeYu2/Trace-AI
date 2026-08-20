# TRACE-PLIM Intelligence Framework

TRACE-AI adapts the standard PLIM-AI concept to map the life-cycle of media objects.

## 1. The Core Stages
Instead of measuring cognitive behavior directly, we measure technical elements:

```
ORIGIN
  ↓ (Evidence: Perceptual hashes, EXIF geolocation, oldest matching domain timestamp)
PROPAGATION
  ↓ (Evidence: Graph node density, cross-platform repost timeline)
NARRATIVE EVOLUTION
  ↓ (Evidence: Visual OCR text comparisons, semantic modifications)
AMPLIFICATION
  ↓ (Evidence: Social shares speed, repost count, bot metrics)
POTENTIAL INFLUENCE
  ↓ (Signal: Combined risk indicator showing viral exposure levels)
```

## 2. Evidence Fusion Formula
The overall Risk Score is computed dynamically based on the configured settings weights:

$$\text{Overall Risk} = w_{manip} \cdot S_{manip} + w_{meta} \cdot S_{meta} + w_{prop} \cdot S_{prop} + w_{narr} \cdot S_{narr}$$

Subject to:
$$w_{manip} + w_{meta} + w_{prop} + w_{narr} = 100\%$$

- $S_{manip}$: Visual manipulation ELA index (0-100).
- $S_{meta}$: Metadata consistency score (0-100).
- $S_{prop}$: Propagation nodes quantity score (0-100).
- $S_{narr}$: Semantic shift intensity score (0-100).
- $w_{i}$: Dynamic coefficient weights customizable in settings.
