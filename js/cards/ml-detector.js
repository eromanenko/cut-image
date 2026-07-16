import { state } from './state.js';
import { dom } from './dom.js';
import { orderPoints } from './utils.js';
import { fitRectCardToDetected } from './rect-mode.js';
import { sortDetectedCards } from './utils.js';

let session = null;
let isSessionLoading = false;

export async function initML() {
    if (session) return;
    if (isSessionLoading) {
        // Wait until it's loaded if already in progress
        while (isSessionLoading) {
            await new Promise(r => setTimeout(r, 100));
        }
        return;
    }

    try {
        isSessionLoading = true;
        // Make sure ORT is loaded
        if (typeof ort === 'undefined') {
            throw new Error("ONNX Runtime Web is not loaded. Check your internet connection.");
        }
        // Load the ONNX model
        session = await ort.InferenceSession.create('models/best.onnx', { executionProviders: ['wasm'] });
        console.log("ML Model loaded successfully");
    } catch (e) {
        console.error("Failed to load ML model:", e);
        throw e;
    } finally {
        isSessionLoading = false;
    }
}

export async function detectCardsML() {
    await initML();

    state.detectedCards.length = 0;

    const imgsz = 1024;
    const srcW = dom.sourceCanvas.width;
    const srcH = dom.sourceCanvas.height;
    
    // Letterbox padding to maintain aspect ratio
    const scale = Math.min(imgsz / srcW, imgsz / srcH);
    const newW = Math.round(srcW * scale);
    const newH = Math.round(srcH * scale);
    const padX = (imgsz - newW) / 2;
    const padY = (imgsz - newH) / 2;

    const offCanvas = document.createElement('canvas');
    offCanvas.width = imgsz;
    offCanvas.height = imgsz;
    const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
    
    offCtx.fillStyle = '#727272'; // YOLO padding color
    offCtx.fillRect(0, 0, imgsz, imgsz);
    offCtx.drawImage(dom.sourceCanvas, padX, padY, newW, newH);

    const imgData = offCtx.getImageData(0, 0, imgsz, imgsz);
    const data = imgData.data;

    // Convert to Float32Array [1, 3, 1024, 1024] and normalize to 0-1
    const floatData = new Float32Array(3 * imgsz * imgsz);
    let offset = 0;
    for (let c = 0; c < 3; c++) {
        for (let y = 0; y < imgsz; y++) {
            for (let x = 0; x < imgsz; x++) {
                const idx = (y * imgsz + x) * 4 + c;
                floatData[offset++] = data[idx] / 255.0;
            }
        }
    }

    const tensor = new ort.Tensor('float32', floatData, [1, 3, imgsz, imgsz]);

    // Run inference
    const feeds = {};
    feeds[session.inputNames[0]] = tensor;
    const results = await session.run(feeds);
    
    const output = results[session.outputNames[0]].data; 
    
    const numAnchors = 21504; // 1024x1024 standard anchor count
    const confThreshold = 0.5;

    let predictions = [];

    // output is contiguous array in shape [1, 6, 21504]
    // 0:cx, 1:cy, 2:w, 3:h, 4:conf, 5:angle
    for (let i = 0; i < numAnchors; i++) {
        const conf = output[4 * numAnchors + i];
        if (conf > confThreshold) {
            const cx = output[0 * numAnchors + i];
            const cy = output[1 * numAnchors + i];
            const w = output[2 * numAnchors + i];
            const h = output[3 * numAnchors + i];
            const angle = output[5 * numAnchors + i];

            predictions.push({ cx, cy, w, h, angle, conf });
        }
    }

    // Sort by confidence descending
    predictions.sort((a, b) => b.conf - a.conf);

    // NMS (Non-Maximum Suppression) based on center distance
    let finalDetections = [];
    const minCenterDistSq = (imgsz * 0.05) ** 2;

    for (const p of predictions) {
        let duplicate = false;
        for (const f of finalDetections) {
            const distSq = (p.cx - f.cx)**2 + (p.cy - f.cy)**2;
            if (distSq < minCenterDistSq) {
                duplicate = true;
                break;
            }
        }
        if (!duplicate) {
            finalDetections.push(p);
        }
    }

    // Convert from letterbox space back to original canvas space
    for (const d of finalDetections) {
        const origCx = (d.cx - padX) / scale;
        const origCy = (d.cy - padY) / scale;
        const origW = d.w / scale;
        const origH = d.h / scale;
        
        const cosA = Math.cos(d.angle);
        const sinA = Math.sin(d.angle);
        
        const dx1 = (origW / 2) * cosA;
        const dy1 = (origW / 2) * sinA;
        
        const dx2 = -(origH / 2) * sinA;
        const dy2 = (origH / 2) * cosA;

        let corners = [
            { x: origCx + dx1 + dx2, y: origCy + dy1 + dy2 },
            { x: origCx - dx1 + dx2, y: origCy - dy1 + dy2 },
            { x: origCx - dx1 - dx2, y: origCy - dy1 - dy2 },
            { x: origCx + dx1 - dx2, y: origCy + dy1 - dy2 }
        ];

        state.detectedCards.push(orderPoints(corners));
    }

    sortDetectedCards();

    // Populate rect mode cards if needed
    if (state.editMode === 'rect') {
        if (state.rectWidth > 0 && state.rectHeight > 0) {
            state.rectCards = state.detectedCards.map(corners => fitRectCardToDetected(corners));
            state.detectedCards.length = 0;
            state.selectedRectCardIndex = state.rectCards.length > 0 ? 0 : -1;
        }
    }

    return state.detectedCards.length + state.rectCards.length;
}
