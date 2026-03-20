import { dom } from './dom.js';
import { state } from './state.js';

export function getMousePos(event) {
    const rect = dom.canvas.getBoundingClientRect();
    const scaleX = dom.canvas.width / rect.width;
    const scaleY = dom.canvas.height / rect.height;
    return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY
    };
}

export function findLineNear(x, y) {
    let closest = null;
    let minDistance = 10; 

    for (const line of state.lines) {
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
