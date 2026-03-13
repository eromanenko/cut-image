// js/grid-slicer.js depends on js/tabs.js having been loaded.

// DOM Elements
const fileInput = document.getElementById("fileInput");
const prefixInput = document.getElementById("prefixInput");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const downloadButton = document.getElementById("downloadButton");
const resetButton = document.getElementById("resetButton");
const skipEdgesCheckbox = document.getElementById("skipEdgesCheckbox");
const autoDetectButton = document.getElementById("autoDetectButton");
const minSizeInput = document.getElementById("minSizeInput");
const dpiInput = document.getElementById("dpiInput");

// PDF DOM
const pdfControls = document.getElementById("pdfControls");
const prevPageBtn = document.getElementById("prevPageBtn");
const nextPageBtn = document.getElementById("nextPageBtn");
const pageIndicator = document.getElementById("pageIndicator");
const allPagesCheckbox = document.getElementById("allPagesCheckbox");
const allPagesCheckContainer = document.getElementById("allPagesCheckContainer");

// Application State
const sourceCanvas = document.createElement("canvas");
const sourceCtx = sourceCanvas.getContext("2d");

let lines = [];
let cutRegions = [];
let isImageLoaded = false;
let originalFileName = "archive";

// PDF State
let isPdf = false;
let pdfDoc = null;
let currentPreviewPage = 1;
const PDF_SCALE = 2; // Renders PDF at 2x resolution (higher quality for slicing)

// Drag and selection state
let isDragging = false;
let draggedLine = null;
let selectedLine = null;
let hoverLine = null;
let startMousePos = { x: 0, y: 0 };
let hasMoved = false;

// Preview state
let isMouseOverCanvas = false;
let currentMousePos = { x: 0, y: 0 };
let isShiftPressed = false;

// --- Event Handlers ---

// File upload
fileInput.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    resetState();
    
    // Define name for the archive cutting out the extension
    originalFileName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    prefixInput.value = originalFileName + "-";

    // Try to auto-detect DPI from file metadata
    const fileBuffer = await file.arrayBuffer();
    
    if (file.type === "application/pdf") {
        isPdf = true;
        pdfControls.style.display = "flex";
        downloadButton.textContent = "Download Archive";
        
        try {
            const pdfjsLib = window['pdfjs-dist/build/pdf'];
            pdfDoc = await pdfjsLib.getDocument({data: fileBuffer}).promise;
            currentPreviewPage = 1;

            if (pdfDoc.numPages <= 1) {
                allPagesCheckContainer.style.display = "none";
                allPagesCheckbox.checked = false;
            } else {
                allPagesCheckContainer.style.display = "inline-flex";
                allPagesCheckbox.checked = true;
            }

            await renderPdfPageForPreview(currentPreviewPage);
        } catch (err) {
            console.error("PDF load error:", err);
            alert("Error loading PDF document.");
        }
    } else {
        isPdf = false;
        pdfControls.style.display = "none";
        downloadButton.textContent = "Download Archive";

        // Check if file is TIFF (browsers can't render TIFF natively)
        const isTiff = file.type === 'image/tiff' || file.type === 'image/tif' 
            || file.name.toLowerCase().endsWith('.tif') 
            || file.name.toLowerCase().endsWith('.tiff');

        if (isTiff && typeof UTIF !== 'undefined') {
            // Decode TIFF using UTIF.js
            try {
                const ifds = UTIF.decode(fileBuffer);
                if (ifds.length === 0) {
                    alert("Could not decode TIFF file.");
                    return;
                }
                UTIF.decodeImage(fileBuffer, ifds[0]);
                const rgba = UTIF.toRGBA8(ifds[0]);
                const w = ifds[0].width;
                const h = ifds[0].height;

                // Extract DPI from TIFF IFD tags
                const tiffDpi = extractTiffDpi(ifds[0]);
                if (tiffDpi) {
                    dpiInput.value = tiffDpi;
                }

                // Draw decoded RGBA data onto source canvas
                sourceCanvas.width = w;
                sourceCanvas.height = h;
                const imgData = sourceCtx.createImageData(w, h);
                imgData.data.set(new Uint8Array(rgba));
                sourceCtx.putImageData(imgData, 0, 0);

                canvas.width = w;
                canvas.height = h;
                isImageLoaded = true;
                autoDetectButton.disabled = false;
                redraw();
            } catch (err) {
                console.error("TIFF decode error:", err);
                alert("Error decoding TIFF file: " + err.message);
            }
        } else {
            // Standard image (JPEG, PNG, etc.)
            // Auto-detect DPI from image metadata
            const detectedDpi = extractImageDpi(new Uint8Array(fileBuffer), file.type);
            if (detectedDpi) {
                dpiInput.value = detectedDpi;
            }
            
            const reader = new FileReader();
            reader.onload = (e) => {
                const image = new Image();
                image.onload = () => {
                    sourceCanvas.width = image.width;
                    sourceCanvas.height = image.height;
                    sourceCtx.drawImage(image, 0, 0);
                    
                    canvas.width = image.width;
                    canvas.height = image.height;
                    isImageLoaded = true;
                    autoDetectButton.disabled = false;
                    redraw();
                };
                image.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    }
});

async function renderPdfPageForPreview(pageNumber) {
    if (!pdfDoc) return;
    try {
        const page = await pdfDoc.getPage(pageNumber);
        const viewport = page.getViewport({ scale: PDF_SCALE });
        
        sourceCanvas.width = viewport.width;
        sourceCanvas.height = viewport.height;
        
        sourceCtx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
        await page.render({
            canvasContext: sourceCtx,
            viewport: viewport
        }).promise;
        
        canvas.width = sourceCanvas.width;
        canvas.height = sourceCanvas.height;
        
        pageIndicator.textContent = `Page ${pageNumber} / ${pdfDoc.numPages}`;
        
        prevPageBtn.disabled = pageNumber <= 1;
        nextPageBtn.disabled = pageNumber >= pdfDoc.numPages;
        
        // Auto-detect DPI for PDF: PDF uses 72 points/inch, we render at PDF_SCALE
        const pdfDpi = Math.round(72 * PDF_SCALE);
        dpiInput.value = pdfDpi;
        
        isImageLoaded = true;
        autoDetectButton.disabled = false;
        redraw();
    } catch (err) {
        console.error("Error rendering PDF page:", err);
    }
}

prevPageBtn.addEventListener("click", () => {
    if (currentPreviewPage > 1) {
        currentPreviewPage--;
        renderPdfPageForPreview(currentPreviewPage);
    }
});

nextPageBtn.addEventListener("click", () => {
    if (pdfDoc && currentPreviewPage < pdfDoc.numPages) {
        currentPreviewPage++;
        renderPdfPageForPreview(currentPreviewPage);
    }
});

function getMousePos(event) {
    const rect = canvas.getBoundingClientRect();
    // Calculate click coordinates relative to the real canvas size
    // considering CSS scaling via max-width
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY
    };
}

function findLineNear(x, y) {
    let closest = null;
    let minDistance = 10; // hit tolerance in pixels

    for (const line of lines) {
        if (line.x !== null) {
            const dist = Math.abs(line.x - x);
            if (dist < minDistance) {
                minDistance = dist;
                closest = line;
            }
        } else if (line.y !== null) {
            const dist = Math.abs(line.y - y);
            if (dist < minDistance) {
                minDistance = dist;
                closest = line;
            }
        }
    }
    return closest;
}

// Mouse Down (Start Dragging / Selecting)
canvas.addEventListener("mousedown", (e) => {
    if (!isImageLoaded) return;
    
    // Focus canvas to catch keyboard events
    canvas.focus();
    
    const pos = getMousePos(e);
    startMousePos = pos;
    hasMoved = false;
    
    const hitLine = findLineNear(pos.x, pos.y);
    if (hitLine) {
        if (e.shiftKey) {
            draggedLine = hitLine;
            isDragging = true;
        }
        selectedLine = hitLine;
    } else {
        selectedLine = null;
    }
    redraw();
});

canvas.addEventListener("mouseenter", () => {
    isMouseOverCanvas = true;
    redraw();
});

canvas.addEventListener("mouseleave", () => {
    isMouseOverCanvas = false;
    redraw();
});

// Mouse Move (Dragging / Hovering)
canvas.addEventListener("mousemove", (e) => {
    if (!isImageLoaded) return;
    const pos = getMousePos(e);
    currentMousePos = pos;
    isShiftPressed = e.shiftKey;
    
    // If moved more than 3px, consider it a drag so click doesn't add a line
    if (Math.hypot(pos.x - startMousePos.x, pos.y - startMousePos.y) > 3) {
        hasMoved = true;
    }

    if (isDragging && draggedLine) {
        if (!e.shiftKey) {
            isDragging = false;
            draggedLine = null;
        } else {
            if (draggedLine.x !== null) {
                draggedLine.x = Math.max(0, Math.min(canvas.width, pos.x));
            } else if (draggedLine.y !== null) {
                draggedLine.y = Math.max(0, Math.min(canvas.height, pos.y));
            }
        }
        redraw();
    } else {
        // Determine hover state
        hoverLine = findLineNear(pos.x, pos.y);
        
        if (hoverLine && e.shiftKey) {
            canvas.style.cursor = hoverLine.x !== null ? 'ew-resize' : 'ns-resize';
        } else {
            canvas.style.cursor = 'crosshair';
        }
        redraw(); // update preview line position and hover styles continuously
    }
});

// Mouse Up (End Dragging) covering whole window in case cursor leaves canvas
window.addEventListener("mouseup", () => {
    if (isDragging) {
        isDragging = false;
        draggedLine = null;
    }
});

// Click to add new line
canvas.addEventListener("click", (e) => {
    if (!isImageLoaded) return;
    if (hasMoved) return; // Discard click if dragged
    
    const pos = getMousePos(e);
    const hitLine = findLineNear(pos.x, pos.y);
    
    if (!hitLine) {
        const newLine = e.shiftKey ? { x: pos.x, y: null } : { x: null, y: pos.y };
        lines.push(newLine);
        selectedLine = newLine; // Auto-select the new line
        
        downloadButton.disabled = false;
        resetButton.disabled = false;
        redraw();
    }
});

// Keyboard movement, deletion, and shift key toggle
window.addEventListener("keyup", (e) => {
    if (e.key === "Shift") {
        isShiftPressed = false;
        if (isDragging) {
            isDragging = false;
            draggedLine = null;
        }
        if (isMouseOverCanvas && isImageLoaded) {
            canvas.style.cursor = 'crosshair';
            redraw();
        }
    }
});

window.addEventListener("keydown", (e) => {
    // Fast preview update on Shift press
    if (e.key === "Shift") {
        isShiftPressed = true;
        if (isMouseOverCanvas && isImageLoaded) {
            if (hoverLine) {
                canvas.style.cursor = hoverLine.x !== null ? 'ew-resize' : 'ns-resize';
            }
            redraw();
        }
    }

    if (!isImageLoaded || !selectedLine) return;
    
    // Do not capture keys if typing in an input
    if (e.target.tagName === 'INPUT') return;

    let step = e.shiftKey ? 10 : 1;
    let handled = false;

    if (selectedLine.x !== null) { // Vertical line
        if (e.key === "ArrowLeft") {
            selectedLine.x = Math.max(0, selectedLine.x - step);
            handled = true;
        } else if (e.key === "ArrowRight") {
            selectedLine.x = Math.min(canvas.width, selectedLine.x + step);
            handled = true;
        }
    } else if (selectedLine.y !== null) { // Horizontal line
        if (e.key === "ArrowUp") {
            selectedLine.y = Math.max(0, selectedLine.y - step);
            handled = true;
        } else if (e.key === "ArrowDown") {
            selectedLine.y = Math.min(canvas.height, selectedLine.y + step);
            handled = true;
        }
    }

    if (e.key === "Delete" || e.key === "Backspace") {
        lines = lines.filter(l => l !== selectedLine);
        selectedLine = null;
        downloadButton.disabled = lines.length === 0;
        resetButton.disabled = lines.length === 0;
        handled = true;
    }

    if (handled) {
        e.preventDefault(); // Prevent page scrolling
        redraw();
    }
});

// --- DPI Extraction from Image Metadata ---

/**
 * Extract DPI from TIFF IFD parsed by UTIF.js.
 * UTIF stores TIFF tags as properties: t282 = XResolution, t283 = YResolution,
 * t296 = ResolutionUnit (1=no unit, 2=inch, 3=centimeter).
 */
function extractTiffDpi(ifd) {
    try {
        // t282 = XResolution, t283 = YResolution (stored as rational [num, den])
        let xRes = ifd.t282;
        const resUnit = ifd.t296 || 2; // default: inches

        if (xRes) {
            // UTIF may return it as an array [numerator, denominator] or a single number
            let dpiValue;
            if (Array.isArray(xRes)) {
                dpiValue = xRes[0] / (xRes[1] || 1);
            } else {
                dpiValue = xRes;
            }

            if (resUnit === 3) {
                // Centimeters → DPI
                return Math.round(dpiValue * 2.54);
            }
            if (resUnit === 2 && dpiValue > 0) {
                return Math.round(dpiValue);
            }
        }
    } catch (e) {
        console.warn('TIFF DPI extraction failed:', e);
    }
    return null;
}

/**
 * Extract DPI from image file binary data.
 * Supports JPEG (JFIF APP0, EXIF APP1) and PNG (pHYs chunk).
 * Returns detected DPI as integer, or null if not detected.
 */
function extractImageDpi(bytes, mimeType) {
    try {
        if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
            return extractJpegDpi(bytes);
        } else if (mimeType === 'image/png') {
            return extractPngDpi(bytes);
        }
    } catch (e) {
        console.warn('DPI detection failed:', e);
    }
    return null;
}

function extractJpegDpi(bytes) {
    // JPEG files consist of markers: 0xFF followed by marker type
    // We look for APP0 (0xFFE0) for JFIF and APP1 (0xFFE1) for EXIF
    if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null; // Not a JPEG

    let offset = 2;
    while (offset < bytes.length - 4) {
        if (bytes[offset] !== 0xFF) break;
        const marker = bytes[offset + 1];
        const segLen = (bytes[offset + 2] << 8) | bytes[offset + 3];

        // APP0 - JFIF marker
        if (marker === 0xE0) {
            // Check JFIF signature
            const sig = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
            if (sig === 'JFIF') {
                const densityUnits = bytes[offset + 11]; // 0=no units, 1=dpi, 2=dpcm
                const xDensity = (bytes[offset + 12] << 8) | bytes[offset + 13];
                const yDensity = (bytes[offset + 14] << 8) | bytes[offset + 15];
                
                if (densityUnits === 1 && xDensity > 0) {
                    // Already in DPI
                    return xDensity;
                } else if (densityUnits === 2 && xDensity > 0) {
                    // Dots per cm → convert to DPI
                    return Math.round(xDensity * 2.54);
                }
                // densityUnits === 0 means aspect ratio only, keep looking for EXIF
            }
        }

        // APP1 - EXIF marker
        if (marker === 0xE1) {
            const exifDpi = parseExifForDpi(bytes, offset + 4, segLen - 2);
            if (exifDpi) return exifDpi;
        }

        // Stop at SOS (Start Of Scan) - image data starts
        if (marker === 0xDA) break;

        offset += 2 + segLen;
    }
    return null;
}

function parseExifForDpi(bytes, start, length) {
    // Check "Exif\0\0" signature
    const sig = String.fromCharCode(bytes[start], bytes[start + 1], bytes[start + 2], bytes[start + 3]);
    if (sig !== 'Exif') return null;

    const tiffStart = start + 6; // After "Exif\0\0"
    
    // Determine byte order: "II" (little-endian) or "MM" (big-endian)
    const byteOrder = String.fromCharCode(bytes[tiffStart], bytes[tiffStart + 1]);
    const isLE = byteOrder === 'II';

    function readU16(off) {
        if (isLE) return bytes[off] | (bytes[off + 1] << 8);
        return (bytes[off] << 8) | bytes[off + 1];
    }
    function readU32(off) {
        if (isLE) return bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16) | (bytes[off + 3] << 24);
        return (bytes[off] << 24) | (bytes[off + 1] << 16) | (bytes[off + 2] << 8) | bytes[off + 3];
    }

    // Read IFD0 offset
    const ifdOffset = readU32(tiffStart + 4);
    const ifdStart = tiffStart + ifdOffset;
    const numEntries = readU16(ifdStart);

    let resUnit = 2; // default: inches
    let xRes = null;

    for (let i = 0; i < numEntries; i++) {
        const entryOffset = ifdStart + 2 + i * 12;
        const tag = readU16(entryOffset);
        const type = readU16(entryOffset + 2);

        if (tag === 0x0128) { // ResolutionUnit: 2=inches, 3=centimeters
            resUnit = readU16(entryOffset + 8);
        }

        if (tag === 0x011A) { // XResolution (RATIONAL = numerator/denominator)
            const valueOffset = readU32(entryOffset + 8);
            const num = readU32(tiffStart + valueOffset);
            const den = readU32(tiffStart + valueOffset + 4);
            if (den > 0) xRes = num / den;
        }
    }

    if (xRes && xRes > 0) {
        if (resUnit === 3) {
            // Centimeters → DPI
            return Math.round(xRes * 2.54);
        }
        return Math.round(xRes); // Already DPI (inches)
    }
    return null;
}

function extractPngDpi(bytes) {
    // PNG file: 8-byte signature + chunks
    // Look for pHYs chunk which stores pixels-per-unit info
    if (bytes[0] !== 0x89 || bytes[1] !== 0x50) return null; // Not PNG

    let offset = 8; // Skip PNG signature
    while (offset < bytes.length - 12) {
        const chunkLen = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
        const chunkType = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);

        if (chunkType === 'pHYs') {
            const dataStart = offset + 8;
            // pHYs: 4 bytes X pixels per unit, 4 bytes Y pixels per unit, 1 byte unit specifier
            const xPPU = (bytes[dataStart] << 24) | (bytes[dataStart + 1] << 16) | (bytes[dataStart + 2] << 8) | bytes[dataStart + 3];
            const yPPU = (bytes[dataStart + 4] << 24) | (bytes[dataStart + 5] << 16) | (bytes[dataStart + 6] << 8) | bytes[dataStart + 7];
            const unit = bytes[dataStart + 8];

            if (unit === 1 && xPPU > 0) {
                // Unit 1 = meter. Convert to DPI: pixels/meter * 0.0254 = pixels/inch
                return Math.round(xPPU * 0.0254);
            }
        }

        if (chunkType === 'IDAT' || chunkType === 'IEND') break; // Stop at image data
        offset += 12 + chunkLen; // 4 (len) + 4 (type) + data + 4 (CRC)
    }
    return null;
}

// Reset lines
resetButton.addEventListener("click", () => {
    // Only reset lines, not the entire state
    lines = [];
    cutRegions = [];
    selectedLine = null;
    hoverLine = null;
    isDragging = false;
    draggedLine = null;
    downloadButton.disabled = true;
    resetButton.disabled = true;
    if (isImageLoaded) redraw();
});

// --- Auto-Detect Cut Marks ---
autoDetectButton.addEventListener("click", () => {
    if (!isImageLoaded) return;
    autoDetectCutMarks();
});

function autoDetectCutMarks() {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    const imageData = sourceCtx.getImageData(0, 0, w, h);
    const data = imageData.data;

    // Helper: get grayscale value at (x, y)
    function gray(x, y) {
        const i = (y * w + x) * 4;
        return (data[i] + data[i + 1] + data[i + 2]) / 3;
    }

    // Compute row profiles (for horizontal cut detection)
    const rowAvg = new Float32Array(h);
    const rowVar = new Float32Array(h);
    for (let y = 0; y < h; y++) {
        let sum = 0, sumSq = 0, count = 0;
        for (let x = 0; x < w; x += 2) {
            const v = gray(x, y);
            sum += v;
            sumSq += v * v;
            count++;
        }
        const mean = sum / count;
        rowAvg[y] = mean;
        rowVar[y] = sumSq / count - mean * mean;
    }

    // Compute column profiles (for vertical cut detection)
    const colAvg = new Float32Array(w);
    const colVar = new Float32Array(w);
    for (let x = 0; x < w; x++) {
        let sum = 0, sumSq = 0, count = 0;
        for (let y = 0; y < h; y += 2) {
            const v = gray(x, y);
            sum += v;
            sumSq += v * v;
            count++;
        }
        const mean = sum / count;
        colAvg[x] = mean;
        colVar[x] = sumSq / count - mean * mean;
    }

    // Detect cut lines
    const horizontalCuts = detectCutPositions(rowAvg, rowVar, h);
    const verticalCuts = detectCutPositions(colAvg, colVar, w);

    // Clear existing lines and add detected ones
    lines = [];
    for (const y of horizontalCuts) {
        lines.push({ x: null, y: y });
    }
    for (const x of verticalCuts) {
        lines.push({ x: x, y: null });
    }

    if (lines.length > 0) {
        downloadButton.disabled = false;
        resetButton.disabled = false;
    }

    selectedLine = null;
    redraw();
}

/**
 * Detect cut line positions by analyzing average brightness and
 * variance profiles of rows/columns.
 * 
 * Uses a dual-strategy approach:
 * 1. Low-variance bands: rows/cols that are very uniform (low variance)
 *    compared to their neighborhood — typical of solid-colored separator lines.
 * 2. Brightness dips: rows/cols that are significantly darker than
 *    their surrounding neighborhood.
 *
 * Both strategies' candidates are merged and clustered.
 */
function detectCutPositions(avg, varArr, length) {
    const windowSize = Math.max(15, Math.round(length * 0.015));
    const bandWidth = Math.max(3, Math.round(length * 0.003)); // max width of a cut mark band
    const candidates = [];

    // Compute smoothed profiles for local comparison
    for (let i = windowSize; i < length - windowSize; i++) {
        // Compute neighborhood statistics (excluding the immediate band around i)
        let neighborBrightSum = 0, neighborBrightCount = 0;
        let neighborVarSum = 0, neighborVarCount = 0;

        for (let j = i - windowSize; j < i - bandWidth; j++) {
            neighborBrightSum += avg[j];
            neighborVarSum += varArr[j];
            neighborBrightCount++;
            neighborVarCount++;
        }
        for (let j = i + bandWidth + 1; j <= i + windowSize; j++) {
            neighborBrightSum += avg[j];
            neighborVarSum += varArr[j];
            neighborBrightCount++;
            neighborVarCount++;
        }

        const neighborBrightAvg = neighborBrightSum / neighborBrightCount;
        const neighborVarAvg = neighborVarSum / neighborVarCount;

        // --- Strategy 1: low-variance uniform band ---
        // Cut marks are uniform (low variance), while card content has high variance.
        // Score = how much lower is this row's variance vs neighbors
        const varRatio = neighborVarAvg > 0 ? varArr[i] / neighborVarAvg : 1;

        // --- Strategy 2: brightness dip ---
        // Cut marks tend to be darker than surrounding card content
        const brightDiff = neighborBrightAvg - avg[i];

        // Combine scores: a good candidate has low varRatio AND/OR high brightDiff
        let score = 0;

        // Low variance signal (row is much more uniform than neighbors)
        if (varRatio < 0.3 && neighborVarAvg > 100) {
            score += (1 - varRatio) * 30; // up to ~30 points
        }

        // Brightness dip signal
        if (brightDiff > 10) {
            score += brightDiff;
        }

        // Also detect light separator lines (brighter than content)
        const brightRise = avg[i] - neighborBrightAvg;
        if (brightRise > 10 && varRatio < 0.5) {
            score += brightRise * 0.5;
        }

        if (score > 12) {
            candidates.push({ pos: i, score: score });
        }
    }

    if (candidates.length === 0) return [];

    // Cluster nearby candidates
    const minGap = Math.max(8, Math.round(length * 0.008));
    const clusters = [];
    let currentCluster = [candidates[0]];

    for (let i = 1; i < candidates.length; i++) {
        if (candidates[i].pos - candidates[i - 1].pos <= minGap) {
            currentCluster.push(candidates[i]);
        } else {
            clusters.push(currentCluster);
            currentCluster = [candidates[i]];
        }
    }
    clusters.push(currentCluster);

    // For each cluster, pick the position with the highest score
    const result = [];
    for (const cluster of clusters) {
        let best = cluster[0];
        for (const c of cluster) {
            if (c.score > best.score) best = c;
        }
        result.push(Math.round(best.pos));
    }

    return result;
}

// Create ZIP archive and download
downloadButton.addEventListener("click", async () => {
    if (lines.length === 0) return;
    
    // Calculate regions right before downloading
    calculateCutRegions();

    if (cutRegions.length === 0) {
        alert("No regions left with these settings. Create more lines or uncheck the 'discard edges' option.");
        return;
    }

    // Disable buttons to prevent multiple clicks
    const originalText = downloadButton.textContent;
    downloadButton.disabled = true;
    downloadButton.textContent = "Processing... Please wait";
    resetButton.disabled = true;
    Array.from(document.querySelectorAll('.pdf-nav-btn')).forEach(btn => btn.disabled = true);

    try {
        await generateAndDownloadZip();
    } catch (error) {
        console.error("Error creating archive:", error);
        alert("An error occurred while creating the archive.");
    } finally {
        downloadButton.disabled = false;
        downloadButton.textContent = originalText;
        resetButton.disabled = false;
        if (isPdf) {
            prevPageBtn.disabled = currentPreviewPage <= 1;
            nextPageBtn.disabled = currentPreviewPage >= pdfDoc.numPages;
        }
    }
});

// --- Core Functions ---

function resetState() {
    lines = [];
    cutRegions = [];
    selectedLine = null;
    hoverLine = null;
    isDragging = false;
    draggedLine = null;
    downloadButton.disabled = true;
    resetButton.disabled = true;
    pdfDoc = null;
    isPdf = false;
}

function drawLinePath(line) {
    if (line.x !== null) {
        ctx.moveTo(line.x, 0);
        ctx.lineTo(line.x, canvas.height);
    } else if (line.y !== null) {
        ctx.moveTo(0, line.y);
        ctx.lineTo(canvas.width, line.y);
    }
}

function redraw() {
    if (!isImageLoaded) return;

    // Draw original image or PDF page
    ctx.drawImage(sourceCanvas, 0, 0);
    
    // If lines exist, draw them
    if (lines.length > 0) {
        // Draw normal lines
        ctx.beginPath();
        for (const line of lines) {
            if (line === selectedLine || line === hoverLine) continue;
            drawLinePath(line);
        }
        ctx.strokeStyle = "red";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw hovered line
        if (hoverLine && hoverLine !== selectedLine) {
            ctx.beginPath();
            drawLinePath(hoverLine);
            ctx.strokeStyle = "rgba(0, 123, 255, 0.6)"; // Light blue
            ctx.lineWidth = 4;
            ctx.stroke();
        }

        // Draw selected line
        if (selectedLine) {
            ctx.beginPath();
            drawLinePath(selectedLine);
            ctx.strokeStyle = "#007bff"; // Solid blue
            ctx.lineWidth = 3;
            ctx.stroke();
        }
    }

    // Draw preview line
    if (isMouseOverCanvas && !isDragging && !hoverLine) {
        ctx.beginPath();
        if (isShiftPressed) {
            ctx.moveTo(currentMousePos.x, 0);
            ctx.lineTo(currentMousePos.x, canvas.height);
        } else {
            ctx.moveTo(0, currentMousePos.y);
            ctx.lineTo(canvas.width, currentMousePos.y);
        }
        ctx.strokeStyle = "rgba(255, 0, 0, 0.4)"; // Semi-transparent red
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]); // Dashed line for preview
        ctx.stroke();
        ctx.setLineDash([]); // Reset dash
    }
}

function calculateCutRegions() {
    cutRegions = [];
    let index = 1;
    
    const hasVerticalLines = lines.some(l => l.x !== null);
    const hasHorizontalLines = lines.some(l => l.y !== null);
    
    // Minimum size filter: convert mm to pixels using DPI
    const dpi = parseFloat(dpiInput.value) || 300;
    const minSizeMm = parseFloat(minSizeInput.value) || 0;
    const minSizePx = (minSizeMm / 25.4) * dpi; // mm -> inches -> pixels
    
    // Separate x and y coordinates
    const sortedX = [];
    const sortedY = [];
    
    for (const l of lines) {
        if (l.x !== null) sortedX.push(l.x);
        else if (l.y !== null) sortedY.push(l.y);
    }

    // Sort coordinates in ascending order
    sortedX.sort((a, b) => a - b);
    sortedY.sort((a, b) => a - b);
    
    // Add canvas boundaries
    sortedX.push(canvas.width);
    sortedY.push(canvas.height);

    let lastY = 0;
    for (const y of sortedY) {
        let lastX = 0;
        for (const x of sortedX) {
            const width = x - lastX;
            const height = y - lastY;
            
            if (width > 0 && height > 0) {
                // Determine if current region touches edges
                let isEdgeX = lastX === 0 || x === canvas.width;
                let isEdgeY = lastY === 0 || y === canvas.height;
                
                // If user hasn't made any lines in an axis, don't consider it an edge cut
                if (!hasVerticalLines) isEdgeX = false;
                if (!hasHorizontalLines) isEdgeY = false;

                // Skip edges if checkbox is checked
                if (skipEdgesCheckbox.checked && (isEdgeX || isEdgeY)) {
                    lastX = x;
                    continue;
                }

                // Skip regions smaller than minimum size
                if (minSizePx > 0 && (width < minSizePx || height < minSizePx)) {
                    lastX = x;
                    continue;
                }

                cutRegions.push({ 
                    index: index++, 
                    x: lastX, 
                    y: lastY, 
                    w: width, 
                    h: height 
                });
            }
            lastX = x;
        }
        lastY = y;
    }
}

async function generateAndDownloadZip() {
    const zip = new JSZip();
    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d");
    const prefix = prefixInput.value;

    if (isPdf && pdfDoc) {
        const startPage = allPagesCheckbox.checked ? 1 : currentPreviewPage;
        const endPage = allPagesCheckbox.checked ? pdfDoc.numPages : currentPreviewPage;

        // Iterating through pages of the PDF
        for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
            const page = await pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: PDF_SCALE });
            
            const pageCanvas = document.createElement("canvas");
            pageCanvas.width = viewport.width;
            pageCanvas.height = viewport.height;
            const pageCtx = pageCanvas.getContext("2d");
            
            // Render page clearly into pageCanvas
            await page.render({canvasContext: pageCtx, viewport: viewport}).promise;

            // Slice the current page using our predefined regions
            for (const region of cutRegions) {
                // Safeguard bounds (if pages have slightly different resolutions)
                const rX = Math.min(region.x, pageCanvas.width);
                const rY = Math.min(region.y, pageCanvas.height);
                const rW = Math.min(region.w, pageCanvas.width - rX);
                const rH = Math.min(region.h, pageCanvas.height - rY);
                
                if (rW > 0 && rH > 0) {
                    tempCanvas.width = rW;
                    tempCanvas.height = rH;
                    
                    tempCtx.drawImage(
                        pageCanvas, 
                        rX, rY, rW, rH, 
                        0, 0, rW, rH
                    );
                    
                    const blob = await new Promise(resolve => tempCanvas.toBlob(resolve, "image/png"));
                    // Pad page numbers and region indexes with zeros so they sort correctly in OS exploror
                    const padPage = String(pageNum).padStart(2, '0');
                    const padPiece = String(region.index).padStart(2, '0');
                    zip.file(`${prefix}${padPage}_${padPiece}.png`, blob);
                }
            }
            
            // Minor delay to let browser UI breathe during heavy rendering (very important for big PDFs)
            await new Promise(r => setTimeout(r, 15));
        }
    } else {
        // Regular Image Process
        for (const region of cutRegions) {
            tempCanvas.width = region.w;
            tempCanvas.height = region.h;
            
            tempCtx.drawImage(
                sourceCanvas, 
                region.x, region.y, region.w, region.h, 
                0, 0, region.w, region.h
            );
            
            const blob = await new Promise(resolve => tempCanvas.toBlob(resolve, "image/png"));
            zip.file(`${prefix}${String(region.index).padStart(2, '0')}.png`, blob);
        }
    }

    const content = await zip.generateAsync({ type: "blob" });
    
    // Downloading
    const a = document.createElement("a");
    a.href = URL.createObjectURL(content);
    a.download = originalFileName + ".zip";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href); 
}
