import { dom } from './dom.js';
import { state } from './state.js';

export function hexToRgb(hex) {
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
}

export function getRenderScale() {
    if (!dom.canvas || dom.canvas.clientWidth === 0) return 1;
    return dom.canvas.width / dom.canvas.clientWidth;
}

export function getMousePos(event) {
    const rect = dom.canvas.getBoundingClientRect();
    const scaleX = dom.canvas.width / rect.width;
    const scaleY = dom.canvas.height / rect.height;
    return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY
    };
}

export function findPointNear(x, y) {
    let closest = null;
    const scale = getRenderScale();
    let minDistance = 20 * scale;
    for (const card of state.detectedCards) {
        for (const pt of card) {
            const dist = Math.hypot(pt.x - x, pt.y - y);
            if (dist < minDistance) {
                minDistance = dist;
                closest = pt;
            }
        }
    }
    return closest;
}

export function findCardContaining(x, y) {
    for (const card of state.detectedCards) {
        dom.ctx.beginPath();
        dom.ctx.moveTo(card[0].x, card[0].y);
        for (let j = 1; j < 4; j++) {
            dom.ctx.lineTo(card[j].x, card[j].y);
        }
        dom.ctx.closePath();
        if (dom.ctx.isPointInPath(x, y)) {
            return card;
        }
    }
    return null;
}

export function orderPoints(pts) {
    let ptsCopy = [...pts];
    let cx = ptsCopy.reduce((sum, p) => sum + p.x, 0) / 4;
    let cy = ptsCopy.reduce((sum, p) => sum + p.y, 0) / 4;

    ptsCopy.sort((a, b) => {
        let angleA = Math.atan2(a.y - cy, a.x - cx);
        let angleB = Math.atan2(b.y - cy, b.x - cx);
        return angleA - angleB;
    });

    ptsCopy = [...pts];
    ptsCopy.sort((a, b) => a.y - b.y);

    let topPts = [ptsCopy[0], ptsCopy[1]].sort((a, b) => a.x - b.x);
    let botPts = [ptsCopy[2], ptsCopy[3]].sort((a, b) => b.x - a.x);

    return [topPts[0], topPts[1], botPts[0], botPts[1]];
}

export function sortDetectedCards() {
    if (state.detectedCards.length <= 1) return;

    state.detectedCards.sort((cardA, cardB) => {
        let cyA = cardA.reduce((sum, p) => sum + p.y, 0) / 4;
        let cyB = cardB.reduce((sum, p) => sum + p.y, 0) / 4;
        let cxA = cardA.reduce((sum, p) => sum + p.x, 0) / 4;
        let cxB = cardB.reduce((sum, p) => sum + p.x, 0) / 4;

        let hA = Math.max(
            Math.hypot(cardA[3].x - cardA[0].x, cardA[3].y - cardA[0].y),
            Math.hypot(cardA[2].x - cardA[1].x, cardA[2].y - cardA[1].y)
        );

        if (Math.abs(cyA - cyB) < hA * 0.5) {
            return cxA - cxB;
        }
        return cyA - cyB;
    });
}
