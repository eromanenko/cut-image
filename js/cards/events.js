import { dom } from './dom.js';
import { state } from './state.js';
import { redraw, updateZoomWindow } from './renderer.js';
import { handleAutoDetect } from './cv-detector.js';
import { exportCards } from './export.js';
import { handleFileUpload, renderPdfPageForPreview } from './file-loader.js';
import { updateButtonStates, applyModeUI, showIniStatsModal, pulseViewCoordsButton, updateSettingsSummary, loadSettingsFromStorage, saveSettingsToStorage, resetSettingsToDefault } from './ui.js';
import { showAlert } from '../dialogs.js';
import { initCalculator, openCalculator } from './calculator.js';
import { saveCurrentToDatabase, serializeDatabaseToIni, parseIniToDatabase } from './ini-handler.js';
import { runBatchExport, clearSummary } from './batch-export.js';
import { switchMode } from './card-operations.js';
import { handleZoomTitleMouseDown, handleZoomResizerMouseDown, handleZoomMouseMove, handleZoomMouseUp } from './zoom-ui.js';
import { handleGlobalKeyDown, handleGlobalKeyUp } from './keyboard-handlers.js';
import { handleCanvasMouseDown, handleCanvasMouseMove, handleGlobalMouseUp } from './mouse-handlers.js';

function syncRectDimensions() {
    const w = parseFloat(dom.rectWidthPx.value)  || 0;
    const h = parseFloat(dom.rectHeightPx.value) || 0;
    const s = parseFloat(dom.rectSkewPx.value)   || 0;
    state.rectWidth  = w;
    state.rectHeight = h;
    state.rectSkew   = s;
}

export function bindEvents() {
    initCalculator();

    if (dom.drawShapeBtn) {
        dom.drawShapeBtn.addEventListener('click', () => {
            state.isDrawingPolygon = !state.isDrawingPolygon;
            if (state.isDrawingPolygon) {
                state.draftPolygon = [];
                dom.drawShapeBtn.classList.add('active');
                dom.canvas.style.cursor = 'crosshair';
            } else {
                dom.drawShapeBtn.classList.remove('active');
            }
            dom.canvas.focus({ preventScroll: true });
        });
    }

    dom.processButton.addEventListener('click', handleAutoDetect);
    dom.downloadButton.addEventListener('click', () => { exportCards(); dom.canvas.focus({ preventScroll: true }); });
    dom.fileInput.addEventListener('change', handleFileUpload);

    if (dom.saveCoordsButton) {
        dom.saveCoordsButton.addEventListener('click', () => {
            const ini = serializeDatabaseToIni();
            if (!ini) return;
            const blob = new Blob([ini], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'cut-coords.ini';
            a.click();
            URL.revokeObjectURL(url);
            state.hasUnsavedChanges = false;
            dom.canvas.focus({ preventScroll: true });
        });
    }

    if (dom.viewCoordsButton) {
        dom.viewCoordsButton.addEventListener('click', () => {
            saveCurrentToDatabase(false);
            showIniStatsModal(state.coordsDatabase);
            dom.canvas.focus({ preventScroll: true });
        });
    }

    if (dom.loadCoordsButton) {
        dom.loadCoordsButton.addEventListener('click', () => {
            dom.loadCoordsInput.click();
        });
        dom.loadCoordsInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                parseIniToDatabase(ev.target.result);
                state.hasUnsavedChanges = false;
                showIniStatsModal(state.coordsDatabase);
                updateButtonStates();
                dom.canvas.focus({ preventScroll: true });
            };
            reader.readAsText(file);
            e.target.value = '';
        });
    }

    if (dom.iniStatsOkBtn) dom.iniStatsOkBtn.addEventListener('click', () => { dom.iniStatsModal.style.display = 'none'; clearSummary(); pulseViewCoordsButton(); dom.canvas.focus({ preventScroll: true }); });
    if (dom.iniStatsCancelX) dom.iniStatsCancelX.addEventListener('click', () => { dom.iniStatsModal.style.display = 'none'; clearSummary(); pulseViewCoordsButton(); dom.canvas.focus({ preventScroll: true }); });

    if (dom.iniStatsLoadMoreBtn && dom.iniStatsLoadMoreInput) {
        dom.iniStatsLoadMoreBtn.addEventListener('click', () => {
            dom.iniStatsLoadMoreInput.click();
        });
        dom.iniStatsLoadMoreInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                parseIniToDatabase(ev.target.result, true); // true = merge
                state.hasUnsavedChanges = false;
                showIniStatsModal(state.coordsDatabase);
                updateButtonStates();
                dom.canvas.focus({ preventScroll: true });
            };
            reader.readAsText(file);
            e.target.value = '';
        });
    }

    if (dom.batchExportBtn && dom.batchSettingsModal) {
        // "Batch Export…" → open settings modal
        dom.batchExportBtn.addEventListener('click', () => {
            dom.batchSettingsModal.style.display = 'flex';
        });

        // Format radio → show/hide quality row
        const onFormatChange = () => {
            const isJpg = dom.batchFormatJpg && dom.batchFormatJpg.checked;
            if (dom.batchQualityRow) dom.batchQualityRow.style.display = isJpg ? 'flex' : 'none';
        };
        if (dom.batchFormatPng) dom.batchFormatPng.addEventListener('change', onFormatChange);
        if (dom.batchFormatJpg) dom.batchFormatJpg.addEventListener('change', onFormatChange);

        // Quality slider → update value label
        if (dom.batchQualitySlider) {
            dom.batchQualitySlider.addEventListener('input', () => {
                if (dom.batchQualityVal) dom.batchQualityVal.textContent = dom.batchQualitySlider.value + '%';
            });
        }

        // Close settings modal helpers
        const closeBatchSettings = () => {
            if (dom.batchSettingsModal) dom.batchSettingsModal.style.display = 'none';
        };
        if (dom.batchSettingsCancelX) dom.batchSettingsCancelX.addEventListener('click', closeBatchSettings);
        if (dom.batchSettingsCancelBtn) dom.batchSettingsCancelBtn.addEventListener('click', closeBatchSettings);

        // Confirm → close settings, open file picker
        if (dom.batchSettingsConfirmBtn && dom.batchExportInput) {
            dom.batchSettingsConfirmBtn.addEventListener('click', () => {
                closeBatchSettings();
                dom.batchExportInput.click();
            });
        }

        // File picker change → run export with chosen settings
        if (dom.batchExportInput) {
            dom.batchExportInput.addEventListener('change', async (e) => {
                const files = Array.from(e.target.files);
                e.target.value = '';
                if (!files.length) return;
                const format = dom.batchFormatJpg && dom.batchFormatJpg.checked ? 'jpg' : 'png';
                const quality = dom.batchQualitySlider ? parseInt(dom.batchQualitySlider.value, 10) : 90;
                await runBatchExport(files, { format, quality });
            });
        }
    }

    // ── Settings Modal ──────────────────────────────────────────────────────
    if (dom.settingsBtn) {
        dom.settingsBtn.addEventListener('click', () => {
            dom.settingsModal.style.display = 'flex';
        });
    }
    const closeSettingsModal = () => {
        dom.settingsModal.style.display = 'none';
        saveSettingsToStorage();
        updateSettingsSummary();
        redraw();
        dom.canvas.focus({ preventScroll: true });
    };
    if (dom.settingsCancelX) dom.settingsCancelX.addEventListener('click', closeSettingsModal);
    if (dom.settingsOkBtn) dom.settingsOkBtn.addEventListener('click', closeSettingsModal);
    
    if (dom.settingsResetBtn) {
        dom.settingsResetBtn.addEventListener('click', () => {
            resetSettingsToDefault();
            updateSettingsSummary();
            redraw();
        });
    }
    
    // Initial update
    loadSettingsFromStorage();
    updateSettingsSummary();

    // Mode toggle
    dom.freeformModeBtn.addEventListener('click', () => { switchMode('freeform'); dom.canvas.focus({ preventScroll: true }); });
    dom.rectModeBtn.addEventListener('click',     () => { switchMode('rect'); dom.canvas.focus({ preventScroll: true }); });

    // Rect-mode dimension inputs → update state & redraw
    [dom.rectWidthPx, dom.rectHeightPx, dom.rectSkewPx].forEach(input => {
        input.addEventListener('input', () => { syncRectDimensions(); redraw(); });
    });

    dom.dpiInput.addEventListener('change', () => {
        if (state.isPdf && state.pdfDoc) {
            const requestedDpi = parseInt(dom.dpiInput.value) || 300;
            state.PDF_SCALE = requestedDpi / 72;
            renderPdfPageForPreview(state.currentPreviewPage);
        }
        updateSettingsSummary();
    });

    dom.sizeListContainer.addEventListener("click", async (e) => {
        const calcBtn = e.target.closest('.ceFreeformCalcBtn');
        if (calcBtn) {
            const row = calcBtn.closest('.ce-size-row');
            openCalculator('freeform', row);
            return;
        }

        const getBtn = e.target.closest('.ceGetSizeBtn');
        if (getBtn) {
            if (state.detectedCards.length === 0) {
                await showAlert("No cards available. Please add a manual card or detect cards first.");
                return;
            }

            let card = null;
            if (state.selectedPoint) {
                card = state.detectedCards.find(c => c.includes(state.selectedPoint));
            }
            if (!card) card = state.detectedCards[0];

            const dist = (p1, p2) => Math.hypot(p2.x - p1.x, p2.y - p1.y);

            const w1 = dist(card[0], card[1]);
            const w2 = dist(card[2], card[3]);
            const h1 = dist(card[1], card[2]);
            const h2 = dist(card[3], card[0]);

            const avgW = (w1 + w2) / 2;
            const avgH = (h1 + h2) / 2;

            const pxW = Math.min(avgW, avgH);
            const pxH = Math.max(avgW, avgH);

            const dpi  = parseFloat(dom.dpiInput.value) || 300;
            const mmW  = (pxW * 25.4) / dpi;
            const mmH  = (pxH * 25.4) / dpi;

            const row = getBtn.closest('.ce-size-row');
            row.querySelector('.ceWidthInput').value  = mmW.toFixed(1);
            row.querySelector('.ceHeightInput').value = mmH.toFixed(1);
            dom.canvas.focus({ preventScroll: true });
            return;
        }

        const rmBtn = e.target.closest('.ceRemoveSizeBtn');
        if (rmBtn) {
            const row = rmBtn.closest('.ce-size-row');
            row.remove();
            const rows = dom.sizeListContainer.querySelectorAll('.ce-size-row');
            if (rows.length === 1) {
                rows[0].querySelector('.ceRemoveSizeBtn').style.display = 'none';
            }
            dom.canvas.focus({ preventScroll: true });
            return;
        }
    });

    dom.addSizeBtn.addEventListener("click", () => {
        const rows = dom.sizeListContainer.querySelectorAll('.ce-size-row');
        const newRow = rows[0].cloneNode(true);
        newRow.querySelector('.ceWidthInput').value = '';
        newRow.querySelector('.ceHeightInput').value = '';
        
        rows[0].querySelector('.ceRemoveSizeBtn').style.display = '';
        newRow.querySelector('.ceRemoveSizeBtn').style.display = '';
        
        dom.sizeListContainer.appendChild(newRow);
    });

    // ── Styles (freeform only) ───────────────────────────────────────────────
    dom.lineColor.addEventListener("input", redraw);
    document.querySelectorAll(".fixed-color-btn").forEach(btn => {
        btn.addEventListener("click", () => { dom.lineColor.value = btn.dataset.color; redraw(); });
    });

    dom.lineOpacity.addEventListener("input", (e) => {
        dom.lineOpacityVal.textContent = parseFloat(e.target.value).toFixed(2);
        redraw();
    });

    dom.zoomCheckbox.addEventListener("change", updateZoomWindow);

    dom.zoomTitle.addEventListener("mousedown", handleZoomTitleMouseDown);
    dom.zoomResizer.addEventListener("mousedown", handleZoomResizerMouseDown);

    // ── PDF Pagination ───────────────────────────────────────────────────────
    dom.prevPageBtn.addEventListener("click", () => {
        if (state.currentPreviewPage > 1) {
            state.currentPreviewPage--;
            renderPdfPageForPreview(state.currentPreviewPage);
            dom.canvas.focus({ preventScroll: true });
        }
    });

    dom.nextPageBtn.addEventListener("click", () => {
        if (state.pdfDoc && state.currentPreviewPage < state.pdfDoc.numPages) {
            state.currentPreviewPage++;
            renderPdfPageForPreview(state.currentPreviewPage);
            dom.canvas.focus({ preventScroll: true });
        }
    });

    // ── Canvas Mouse Events ──────────────────────────────────────────────────
    dom.canvas.addEventListener("mousedown", handleCanvasMouseDown);
    dom.canvas.addEventListener("mousemove", handleCanvasMouseMove);

    window.addEventListener("mousemove", handleZoomMouseMove);
    window.addEventListener("mouseup", () => {
        handleZoomMouseUp();
        handleGlobalMouseUp();
    });

    // ── Keyboard Events ──────────────────────────────────────────────────────
    window.addEventListener("keydown", handleGlobalKeyDown);
    window.addEventListener("keyup", handleGlobalKeyUp);

    // ── Warn before leaving with unsaved changes ──
    window.addEventListener("beforeunload", (e) => {
        if (state.hasUnsavedChanges) {
            e.preventDefault();
            e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
            return e.returnValue;
        }
    });
}
