# Backlog

## Use target card sizes in AI (YOLOv8) detection

**Status:** planned (not started)

### Context
- Target sizes (mm, "Target Sizes for Auto-Detect" + DPI) are read via `getTargetSizes()` in `js/cards/dom.js`.
- Currently used only by:
  - Classic OpenCV detector — `js/cards/cv-detector.js` (~L27-40): converts mm → px with DPI, filters contours by area, aspect ratio, min/max side.
  - Manual card creation by click — `js/cards/mouse-handlers.js` `createFreeformCardAt` (~L30-34).
- NOT used by:
  - AI detector `js/cards/ml-detector.js`.
  - Corner refinement `js/cards/edge-refine.js` (`refineQuadOnGray` / `refineCardCorners`).
  - Hough detector `js/cards/hough-detector.js` (imports `getTargetSizes` but never calls it — either use it or remove the import).
- Conversion: `px = mm * dpi / 25.4`. Wrong DPI ⇒ wrong pixel sizes, so every size-based check must be tolerant and skip itself when sizes are not set.

### Tasks
1. **Filter AI false positives by size.** In `ml-detector.js`, after NMS and conversion to source coords, if target sizes are set: compute each detection's long/short side (from OBB w/h / scale) and drop detections whose sides or aspect ratio differ from every target size by more than a tolerance (e.g. ±15% sides, ±10% aspect). Never drop everything — if all would be dropped, keep the original list (likely wrong DPI) and maybe show a toast.
2. **Fallback for failed sides in corner refinement.** In `edge-refine.js` `refineQuadOnGray`, accept an optional `opts.expectedSize = { w, h }` (px). When exactly one side fails to fit but its opposite side succeeded, reconstruct the failed side as a line parallel to the opposite one at the expected distance (width or height, matched to the side orientation), instead of falling back to the raw AI side line.
3. **Validate refined result against expected size.** If `expectedSize` is given and the refined quad's average width/height deviate by more than ~2% from it (after matching orientation, i.e. min/max sides), treat refinement as failed and return the raw AI corners (or try the fallback from task 2).
4. Pass `expectedSize` from `ml-detector.js` (choose the target size closest to the raw detection's dimensions when several sizes are set).
5. Hough: use target sizes for filtering like OpenCV, or remove the unused import.

### Verification
- Extend the synthetic Node test (`edge-refine-test.mjs` in the conversation scratch dir; copy `edge-refine.js` to an `.mjs` file before importing because `package.json` is CommonJS) with: (a) one side with no contrast + `expectedSize` ⇒ corners still within 1 px; (b) wrong `expectedSize` ⇒ raw corners returned.
- Browser check on real scans: AI detect with sizes set vs not set; with refinement on/off.

### Related notes
- Corner refinement (done): profiles perpendicular to each AI side within ±band (≈ ±6 model px, `band = clamp(round(6/scale), 10, 60)`), outermost gradient peak with sub-pixel parabola, robust TLS line fit (inlier threshold capped at 3 px, final MAD ≤ 1 px), corners = intersections; sanity checks (shift ≤ 1.5·band, angles 60–120°, convex). Setting `ceRefineCornersCheckbox` (default on).
- Why the model alone isn't pixel-accurate: input downscaled to 1024 px (≈3.4 source px per model px on A4@300 DPI), OBB = rotated rectangle (can't express skew/perspective), smallest model (`yolov8n-obb`). More training scans give little gain on corner accuracy (v0.1 512 imgs vs v0.3 1216 imgs: mAP50-95 0.982 vs 0.981).
