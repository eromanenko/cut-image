import { dom } from './dom.js';
import { state } from './state.js';
import { updateDownloadButtonText } from './ui.js';
import { redraw } from './renderer.js';

export function autoDetectCutMarks() {
    const w = dom.sourceCanvas.width;
    const h = dom.sourceCanvas.height;
    const imageData = dom.sourceCtx.getImageData(0, 0, w, h);
    const data = imageData.data;

    function gray(x, y) {
        const i = (y * w + x) * 4;
        return (data[i] + data[i + 1] + data[i + 2]) / 3;
    }

    const rowAvg = new Float32Array(h);
    const rowVar = new Float32Array(h);
    for (let y = 0; y < h; y++) {
        let sum = 0, sumSq = 0, count = 0;
        for (let x = 0; x < w; x += 2) {
            const v = gray(x, y);
            sum += v;
            sumSq += v * v;
            count++;
        }
        const mean = sum / count;
        rowAvg[y] = mean;
        rowVar[y] = sumSq / count - mean * mean;
    }

    const colAvg = new Float32Array(w);
    const colVar = new Float32Array(w);
    for (let x = 0; x < w; x++) {
        let sum = 0, sumSq = 0, count = 0;
        for (let y = 0; y < h; y += 2) {
            const v = gray(x, y);
            sum += v;
            sumSq += v * v;
            count++;
        }
        const mean = sum / count;
        colAvg[x] = mean;
        colVar[x] = sumSq / count - mean * mean;
    }

    const horizontalCuts = detectCutPositions(rowAvg, rowVar, h);
    const verticalCuts = detectCutPositions(colAvg, colVar, w);

    state.lines = [];
    for (const y of horizontalCuts) {
        state.lines.push({ x: null, y: y });
    }
    for (const x of verticalCuts) {
        state.lines.push({ x: x, y: null });
    }

    if (state.lines.length > 0) {
        dom.downloadButton.disabled = false;
        dom.resetButton.disabled = false;
        updateDownloadButtonText();
    }

    state.selectedLine = null;
    redraw();
}

function detectCutPositions(avg, varArr, length) {
    const windowSize = Math.max(15, Math.round(length * 0.015));
    const bandWidth = Math.max(3, Math.round(length * 0.003)); 
    const candidates = [];

    for (let i = windowSize; i < length - windowSize; i++) {
        let neighborBrightSum = 0, neighborBrightCount = 0;
        let neighborVarSum = 0, neighborVarCount = 0;

        for (let j = i - windowSize; j < i - bandWidth; j++) {
            neighborBrightSum += avg[j];
            neighborVarSum += varArr[j];
            neighborBrightCount++;
            neighborVarCount++;
        }
        for (let j = i + bandWidth + 1; j <= i + windowSize; j++) {
            neighborBrightSum += avg[j];
            neighborVarSum += varArr[j];
            neighborBrightCount++;
            neighborVarCount++;
        }

        const neighborBrightAvg = neighborBrightSum / neighborBrightCount;
        const neighborVarAvg = neighborVarSum / neighborVarCount;

        const varRatio = neighborVarAvg > 0 ? varArr[i] / neighborVarAvg : 1;
        const brightDiff = neighborBrightAvg - avg[i];

        let score = 0;

        if (varRatio < 0.3 && neighborVarAvg > 100) {
            score += (1 - varRatio) * 30;
        }

        if (brightDiff > 10) {
            score += brightDiff;
        }

        const brightRise = avg[i] - neighborBrightAvg;
        if (brightRise > 10 && varRatio < 0.5) {
            score += brightRise * 0.5;
        }

        if (score > 12) {
            candidates.push({ pos: i, score: score });
        }
    }

    if (candidates.length === 0) return [];

    const minGap = Math.max(8, Math.round(length * 0.008));
    const clusters = [];
    let currentCluster = [candidates[0]];

    for (let i = 1; i < candidates.length; i++) {
        if (candidates[i].pos - candidates[i - 1].pos <= minGap) {
            currentCluster.push(candidates[i]);
        } else {
            clusters.push(currentCluster);
            currentCluster = [candidates[i]];
        }
    }
    clusters.push(currentCluster);

    const result = [];
    for (const cluster of clusters) {
        let best = cluster[0];
        for (const c of cluster) {
            if (c.score > best.score) best = c;
        }
        result.push(Math.round(best.pos));
    }

    return result;
}
