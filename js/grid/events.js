import { dom } from './dom.js';
import { state } from './state.js';
import { updateDownloadButtonText, resetLines } from './ui.js';
import { getMousePos, findLineNear } from './utils.js';
import { redraw } from './renderer.js';
import { autoDetectCutMarks } from './detect.js';
import { generateAndDownloadZip, calculateCutRegions } from './export.js';
import { handleFileUpload, renderPdfPageForPreview } from './file-loader.js';

export function bindEvents() {
    dom.skipEdgesCheckbox.addEventListener('change', updateDownloadButtonText);
    dom.minSizeInput.addEventListener('input', updateDownloadButtonText);
    dom.dpiInput.addEventListener('input', updateDownloadButtonText);
    dom.allPagesCheckbox.addEventListener('change', () => {
        const checked = dom.allPagesCheckbox.checked;
        dom.pairingModeContainer.style.display = checked ? 'inline-flex' : 'none';
        if (!checked) dom.pairingModeSelect.value = 'none';
    });
    dom.dpiInput.addEventListener('change', () => {
        if (state.isPdf && state.pdfDoc) {
            const requestedDpi = parseInt(dom.dpiInput.value) || 300;
            state.PDF_SCALE = requestedDpi / 72;
            renderPdfPageForPreview(state.currentPreviewPage);
        }
    });

    dom.fileInput.addEventListener("change", handleFileUpload);

    dom.prevPageBtn.addEventListener("click", () => {
        if (state.currentPreviewPage > 1) {
            state.currentPreviewPage--;
            renderPdfPageForPreview(state.currentPreviewPage);
        }
    });

    dom.nextPageBtn.addEventListener("click", () => {
        if (state.pdfDoc && state.currentPreviewPage < state.pdfDoc.numPages) {
            state.currentPreviewPage++;
            renderPdfPageForPreview(state.currentPreviewPage);
        }
    });

    dom.canvas.addEventListener("mousedown", (e) => {
        if (!state.isImageLoaded) return;
        
        dom.canvas.focus({ preventScroll: true });
        
        const pos = getMousePos(e);
        state.startMousePos = pos;
        state.hasMoved = false;
        
        const hitLine = findLineNear(pos.x, pos.y);
        if (hitLine) {
            if (e.shiftKey) {
                state.draggedLine = hitLine;
                state.isDragging = true;
            }
            state.selectedLine = hitLine;
        } else {
            state.selectedLine = null;
        }
        redraw();
    });

    dom.canvas.addEventListener("mouseenter", () => {
        state.isMouseOverCanvas = true;
        redraw();
    });

    dom.canvas.addEventListener("mouseleave", () => {
        state.isMouseOverCanvas = false;
        redraw();
    });

    dom.canvas.addEventListener("mousemove", (e) => {
        if (!state.isImageLoaded) return;
        const pos = getMousePos(e);
        state.currentMousePos = pos;
        state.isShiftPressed = e.shiftKey;
        
        if (Math.hypot(pos.x - state.startMousePos.x, pos.y - state.startMousePos.y) > 3) {
            state.hasMoved = true;
        }

        if (state.isDragging && state.draggedLine) {
            if (!e.shiftKey) {
                state.isDragging = false;
                state.draggedLine = null;
            } else {
                if (state.draggedLine.x !== null) {
                    state.draggedLine.x = Math.max(0, Math.min(dom.canvas.width, pos.x));
                } else if (state.draggedLine.y !== null) {
                    state.draggedLine.y = Math.max(0, Math.min(dom.canvas.height, pos.y));
                }
            }
            redraw();
        } else {
            state.hoverLine = findLineNear(pos.x, pos.y);
            
            if (state.hoverLine && e.shiftKey) {
                dom.canvas.style.cursor = state.hoverLine.x !== null ? 'ew-resize' : 'ns-resize';
            } else {
                dom.canvas.style.cursor = 'crosshair';
            }
            redraw(); 
        }
    });

    window.addEventListener("mouseup", () => {
        if (state.isDragging) {
            state.isDragging = false;
            state.draggedLine = null;
            updateDownloadButtonText();
        }
    });

    dom.canvas.addEventListener("click", (e) => {
        if (!state.isImageLoaded) return;
        if (state.hasMoved) return; 
        
        const pos = getMousePos(e);
        const hitLine = findLineNear(pos.x, pos.y);
        
        if (!hitLine) {
            const newLine = e.shiftKey ? { x: pos.x, y: null } : { x: null, y: pos.y };
            state.lines.push(newLine);
            state.selectedLine = newLine; 
            
            dom.downloadButton.disabled = false;
            dom.resetButton.disabled = false;
            updateDownloadButtonText();
            redraw();
        }
    });

    window.addEventListener("keyup", (e) => {
        if (e.key === "Shift") {
            state.isShiftPressed = false;
            if (state.isDragging) {
                state.isDragging = false;
                state.draggedLine = null;
            }
            if (state.isMouseOverCanvas && state.isImageLoaded) {
                dom.canvas.style.cursor = 'crosshair';
                redraw();
            }
        }
    });

    window.addEventListener("keydown", (e) => {
        if (e.key === "Shift") {
            state.isShiftPressed = true;
            if (state.isMouseOverCanvas && state.isImageLoaded) {
                if (state.hoverLine) {
                    dom.canvas.style.cursor = state.hoverLine.x !== null ? 'ew-resize' : 'ns-resize';
                }
                redraw();
            }
        }

        if (!state.isImageLoaded || !state.selectedLine) return;
        
        if (e.target.tagName === 'INPUT') return;

        let step = e.shiftKey ? 10 : 1;
        let handled = false;

        if (state.selectedLine.x !== null) { 
            if (e.key === "ArrowLeft") {
                state.selectedLine.x = Math.max(0, state.selectedLine.x - step);
                handled = true;
            } else if (e.key === "ArrowRight") {
                state.selectedLine.x = Math.min(dom.canvas.width, state.selectedLine.x + step);
                handled = true;
            }
        } else if (state.selectedLine.y !== null) { 
            if (e.key === "ArrowUp") {
                state.selectedLine.y = Math.max(0, state.selectedLine.y - step);
                handled = true;
            } else if (e.key === "ArrowDown") {
                state.selectedLine.y = Math.min(dom.canvas.height, state.selectedLine.y + step);
                handled = true;
            }
        }

        if (e.key === "Delete" || e.key === "Backspace") {
            state.lines = state.lines.filter(l => l !== state.selectedLine);
            state.selectedLine = null;
            dom.downloadButton.disabled = state.lines.length === 0;
            dom.resetButton.disabled = state.lines.length === 0;
            updateDownloadButtonText();
            handled = true;
        }

        if (handled) {
            e.preventDefault(); 
            redraw();
        }
    });

    dom.resetButton.addEventListener("click", resetLines);

    dom.autoDetectButton.addEventListener("click", () => {
        if (!state.isImageLoaded) return;
        autoDetectCutMarks();
    });

    dom.downloadButton.addEventListener("click", async () => {
        if (state.lines.length === 0) return;
        
        calculateCutRegions();

        if (state.cutRegions.length === 0) {
            alert("No regions left with these settings. Create more lines or uncheck the 'discard edges' option.");
            return;
        }

        dom.downloadButton.disabled = true;
        dom.downloadButton.textContent = "Processing... Please wait";
        dom.resetButton.disabled = true;
        Array.from(document.querySelectorAll('.pdf-nav-btn')).forEach(btn => btn.disabled = true);

        try {
            await generateAndDownloadZip();
        } catch (error) {
            console.error("Error creating archive:", error);
            alert("An error occurred while creating the archive.");
        } finally {
            dom.downloadButton.disabled = false;
            updateDownloadButtonText();
            dom.resetButton.disabled = false;
            if (state.isPdf) {
                dom.prevPageBtn.disabled = state.currentPreviewPage <= 1;
                dom.nextPageBtn.disabled = state.currentPreviewPage >= state.pdfDoc.numPages;
            }
        }
    });
}
