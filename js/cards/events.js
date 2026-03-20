import { dom } from './dom.js';
import { state } from './state.js';
import { redraw, updateZoomWindow } from './renderer.js';
import { handleAutoDetect } from './cv-detector.js';
import { exportCards } from './export.js';
import { handleFileUpload, renderPdfPageForPreview } from './file-loader.js';
import { updateButtonStates, scrollToCorner } from './ui.js';
import { getMousePos, findPointNear, findCardContaining } from './utils.js';

export function deleteSelectedCard() {
    if (!state.selectedPoint) return;
    if (!confirm("Are you sure you want to delete this card?")) return;
    const index = state.detectedCards.findIndex(card => card.includes(state.selectedPoint));
    if (index !== -1) {
        state.detectedCards.splice(index, 1);
        state.selectedPoint = null;
        updateButtonStates();
        redraw();
    }
}

export function bindEvents() {
    // Buttons
    dom.processButton.addEventListener('click', handleAutoDetect);
    dom.downloadButton.addEventListener('click', exportCards);
    dom.fileInput.addEventListener('change', handleFileUpload);
    dom.deleteButton.addEventListener("click", deleteSelectedCard);

    dom.getSizeBtn.addEventListener("click", () => {
        if (state.detectedCards.length === 0) {
            alert("No cards available. Please add a manual card or detect cards first.");
            return;
        }

        const card = state.detectedCards[0];
        const dist = (p1, p2) => Math.hypot(p2.x - p1.x, p2.y - p1.y);
        
        const w1 = dist(card[0], card[1]);
        const w2 = dist(card[2], card[3]);
        const h1 = dist(card[1], card[2]);
        const h2 = dist(card[3], card[0]);

        const avgW = (w1 + w2) / 2;
        const avgH = (h1 + h2) / 2;

        const pxW = Math.min(avgW, avgH);
        const pxH = Math.max(avgW, avgH);

        const dpi = parseFloat(dom.dpiInput.value) || 300;
        const mmW = (pxW * 25.4) / dpi;
        const mmH = (pxH * 25.4) / dpi;

        dom.widthInput.value = mmW.toFixed(1);
        dom.heightInput.value = mmH.toFixed(1);
    });

    dom.addManualButton.addEventListener('click', () => {
        if (!state.isImageLoaded) return;
        
        let cx = dom.sourceCanvas.width / 2;
        let cy = dom.sourceCanvas.height / 2;
        
        let w = Math.min(dom.sourceCanvas.width * 0.2, cx * 0.8);
        if (w < 100) w = 100;
        let h = w * 1.5;
        
        let pts = [
            { x: cx - w/2, y: cy - h/2 },
            { x: cx + w/2, y: cy - h/2 },
            { x: cx + w/2, y: cy + h/2 },
            { x: cx - w/2, y: cy + h/2 }
        ];
        
        state.detectedCards.push(pts);
        updateButtonStates();
        redraw();
    });

    // Styles
    dom.lineColor.addEventListener("input", redraw);
    document.querySelectorAll(".fixed-color-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            dom.lineColor.value = btn.dataset.color;
            redraw();
        });
    });

    dom.lineOpacity.addEventListener("input", (e) => {
        dom.lineOpacityVal.textContent = parseFloat(e.target.value).toFixed(2);
        redraw();
    });

    dom.zoomCheckbox.addEventListener("change", updateZoomWindow);

    // PDF Pagination
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

    // Canvas Mouse Events
    dom.canvas.addEventListener("mousedown", (e) => {
        if (!state.isImageLoaded || state.detectedCards.length === 0) return;
        dom.canvas.focus();
        
        const pos = getMousePos(e);
        const hitPoint = findPointNear(pos.x, pos.y);
        
        if (hitPoint) {
            state.selectedPoint = hitPoint;
            state.isDraggingPoint = true;
            state.draggedPoint = hitPoint;
        } else {
            state.selectedPoint = null;
            const hitCard = findCardContaining(pos.x, pos.y);
            if (hitCard) {
                state.isDraggingCard = true;
                state.draggedCard = hitCard;
                state.dragStartX = pos.x;
                state.dragStartY = pos.y;
                state.selectedPoint = hitCard[0]; 
            }
        }
        updateButtonStates();
        redraw();
    });

    dom.canvas.addEventListener("mousemove", (e) => {
        if (!state.isImageLoaded || state.detectedCards.length === 0) return;
        const pos = getMousePos(e);
        
        if (state.isDraggingPoint && state.draggedPoint) {
            state.draggedPoint.x = Math.max(0, Math.min(dom.canvas.width, pos.x));
            state.draggedPoint.y = Math.max(0, Math.min(dom.canvas.height, pos.y));
            dom.canvas.style.cursor = 'grabbing';
            redraw();
        } else if (state.isDraggingCard && state.draggedCard) {
            const dx = pos.x - state.dragStartX;
            const dy = pos.y - state.dragStartY;
            
            for (const pt of state.draggedCard) {
                pt.x += dx;
                pt.y += dy;
                pt.x = Math.max(0, Math.min(dom.canvas.width, pt.x));
                pt.y = Math.max(0, Math.min(dom.canvas.height, pt.y));
            }
            
            state.dragStartX = pos.x;
            state.dragStartY = pos.y;
            dom.canvas.style.cursor = 'grabbing';
            redraw();
        } else {
            state.hoveredPoint = findPointNear(pos.x, pos.y);
            state.hoveredCard = findCardContaining(pos.x, pos.y);
            
            if (state.hoveredPoint) {
                dom.canvas.style.cursor = 'grab';
            } else if (state.hoveredCard) {
                dom.canvas.style.cursor = 'move';
            } else {
                dom.canvas.style.cursor = 'crosshair';
            }
            redraw();
        }
    });

    window.addEventListener("mouseup", () => {
        if (state.isDraggingPoint) {
            state.isDraggingPoint = false;
            state.draggedPoint = null;
            if (dom.canvas.matches(':hover')) {
                dom.canvas.style.cursor = state.hoveredPoint ? 'grab' : 'crosshair';
            }
        }
        if (state.isDraggingCard) {
            state.isDraggingCard = false;
            state.draggedCard = null;
            if (dom.canvas.matches(':hover')) {
                dom.canvas.style.cursor = 'crosshair';
            }
        }
    });

    // Keyboard Events
    window.addEventListener("keydown", (e) => {
        if (e.target.tagName === 'INPUT') return;
        const tabCards = document.getElementById("tab-cards");
        if (tabCards && !tabCards.classList.contains("active")) return;

        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
            const key = e.key.toLowerCase();
            if (key === 'o') {
                dom.fileInput.click();
                return;
            } else if (key === 'a') {
                if (!dom.processButton.disabled) dom.processButton.click();
                return;
            } else if (key === 'n') {
                if (!dom.addManualButton.disabled) dom.addManualButton.click();
                return;
            } else if (key === 'd') {
                if (!dom.deleteButton.disabled) dom.deleteButton.click();
                return;
            } else if (key === 's') {
                if (!dom.downloadButton.disabled) dom.downloadButton.click();
                return;
            } else if (key === 'c' || key === 'с') {
                const colors = ['#000000', '#ffffff', '#808080', '#00ff00', '#0000ff', '#ff0000'];
                let currentIndex = colors.indexOf(dom.lineColor.value.toLowerCase());
                const nextIndex = (currentIndex === -1) ? 0 : (currentIndex + 1) % colors.length;
                dom.lineColor.value = colors[nextIndex];
                redraw();
                return;
            } else if (key === 'z') {
                dom.zoomCheckbox.checked = !dom.zoomCheckbox.checked;
                dom.zoomCheckbox.dispatchEvent(new Event('change'));
                return;
            } else if (key === '+' || key === '=') {
                state.zoomLevel = Math.min(10, Math.round((state.zoomLevel + 0.5) * 10) / 10);
                redraw();
                return;
            } else if (key === '-' || key === '_') {
                state.zoomLevel = Math.max(1, Math.round((state.zoomLevel - 0.5) * 10) / 10);
                redraw();
                return;
            }
        }

        if (!state.isImageLoaded || state.detectedCards.length === 0) return;

        if ((e.key === "Tab" || e.code === "Slash" || e.key === "/" || e.key === ".") && document.activeElement === dom.canvas) {
            e.preventDefault();

            if (e.shiftKey) {
                if (!state.selectedPoint) {
                    state.selectedPoint = state.detectedCards[0][0];
                } else {
                    const cardIdx = state.detectedCards.findIndex(c => c.includes(state.selectedPoint));
                    if (cardIdx !== -1) {
                        const cornerIdx = state.detectedCards[cardIdx].indexOf(state.selectedPoint);
                        const prevCornerIdx = (cornerIdx + 3) % 4; 
                        state.selectedPoint = state.detectedCards[cardIdx][prevCornerIdx];
                    }
                }
            } else {
                if (!state.selectedPoint) {
                    state.selectedPoint = state.detectedCards[0][0];
                } else {
                    const cardIdx = state.detectedCards.findIndex(c => c.includes(state.selectedPoint));
                    if (cardIdx !== -1) {
                        const cornerIdx = state.detectedCards[cardIdx].indexOf(state.selectedPoint);
                        const nextCornerIdx = (cornerIdx + 1) % 4;
                        state.selectedPoint = state.detectedCards[cardIdx][nextCornerIdx];
                    }
                }
            }

            const cardIdx = state.detectedCards.findIndex(c => c.includes(state.selectedPoint));
            if (cardIdx !== -1) {
                const cornerIdx = state.detectedCards[cardIdx].indexOf(state.selectedPoint);
                scrollToCorner(state.selectedPoint, cornerIdx);
            }

            updateButtonStates();
            redraw();
            return;
        }

        if (e.key === "Enter" && document.activeElement === dom.canvas) {
            e.preventDefault();

            if (!state.selectedPoint) {
                state.selectedPoint = state.detectedCards[0][0];
            } else {
                const cardIdx = state.detectedCards.findIndex(c => c.includes(state.selectedPoint));
                if (e.shiftKey) {
                    const prevCardIdx = (cardIdx - 1 + state.detectedCards.length) % state.detectedCards.length;
                    state.selectedPoint = state.detectedCards[prevCardIdx][0];
                } else {
                    const nextCardIdx = (cardIdx + 1) % state.detectedCards.length;
                    state.selectedPoint = state.detectedCards[nextCardIdx][0];
                }
            }

            scrollToCorner(state.selectedPoint, 0);
            updateButtonStates();
            redraw();
            return;
        }

        if (!state.selectedPoint) return;

        let step = (e.ctrlKey || e.metaKey) ? 10 : 1;
        let handled = false;
        let dx = 0;
        let dy = 0;

        if (e.key === "ArrowLeft") {
            dx = -step;
            handled = true;
        } else if (e.key === "ArrowRight") {
            dx = step;
            handled = true;
        } else if (e.key === "ArrowUp") {
            dy = -step;
            handled = true;
        } else if (e.key === "ArrowDown") {
            dy = step;
            handled = true;
        } else if (e.key === "Delete" || e.key === "Backspace") {
            deleteSelectedCard();
            handled = true;
        }

        if (handled && (dx !== 0 || dy !== 0)) {
            const oldX = state.selectedPoint.x;
            const oldY = state.selectedPoint.y;
            
            state.selectedPoint.x = Math.max(0, Math.min(dom.canvas.width, state.selectedPoint.x + dx));
            state.selectedPoint.y = Math.max(0, Math.min(dom.canvas.height, state.selectedPoint.y + dy));
            
            const actualDx = state.selectedPoint.x - oldX;
            const actualDy = state.selectedPoint.y - oldY;

            if (e.shiftKey && (actualDx !== 0 || actualDy !== 0)) {
                const cardIndex = state.detectedCards.findIndex(card => card.includes(state.selectedPoint));
                if (cardIndex !== -1) {
                    const card = state.detectedCards[cardIndex];
                    const pointIndex = card.indexOf(state.selectedPoint);

                    if (actualDx !== 0) {
                        const partnerXIndex = 3 - pointIndex;
                        card[partnerXIndex].x = Math.max(0, Math.min(dom.canvas.width, card[partnerXIndex].x + actualDx));
                    }

                    if (actualDy !== 0) {
                        const partnerYIndex = pointIndex ^ 1;
                        card[partnerYIndex].y = Math.max(0, Math.min(dom.canvas.height, card[partnerYIndex].y + actualDy));
                    }
                }
            }
        }

        if (handled) {
            e.preventDefault();
            redraw();
        }
    });
}
