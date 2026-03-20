import { dom } from './dom.js';
import { state } from './state.js';
import { hexToRgb, sortDetectedCards } from './utils.js';

export function redraw() {
    if (!state.isImageLoaded) return;

    dom.ctx.drawImage(dom.sourceCanvas, 0, 0);

    sortDetectedCards();

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

        dom.ctx.lineWidth = 1.5;
        dom.ctx.strokeStyle = `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, ${opacity})`;
        dom.ctx.stroke();

        dom.ctx.fillStyle = `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, ${opacity * 0.2})`;
        dom.ctx.fill();

        for (let j = 0; j < 4; j++) {
            const pt = card[j];
            const radius = 10;
            const crossSize = 4;

            let color;
            let lineW;
            if (pt === state.selectedPoint) {
                color = "#007bff";
                lineW = 3;
            } else if (pt === state.hoveredPoint) {
                color = "orange";
                lineW = 2.5;
            } else {
                color = "red";
                lineW = 2;
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
            dom.ctx.lineWidth = 1.5;
            dom.ctx.stroke();
        }

        dom.ctx.font = "bold 30px Arial";
        dom.ctx.fillStyle = "red";
        dom.ctx.fillText((i + 1).toString(), card[0].x + 20, card[0].y + 40);

        if (card.includes(state.selectedPoint) || card.includes(state.hoveredPoint) || card === state.draggedCard || card === state.hoveredCard) {
            dom.ctx.font = "bold 14px Arial";
            dom.ctx.textAlign = "center";
            dom.ctx.textBaseline = "middle";

            let cx = card.reduce((sum, p) => sum + p.x, 0) / 4;
            let cy = card.reduce((sum, p) => sum + p.y, 0) / 4;

            const drawLabel = (ctx, text, x, y, color = "#007bff") => {
                const metrics = ctx.measureText(text);
                const width = metrics.width + 12;
                const height = 24;

                ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
                if (ctx.roundRect) {
                    ctx.beginPath();
                    ctx.roundRect(x - width / 2, y - height / 2, width, height, 4);
                    ctx.fill();
                } else {
                    ctx.fillRect(x - width / 2, y - height / 2, width, height);
                }
                ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
                ctx.lineWidth = 1;
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
                        const offsetPx = 40;
                        const ax = pt.x + (dirX / lenDir) * offsetPx;
                        const ay = pt.y + (dirY / lenDir) * offsetPx;
                        drawLabel(dom.ctx, `${angleDeg}°`, ax, ay, "#800080");
                    }
                }
            }

            dom.ctx.textAlign = "start";
            dom.ctx.textBaseline = "alphabetic";
        }
    }

    updateZoomWindow();
}

export function updateZoomWindow() {
    if (!dom.zoomCheckbox.checked || !state.selectedPoint || !state.isImageLoaded) {
        dom.zoomContainer.style.display = "none";
        return;
    }

    dom.zoomContainer.style.display = "block";

    const zoomFactor = state.zoomLevel;
    const zoomWidth = dom.zoomCanvas.width;
    const zoomHeight = dom.zoomCanvas.height;

    const sourceSizeW = zoomWidth / zoomFactor;
    const sourceSizeH = zoomHeight / zoomFactor;

    let cornerIndex = -1;
    let cardIndex = -1;
    for (let i = 0; i < state.detectedCards.length; i++) {
        const card = state.detectedCards[i];
        const idx = card.indexOf(state.selectedPoint);
        if (idx !== -1) {
            cornerIndex = idx;
            cardIndex = i;
            break;
        }
    }

    if (dom.zoomTitle) {
        let titleText = cardIndex !== -1 
            ? `Zoom Preview (${cardIndex + 1}/${state.detectedCards.length})` 
            : "Zoom Preview";
        titleText += ` [${state.zoomLevel}x]`;
        dom.zoomTitle.textContent = titleText;
    }

    let crosshairX = zoomWidth / 2;
    let crosshairY = zoomHeight / 2;
    const margin = 40;

    if (cornerIndex === 0) {
        crosshairX = margin;
        crosshairY = margin;
    } else if (cornerIndex === 1) {
        crosshairX = zoomWidth - margin;
        crosshairY = margin;
    } else if (cornerIndex === 2) {
        crosshairX = zoomWidth - margin;
        crosshairY = zoomHeight - margin;
    } else if (cornerIndex === 3) {
        crosshairX = margin;
        crosshairY = zoomHeight - margin;
    }

    const sx = Math.round(state.selectedPoint.x - (crosshairX / zoomFactor));
    const sy = Math.round(state.selectedPoint.y - (crosshairY / zoomFactor));

    dom.zoomCtx.fillStyle = "#f8f9fa";
    dom.zoomCtx.fillRect(0, 0, zoomWidth, zoomHeight);
    dom.zoomCtx.imageSmoothingEnabled = false;

    dom.zoomCtx.drawImage(
        dom.canvas,
        sx, sy, sourceSizeW, sourceSizeH,
        0, 0, zoomWidth, zoomHeight
    );

    dom.zoomCtx.beginPath();
    dom.zoomCtx.strokeStyle = "rgba(0, 0, 0, 0.4)";
    dom.zoomCtx.lineWidth = 1;
    dom.zoomCtx.moveTo(0, crosshairY);
    dom.zoomCtx.lineTo(zoomWidth, crosshairY);
    dom.zoomCtx.moveTo(crosshairX, 0);
    dom.zoomCtx.lineTo(crosshairX, zoomHeight);
    dom.zoomCtx.stroke();
}
