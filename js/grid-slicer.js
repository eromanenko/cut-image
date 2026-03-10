// Tab switching logic
function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    document.querySelector(`.tab-btn[onclick="switchTab('${tabId}')"]`).classList.add('active');
    document.getElementById(`tab-${tabId}`).classList.add('active');
}

// DOM Elements
const fileInput = document.getElementById("fileInput");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const downloadButton = document.getElementById("downloadButton");
const resetButton = document.getElementById("resetButton");
const skipEdgesCheckbox = document.getElementById("skipEdgesCheckbox");

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

    if (file.type === "application/pdf") {
        isPdf = true;
        pdfControls.style.display = "flex";
        downloadButton.textContent = "Download Archive";
        
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdfjsLib = window['pdfjs-dist/build/pdf'];
            pdfDoc = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
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
                redraw();
            };
            image.src = e.target.result;
        };
        reader.readAsDataURL(file);
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
        
        isImageLoaded = true;
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

                if (!skipEdgesCheckbox.checked || (!isEdgeX && !isEdgeY)) {
                    cutRegions.push({ 
                        index: index++, 
                        x: lastX, 
                        y: lastY, 
                        w: width, 
                        h: height 
                    });
                }
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
                    const padPage = String(pageNum).padStart(3, '0');
                    const padPiece = String(region.index).padStart(3, '0');
                    zip.file(`page_${padPage}_piece_${padPiece}.png`, blob);
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
            zip.file(`piece_${String(region.index).padStart(3, '0')}.png`, blob);
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
