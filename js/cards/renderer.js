import { dom } from './dom.js';
import { state } from './state.js';
import { hexToRgb, sortDetectedCards, getRenderScale, orderPoints, getPadding } from './utils.js';
import { getRectCardCorners, getRectCardCenter, sortRectCards } from './rect-mode.js';

// ---------------------------------------------------------------------------
// Canvas font constants
// ---------------------------------------------------------------------------

// The fonts are generated dynamically now based on getRenderScale()
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Main redraw
// ---------------------------------------------------------------------------

export function redraw() {
    if (!state.isImageLoaded) return;

    const pad = getPadding();

    // Resize canvas to image + padding
    const newW = dom.sourceCanvas.width + pad.x * 2;
    const newH = dom.sourceCanvas.height + pad.y * 2;
    if (dom.canvas.width !== newW || dom.canvas.height !== newH) {
        dom.canvas.width = newW;
        dom.canvas.height = newH;
    }

    // Fill padding area with light checkerboard pattern
    if (pad.x > 0 || pad.y > 0) {
        const patC = document.createElement('canvas');
        patC.width = 20; patC.height = 20;
        const patCtx = patC.getContext('2d');
        patCtx.fillStyle = '#f0f0f0';
        patCtx.fillRect(0, 0, 20, 20);
        patCtx.fillStyle = '#e0e0e0';
        patCtx.fillRect(0, 0, 10, 10);
        patCtx.fillRect(10, 10, 10, 10);
        dom.ctx.fillStyle = dom.ctx.createPattern(patC, 'repeat');
        dom.ctx.fillRect(0, 0, dom.canvas.width, dom.canvas.height);
    }

    // Draw image at padding offset
    dom.ctx.drawImage(dom.sourceCanvas, pad.x, pad.y);

    // All subsequent drawing uses pad offset via ctx.translate
    dom.ctx.save();
    dom.ctx.translate(pad.x, pad.y);

    if (state.editMode === 'rect') {
        redrawRectMode();
    } else {
        redrawFreeformMode();
    }

    dom.ctx.restore();

    updateZoomWindow();
}

// ---------------------------------------------------------------------------
// Freeform mode rendering (unchanged logic)
// ---------------------------------------------------------------------------

function redrawFreeformMode() {
    sortDetectedCards();
    const scale = getRenderScale();

    for (let i = 0; i < state.detectedCards.length; i++) {
        const card = state.detectedCards[i];

        dom.ctx.beginPath();
        dom.ctx.moveTo(card[0].x, card[0].y);
        for (let j = 1; j < 4; j++) {
            dom.ctx.lineTo(card[j].x, card[j].y);
        }
        dom.ctx.closePath();

        const colorRgb = hexToRgb(dom.lineColor.value);
        const opacity = dom.lineOpacity.value;

        dom.ctx.lineWidth = 1.5 * scale;
        dom.ctx.strokeStyle = `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, ${opacity})`;
        dom.ctx.stroke();

        dom.ctx.fillStyle = `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, ${opacity * 0.2})`;
        dom.ctx.fill();

        for (let j = 0; j < 4; j++) {
            const pt = card[j];
            const radius = 10 * scale;
            const crossSize = 4 * scale;

            let color;
            let lineW;
            if (pt === state.selectedPoint) {
                color = "#007bff";
                lineW = 3 * scale;
            } else if (pt === state.hoveredPoint) {
                color = "orange";
                lineW = 2.5 * scale;
            } else {
                color = "red";
                lineW = 2 * scale;
            }

            dom.ctx.beginPath();
            dom.ctx.arc(pt.x, pt.y, radius, 0, 2 * Math.PI);
            dom.ctx.strokeStyle = color;
            dom.ctx.lineWidth = lineW;
            dom.ctx.stroke();

            dom.ctx.beginPath();
            dom.ctx.moveTo(pt.x - crossSize, pt.y);
            dom.ctx.lineTo(pt.x + crossSize, pt.y);
            dom.ctx.moveTo(pt.x, pt.y - crossSize);
            dom.ctx.lineTo(pt.x, pt.y + crossSize);
            dom.ctx.strokeStyle = color;
            dom.ctx.lineWidth = 1.5 * scale;
            dom.ctx.stroke();
        }

        const numFontSize = Math.max(16, Math.round(30 * scale));
        dom.ctx.font = `bold ${numFontSize}px Arial`;
        dom.ctx.fillStyle = "red";
        dom.ctx.fillText((i + 1).toString(), card[0].x + 20 * scale, card[0].y + 40 * scale);

        if (card.includes(state.selectedPoint) || card.includes(state.hoveredPoint) || card === state.draggedCard || card === state.hoveredCard) {
            const infoFontSize = Math.max(12, Math.round(14 * scale));
            dom.ctx.font = `bold ${infoFontSize}px Arial`;
            dom.ctx.textAlign = "center";
            dom.ctx.textBaseline = "middle";

            let cx = card.reduce((sum, p) => sum + p.x, 0) / 4;
            let cy = card.reduce((sum, p) => sum + p.y, 0) / 4;

            const drawLabel = (ctx, text, x, y, color = "#007bff") => {
                const metrics = ctx.measureText(text);
                const width = metrics.width + 12 * scale;
                const height = 24 * scale;

                ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
                if (ctx.roundRect) {
                    ctx.beginPath();
                    ctx.roundRect(x - width / 2, y - height / 2, width, height, 4 * scale);
                    ctx.fill();
                } else {
                    ctx.fillRect(x - width / 2, y - height / 2, width, height);
                }
                ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
                ctx.lineWidth = 1 * scale;
                ctx.stroke();

                ctx.fillStyle = color;
                ctx.fillText(text, x, y);
            };

            for (let k = 0; k < 4; k++) {
                const pt = card[k];
                const ptNext = card[(k + 1) % 4];
                const ptPrev = card[(k + 3) % 4];

                const dist = Math.round(Math.hypot(ptNext.x - pt.x, ptNext.y - pt.y));
                const mx = (pt.x + ptNext.x) / 2;
                const my = (pt.y + ptNext.y) / 2;
                drawLabel(dom.ctx, `${dist} px`, mx, my);

                const v1x = ptPrev.x - pt.x;
                const v1y = ptPrev.y - pt.y;
                const v2x = ptNext.x - pt.x;
                const v2y = ptNext.y - pt.y;

                const len1 = Math.hypot(v1x, v1y);
                const len2 = Math.hypot(v2x, v2y);

                if (len1 > 0 && len2 > 0) {
                    const dot = (v1x * v2x + v1y * v2y) / (len1 * len2);
                    const angleRad = Math.acos(Math.max(-1, Math.min(1, dot)));
                    const angleDeg = (angleRad * 180 / Math.PI).toFixed(2);

                    const dirX = cx - pt.x;
                    const dirY = cy - pt.y;
                    const lenDir = Math.hypot(dirX, dirY);
                    if (lenDir > 0) {
                        const offsetPx = 40 * scale;
                        const ax = pt.x + (dirX / lenDir) * offsetPx;
                        const ay = pt.y + (dirY / lenDir) * offsetPx;
                        drawLabel(dom.ctx, `${angleDeg}\u00B0`, ax, ay, "#800080");
                    }
                }
            }

            dom.ctx.textAlign = "start";
            dom.ctx.textBaseline = "alphabetic";
        }
    }
}

// ---------------------------------------------------------------------------
// Rect mode rendering
// ---------------------------------------------------------------------------

function redrawRectMode() {
    sortRectCards();
    const scale = getRenderScale();

    for (let i = 0; i < state.rectCards.length; i++) {
        const card = state.rectCards[i];
        const corners = getRectCardCorners(card);

        const isSelected = i === state.selectedRectCardIndex;
        const isHovered  = i === state.hoveredRectCardIndex;
        const isActive   = isSelected || isHovered;

        // Fill
        dom.ctx.beginPath();
        dom.ctx.moveTo(corners[0].x, corners[0].y);
        for (let j = 1; j < 4; j++) dom.ctx.lineTo(corners[j].x, corners[j].y);
        dom.ctx.closePath();

        let strokeColor, fillAlpha, lineWidth;
        if (isSelected) {
            strokeColor = '#007bff';
            fillAlpha   = 0.15;
            lineWidth   = 2.5 * scale;
        } else if (isHovered) {
            strokeColor = 'orange';
            fillAlpha   = 0.10;
            lineWidth   = 2 * scale;
        } else {
            strokeColor = 'rgba(180,0,0,0.7)';
            fillAlpha   = 0.06;
            lineWidth   = 1.5 * scale;
        }

        dom.ctx.fillStyle = isSelected
            ? `rgba(0,123,255,${fillAlpha})`
            : isHovered
                ? `rgba(255,165,0,${fillAlpha})`
                : `rgba(180,0,0,${fillAlpha})`;
        dom.ctx.fill();
        dom.ctx.strokeStyle = strokeColor;
        dom.ctx.lineWidth   = lineWidth;
        dom.ctx.stroke();

        // Card number near TL corner
        const numFontSize = Math.max(16, Math.round(28 * scale));
        dom.ctx.font = `bold ${numFontSize}px Arial`;
        dom.ctx.fillStyle = isSelected ? '#007bff' : 'rgba(180,0,0,0.8)';
        dom.ctx.textAlign = 'left';
        dom.ctx.textBaseline = 'top';
        const labelPad = 6 * scale;
        dom.ctx.fillText((i + 1).toString(), corners[0].x + labelPad, corners[0].y + labelPad);

        // Extra info for selected / hovered card
        if (isActive) {
            const center = getRectCardCenter(card);
            const infoFontSize = Math.max(12, Math.round(14 * scale));
            dom.ctx.font = `bold ${infoFontSize}px Arial`;
            dom.ctx.textAlign = 'center';
            dom.ctx.textBaseline = 'middle';

            const info = [
                `${state.rectWidth} × ${state.rectHeight} px`,
                state.rectSkew !== 0 ? `skew ${state.rectSkew} px` : null,
                card.angle !== 0 ? `${card.angle.toFixed(1)}\u00B0` : null,
            ].filter(Boolean).join('  ·  ');

            // Background pill
            const metrics = dom.ctx.measureText(info);
            const pw = metrics.width + 16 * scale;
            const ph = 22 * scale;
            dom.ctx.fillStyle = 'rgba(255,255,255,0.88)';
            if (dom.ctx.roundRect) {
                dom.ctx.beginPath();
                dom.ctx.roundRect(center.x - pw / 2, center.y - ph / 2, pw, ph, 4 * scale);
                dom.ctx.fill();
            } else {
                dom.ctx.fillRect(center.x - pw / 2, center.y - ph / 2, pw, ph);
            }
            dom.ctx.strokeStyle = 'rgba(0,0,0,0.15)';
            dom.ctx.lineWidth = 1 * scale;
            dom.ctx.stroke();

            dom.ctx.fillStyle = '#333';
            dom.ctx.fillText(info, center.x, center.y);

            dom.ctx.textAlign = 'start';
            dom.ctx.textBaseline = 'alphabetic';
        }
    }
}

// ---------------------------------------------------------------------------
// Zoom window
// ---------------------------------------------------------------------------

export function updateZoomWindow() {
    if (!dom.zoomCheckbox.checked || !state.isImageLoaded) {
        dom.zoomContainer.style.display = 'none';
        return;
    }

    if (state.editMode === 'rect') {
        updateZoomWindowRect();
    } else {
        updateZoomWindowFreeform();
    }
}

// -- Freeform zoom (unchanged logic) ----------------------------------------

function updateZoomWindowFreeform() {
    if (!state.selectedPoint) {
        dom.zoomContainer.style.display = 'none';
        return;
    }

    dom.zoomContainer.style.display = 'block';

    const zoomFactor = state.zoomLevel;
    const zoomWidth  = dom.zoomCanvas.width;
    const zoomHeight = dom.zoomCanvas.height;

    const sourceSizeW = zoomWidth  / zoomFactor;
    const sourceSizeH = zoomHeight / zoomFactor;

    let cornerIndex = -1;
    let cardIndex   = -1;
    for (let i = 0; i < state.detectedCards.length; i++) {
        const card = state.detectedCards[i];
        const idx  = card.indexOf(state.selectedPoint);
        if (idx !== -1) { cornerIndex = idx; cardIndex = i; break; }
    }

    if (dom.zoomTitle) {
        let titleText = cardIndex !== -1
            ? `Zoom Preview (${cardIndex + 1}/${state.detectedCards.length})`
            : 'Zoom Preview';
        titleText += ` [${state.zoomLevel}x]`;
        dom.zoomTitle.textContent = titleText;

        if (cardIndex !== -1 && cardIndex === state.detectedCards.length - 1) {
            dom.zoomTitle.classList.add('is-last-card');
        } else {
            dom.zoomTitle.classList.remove('is-last-card');
        }
    }

    let crosshairX = zoomWidth  / 2;
    let crosshairY = zoomHeight / 2;
    const margin = 40;

    if      (cornerIndex === 0) { crosshairX = margin;            crosshairY = margin; }
    else if (cornerIndex === 1) { crosshairX = zoomWidth - margin; crosshairY = margin; }
    else if (cornerIndex === 2) { crosshairX = zoomWidth - margin; crosshairY = zoomHeight - margin; }
    else if (cornerIndex === 3) { crosshairX = margin;            crosshairY = zoomHeight - margin; }

    const pad = getPadding();
    const sx = Math.round(state.selectedPoint.x + pad.x - (crosshairX / zoomFactor));
    const sy = Math.round(state.selectedPoint.y + pad.y - (crosshairY / zoomFactor));

    dom.zoomCtx.fillStyle = '#f8f9fa';
    dom.zoomCtx.fillRect(0, 0, zoomWidth, zoomHeight);
    dom.zoomCtx.imageSmoothingEnabled = false;
    dom.zoomCtx.drawImage(dom.canvas, sx, sy, sourceSizeW, sourceSizeH, 0, 0, zoomWidth, zoomHeight);


}

// -- Rect-mode zoom: 4-quadrant (one quadrant per corner) -------------------

function updateZoomWindowRect() {
    if (state.selectedRectCardIndex === -1) {
        dom.zoomContainer.style.display = 'none';
        return;
    }

    dom.zoomContainer.style.display = 'block';

    const card = state.rectCards[state.selectedRectCardIndex];
    const total = state.rectCards.length;
    let corners = getRectCardCorners(card);
    
    // Sort corners visually so the zoom window quadrants match the visual orientation
    corners = orderPoints(corners);

    if (dom.zoomTitle) {
        dom.zoomTitle.textContent =
            `Zoom: card ${state.selectedRectCardIndex + 1}/${total} [${state.rectZoomLevel}x]  (+/-)`;
            
        if (state.selectedRectCardIndex === total - 1 && total > 0) {
            dom.zoomTitle.classList.add('is-last-card');
        } else {
            dom.zoomTitle.classList.remove('is-last-card');
        }
    }

    const ZW = dom.zoomCanvas.width;
    const ZH = dom.zoomCanvas.height;
    const qw = ZW / 2;
    const qh = ZH / 2;

    dom.zoomCtx.fillStyle = '#f0f0f0';
    dom.zoomCtx.fillRect(0, 0, ZW, ZH);

    const zf   = state.rectZoomLevel;
    const srcW = qw / zf;
    const srcH = qh / zf;

    // Quadrant offsets on the zoom canvas: [TL, TR, BR, BL]
    //   TL corner -> top-left  quadrant  (0,  0 )
    //   TR corner -> top-right quadrant  (qw, 0 )
    //   BR corner -> bot-right quadrant  (qw, qh)
    //   BL corner -> bot-left  quadrant  (0,  qh)
    const quadOffsets = [
        { dx: 0,  dy: 0  },   // TL
        { dx: qw, dy: 0  },   // TR
        { dx: qw, dy: qh },   // BR
        { dx: 0,  dy: qh },   // BL
    ];

    // Each card corner appears near the OUTER corner of its quadrant -
    // card edges converge inward toward the center dividers.
    //   TL -> (margin, margin)           upper-left  in TL quadrant
    //   TR -> (qw-margin, margin)        upper-right in TR quadrant
    //   BR -> (qw-margin, qh-margin)     lower-right in BR quadrant
    //   BL -> (margin, qh-margin)        lower-left  in BL quadrant
    const margin = 15;
    const crosshairPositions = [
        { cx: margin,        cy: margin        },   // TL
        { cx: qw - margin,   cy: margin        },   // TR
        { cx: qw - margin,   cy: qh - margin   },   // BR
        { cx: margin,        cy: qh - margin   },   // BL
    ];

    dom.zoomCtx.imageSmoothingEnabled = false;

    for (let i = 0; i < 4; i++) {
        const pt  = corners[i];
        const off = quadOffsets[i];
        const ch  = crosshairPositions[i];

        const padOffset = getPadding();
        const sx = Math.round(pt.x + padOffset.x - ch.cx / zf);
        const sy = Math.round(pt.y + padOffset.y - ch.cy / zf);

        dom.zoomCtx.drawImage(dom.canvas, sx, sy, srcW, srcH, off.dx, off.dy, qw, qh);



        // Corner label near the outer corner of each quadrant
        const labels = ['TL', 'TR', 'BR', 'BL'];
        dom.zoomCtx.font         = 'bold 12px Arial';
        dom.zoomCtx.fillStyle    = 'rgba(0,0,180,0.65)';
        dom.zoomCtx.textAlign    = (i === 1 || i === 2) ? 'right' : 'left';
        dom.zoomCtx.textBaseline = (i < 2) ? 'top' : 'bottom';
        dom.zoomCtx.fillText(
            labels[i],
            (i === 1 || i === 2) ? off.dx + qw - 4 : off.dx + 4,
            (i < 2) ? off.dy + 4 : off.dy + qh - 4
        );
    }

    // Reference rectangle: one thin yellow border across the entire zoom canvas,
    // with corners exactly at each quadrant's crosshair position.
    // The user aligns card corners to touch this rectangle.
    dom.zoomCtx.beginPath();
    dom.zoomCtx.strokeStyle = 'rgba(255, 220, 0, 0.9)';
    dom.zoomCtx.lineWidth   = 1.5;
    dom.zoomCtx.strokeRect(margin, margin, ZW - margin * 2, ZH - margin * 2);

    // Divider lines
    dom.zoomCtx.beginPath();
    dom.zoomCtx.strokeStyle = 'rgba(100,100,100,0.5)';
    dom.zoomCtx.lineWidth   = 1;
    dom.zoomCtx.moveTo(qw, 0);
    dom.zoomCtx.lineTo(qw, ZH);
    dom.zoomCtx.moveTo(0, qh);
    dom.zoomCtx.lineTo(ZW, qh);
    dom.zoomCtx.stroke();

    dom.zoomCtx.textAlign    = 'start';
    dom.zoomCtx.textBaseline = 'alphabetic';
}



