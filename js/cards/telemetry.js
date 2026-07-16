// telemetry.js
import { dom } from './dom.js';
import { state } from './state.js';
import { getRectCardCorners } from './rect-mode.js';

/**
 * Compresses the source canvas to a smaller JPEG and returns it as a Base64 string.
 * This is to save bandwidth when sending telemetry.
 */
function getCompressedImageBase64(maxDimension = 1000, quality = 0.6) {
    if (!dom.sourceCanvas) return null;
    
    const cw = dom.sourceCanvas.width;
    const ch = dom.sourceCanvas.height;
    if (cw === 0 || ch === 0) return null;

    let scale = 1;
    if (cw > maxDimension || ch > maxDimension) {
        scale = Math.min(maxDimension / cw, maxDimension / ch);
    }

    const newW = Math.round(cw * scale);
    const newH = Math.round(ch * scale);

    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = newW;
    tmpCanvas.height = newH;
    const ctx = tmpCanvas.getContext('2d');
    
    // Draw scaled down
    ctx.drawImage(dom.sourceCanvas, 0, 0, newW, newH);
    
    // Convert to base64 jpeg
    const dataUrl = tmpCanvas.toDataURL('image/jpeg', quality);
    // Remove "data:image/jpeg;base64," prefix to send pure base64
    return dataUrl.split(',')[1];
}

/**
 * Extracts current cards' coordinates, normalized to the image size.
 */
function getNormalizedCoordinates() {
    const isRect = state.editMode === 'rect';
    const cardCount = isRect ? state.rectCards.length : state.detectedCards.length;
    
    const cw = dom.sourceCanvas.width;
    const ch = dom.sourceCanvas.height;
    
    const coords = [];
    for (let i = 0; i < cardCount; i++) {
        let card4pts;
        if (isRect) {
            card4pts = getRectCardCorners(state.rectCards[i]);
        } else {
            card4pts = state.detectedCards[i];
        }
        
        // Normalize coordinates to [0.0, 1.0] for model training robustness
        const normalized = card4pts.map(pt => ({
            x: pt.x / cw,
            y: pt.y / ch
        }));
        coords.push(normalized);
    }
    return coords;
}

export async function sendTelemetryData() {
    const checkbox = document.getElementById('ceShareDataCheckbox');
    if (!checkbox || !checkbox.checked) return; // User opted out

    const cardCount = state.editMode === 'rect' ? state.rectCards.length : state.detectedCards.length;
    if (cardCount === 0) return;

    if (!state.userEditedCoords) {
        console.log("Telemetry skipped: no manual edits made (model predicted perfectly).");
        return;
    }

    try {
        console.log("Preparing telemetry data...");
        const imageBase64 = getCompressedImageBase64();
        const coordinates = getNormalizedCoordinates();
        
        if (!imageBase64) return;

        const payload = {
            image: imageBase64,
            coordinates: coordinates,
            dimensions: {
                width: dom.sourceCanvas.width,
                height: dom.sourceCanvas.height
            },
            mode: state.editMode,
            timestamp: new Date().toISOString()
        };

        // Fire and forget (don't await or block the user's download)
        fetch('/.netlify/functions/save-dataset', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        }).then(response => {
            if (response.ok) {
                console.log("Telemetry sent successfully. Thanks for contributing!");
            } else {
                console.warn("Failed to send telemetry:", response.status);
            }
        }).catch(err => {
            console.warn("Error sending telemetry (network issue):", err);
        });

    } catch (e) {
        console.error("Error collecting telemetry data:", e);
    }
}
