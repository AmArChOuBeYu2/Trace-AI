# Digital Forensic Methodology in TRACE-AI

This document defines the mathematical models and digital forensics logic executed during media assessments.

## 1. Error Level Analysis (ELA)
ELA identifies areas within an image that are at different compression levels.
- **Algorithm:**
  1. Open target image in RGB space.
  2. Resave as a temporary JPEG file at 95% quality.
  3. Load the temporary file and calculate the absolute pixel difference:
     $$\Delta(x, y) = |I_{orig}(x, y) - I_{temp}(x, y)|$$
  4. Extrapolate differences to a full [0, 255] brightness range for visualization:
     $$I_{ela}(x, y) = \text{Brightness}(\Delta(x, y)) \times \text{Scale}$$
  5. Localized variations in brightness standard deviations flag spliced regions or text additions.

## 2. Technical Focus Blur (Laplacian Variance)
Blur detection helps evaluate image consistency and flag localized resampling.
- **Algorithm:**
  1. Convert image to grayscale.
  2. Convolve the image with the Laplacian operator:
     $$L = \begin{bmatrix} 0 & 1 & 0 \\ 1 & -4 & 1 \\ 0 & 1 & 0 \end{bmatrix}$$
  3. Compute the variance of the resulting response. Low variance indicates a lack of high-frequency detail (blur). Local anomalies in focus suggest composite images.

## 3. Perceptual Hashing (pHash)
- Perceptual hashes are generated from discrete cosine transformations (DCT) of media frame structures.
- They allow comparing whether two files are visually similar regardless of file format changes, compression, or scaling.
- Similarity is computed using the **Hamming Distance** between hashes.
