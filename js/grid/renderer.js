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

    if (state.isMouseOverCanvas && !state.isDragging && !state.hoverLine && state.gridMode !== 'grid') {
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

    drawDimensions();
}

function drawDimensions() {
    const xLines = [0, ...state.lines.filter(l => l.x !== null).map(l => l.x), dom.canvas.width].sort((a, b) => a - b);
    const yLines = [0, ...state.lines.filter(l => l.y !== null).map(l => l.y), dom.canvas.height].sort((a, b) => a - b);

    dom.ctx.font = "bold 12px Arial";
    dom.ctx.fillStyle = "red";
    
    // Horizontal segments (top)
    dom.ctx.textAlign = "center";
    dom.ctx.textBaseline = "top";
    for (let i = 0; i < xLines.length - 1; i++) {
        const dist = Math.round(xLines[i+1] - xLines[i]);
        if (dist < 10) continue; 
        const midX = (xLines[i] + xLines[i+1]) / 2;
        const text = dist + "px";
        
        const metrics = dom.ctx.measureText(text);
        dom.ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        dom.ctx.fillRect(midX - metrics.width / 2 - 3, 5, metrics.width + 6, 16);
        
        dom.ctx.fillStyle = "red";
        dom.ctx.fillText(text, midX, 7);
    }

    // Vertical segments (left)
    dom.ctx.textAlign = "left";
    dom.ctx.textBaseline = "middle";
    for (let i = 0; i < yLines.length - 1; i++) {
        const dist = Math.round(yLines[i+1] - yLines[i]);
        if (dist < 10) continue;
        const midY = (yLines[i] + yLines[i+1]) / 2;
        const text = dist + "px";

        const metrics = dom.ctx.measureText(text);
        dom.ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        dom.ctx.fillRect(5, midY - 9, metrics.width + 6, 18);

        dom.ctx.fillStyle = "red";
        dom.ctx.fillText(text, 8, midY);
    }
}
