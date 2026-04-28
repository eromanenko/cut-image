import { dom } from './dom.js';
import { state } from './state.js';

export function drawLinePath(line) {
    if (line.x !== null) {
        dom.ctx.moveTo(line.x, 0);
        dom.ctx.lineTo(line.x, dom.canvas.height);
    } else if (line.y !== null) {
        dom.ctx.moveTo(0, line.y);
        dom.ctx.lineTo(dom.canvas.width, line.y);
    }
}

export function redraw() {
    if (!state.isImageLoaded) return;

    dom.ctx.drawImage(dom.sourceCanvas, 0, 0);
    
    if (state.lines.length > 0) {
        dom.ctx.beginPath();
        for (const line of state.lines) {
            if (line === state.selectedLine || line === state.hoverLine) continue;
            drawLinePath(line);
        }
        dom.ctx.strokeStyle = "red";
        dom.ctx.lineWidth = 1;
        dom.ctx.setLineDash([5, 5]);
        dom.ctx.stroke();
        dom.ctx.setLineDash([]);

        if (state.hoverLine && state.hoverLine !== state.selectedLine) {
            dom.ctx.beginPath();
            drawLinePath(state.hoverLine);
            dom.ctx.strokeStyle = "rgba(0, 123, 255, 0.6)"; 
            dom.ctx.lineWidth = 2;
            dom.ctx.setLineDash([5, 5]);
            dom.ctx.stroke();
            dom.ctx.setLineDash([]);
        }

        if (state.selectedLine) {
            dom.ctx.beginPath();
            drawLinePath(state.selectedLine);
            dom.ctx.strokeStyle = "#007bff"; 
            dom.ctx.lineWidth = 2;
            dom.ctx.setLineDash([5, 5]);
            dom.ctx.stroke();
            dom.ctx.setLineDash([]);
        }
    }

    if (state.isMouseOverCanvas && !state.isDragging && !state.hoverLine) {
        dom.ctx.beginPath();
        if (state.isShiftPressed) {
            dom.ctx.moveTo(state.currentMousePos.x, 0);
            dom.ctx.lineTo(state.currentMousePos.x, dom.canvas.height);
        } else {
            dom.ctx.moveTo(0, state.currentMousePos.y);
            dom.ctx.lineTo(dom.canvas.width, state.currentMousePos.y);
        }
        dom.ctx.strokeStyle = "rgba(255, 0, 0, 0.4)"; 
        dom.ctx.lineWidth = 1;
        dom.ctx.setLineDash([5, 5]); 
        dom.ctx.stroke();
        dom.ctx.setLineDash([]); 
    }
}
