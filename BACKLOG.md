# Backlog

## 1. Use target card sizes in AI (YOLOv8) detection

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

## 2. Improve edge detection across diverse backgrounds (white, black, colored)

**Status:** planned (not started)

### Context
- The app is used by different people on varied scan backgrounds: white scanner bed (most common), black, red, and other colored sheets.
- Current `edge-refine.js` and `cv-detector.js` operate on grayscale luminance only.
- Before adding complex background estimation or UI controls, we should test the current edge refinement on real scans and apply simpler, zero-UI wins first.

### Prioritized steps
1. **Collect real-scan failure cases.** Test current `edge-refine.js` on real scans (white, black, colored backgrounds; bordered and borderless cards) and note where corners still miss.
2. **Color-channel gradient instead of grayscale (cheap win).** In `edge-refine.js`, compute edge gradient across RGB channels (e.g. max/norm of ΔR, ΔG, ΔB) instead of grayscale luma. Fixes isoluminant colored backgrounds (e.g. red/green sheet with same brightness as card edge) without needing background estimation or UI.
3. **White-on-white shadow handling.** On a white scanner bed with white-bordered cards, color does not separate card from background — only a thin shadow line along the edge does (two close opposing gradients). Detect this narrow dark-dip signature and pick the correct side of the shadow as the card boundary.
4. **Automatic background color estimation (if steps 2–3 aren't enough).** Estimate local `bgRGB` + spread from an outer ring around each AI quad (or global border strip for `cv-detector.js` foreground mask), with automatic fallback when background spread is high.
5. **Eyedropper tool (only if needed).** Add a manual background picker (e.g. 7×7 median patch + "Reset to Auto") only if real user scans show cases where automatic handling fails.

## 3. Clean up inline styles in HTML & JS

**Status:** planned (not started)

### Context
- Currently ~76 inline `style="..."` attributes in `index.html` and ~138 `.style.` / `style=` occurrences in `js/`.
- The project intentionally has **zero build step** (pure static HTML + ~33 KB modular CSS in `css/` + native ES modules, deployed directly on Netlify).
- **Why not Tailwind right now:** Tailwind CLI/PostCSS adds a build pipeline and watch step that breaks the zero-build simplicity; Tailwind Play CDN is not recommended for production (heavy runtime JS + FOUC). Reconsider Tailwind only if the project later adopts a bundler/framework (e.g. Vite).

### Tasks
1. **Expand `css/utilities.css` (currently 199 B)** and component stylesheets (`css/modals.css`, `css/controls.css`) with reusable classes for repeated layout/form patterns (`.flex-row`, `.gap-sm`, `.checkbox-row`, `.label-inline`, `.is-hidden`, etc.) using existing CSS variables.
2. **Refactor `index.html`** to replace the 76 inline `style="..."` attributes with semantic/utility classes.
3. **Refactor `js/`** to toggle CSS classes (e.g. `classList.toggle('is-hidden', ...)`) instead of direct `.style.display` mutations, keeping `.style` only for truly dynamic values (progress bar width, zoom/minimap coordinates, dynamic colors).

