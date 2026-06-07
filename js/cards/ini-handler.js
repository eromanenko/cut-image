import { state } from './state.js';
import { redraw } from './renderer.js';
import { dom } from './dom.js';
import { applyModeUI } from './ui.js';
import { getRectCardCorners } from './rect-mode.js';

export function getCurrentFileKey() {
    if (!state.currentFileName) return null;
    if (state.isPdf) {
        return `${state.currentFileName}#page_${state.currentPreviewPage}`;
    }
    return state.currentFileName;
}

export function saveCurrentToDatabase(isEdit = true) {
    const key = getCurrentFileKey();
    if (!key) return;

    const record = {
        editMode: state.editMode,
        dpi: parseInt(dom.dpiInput.value) || 300
    };

    if (state.editMode === 'freeform') {
        record.cards = JSON.parse(JSON.stringify(state.detectedCards));
    } else {
        record.rectCards = JSON.parse(JSON.stringify(state.rectCards));
        record.rectWidth = state.rectWidth;
        record.rectHeight = state.rectHeight;
        record.rectSkew = state.rectSkew;
    }

    state.coordsDatabase[key] = record;
    if (isEdit) {
        state.hasUnsavedChanges = true;
    }
}

export function loadCurrentFromDatabase() {
    const key = getCurrentFileKey();
    if (!key) return false;

    const record = state.coordsDatabase[key];
    if (!record) return false;

    // Apply record to state
    state.editMode = record.editMode || 'freeform';
    if (record.dpi && dom.dpiInput) {
        dom.dpiInput.value = record.dpi;
    }

    if (state.editMode === 'freeform') {
        state.detectedCards = JSON.parse(JSON.stringify(record.cards || []));
        state.rectCards = [];
    } else {
        state.rectCards = JSON.parse(JSON.stringify(record.rectCards || []));
        state.rectWidth = record.rectWidth || 0;
        state.rectHeight = record.rectHeight || 0;
        state.rectSkew = record.rectSkew || 0;
        state.detectedCards = [];
    }

    // Update UI toggle
    applyModeUI(state.editMode);
    
    if (state.editMode === 'rect') {
        if (dom.rectWidthPx) dom.rectWidthPx.value = state.rectWidth;
        if (dom.rectHeightPx) dom.rectHeightPx.value = state.rectHeight;
        if (dom.rectSkewPx) dom.rectSkewPx.value = state.rectSkew;
    }

    autoAdjustPadding();
    redraw();
    return true;
}

/**
 * Automatically set padding if any loaded card point falls outside the image.
 * Scans all freeform card points for negative coords or coords beyond image bounds.
 * Adds a small margin (20px) so the points aren't right at the edge.
 */
function autoAdjustPadding() {
    if (!dom.paddingX || !dom.paddingY) return;

    const imgW = dom.sourceCanvas.width;
    const imgH = dom.sourceCanvas.height;
    if (imgW === 0 || imgH === 0) return;

    let minX = 0, minY = 0, maxX = imgW, maxY = imgH;

    // Scan freeform cards
    for (const card of state.detectedCards) {
        for (const pt of card) {
            if (pt.x < minX) minX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y > maxY) maxY = pt.y;
        }
    }

    // Scan rect-mode cards (compute corners)
    if (state.editMode === 'rect' && state.rectCards.length > 0) {
        for (const rc of state.rectCards) {
            const corners = getRectCardCorners(rc);
            for (const pt of corners) {
                if (pt.x < minX) minX = pt.x;
                if (pt.y < minY) minY = pt.y;
                if (pt.x > maxX) maxX = pt.x;
                if (pt.y > maxY) maxY = pt.y;
            }
        }
    }

    const MARGIN = 20;
    const needPadX = Math.max(Math.ceil(-minX), Math.ceil(maxX - imgW));
    const needPadY = Math.max(Math.ceil(-minY), Math.ceil(maxY - imgH));

    if (needPadX > 0 || needPadY > 0) {
        dom.paddingX.value = needPadX + MARGIN;
        dom.paddingY.value = needPadY + MARGIN;
    }
}

export function serializeDatabaseToIni() {
    let ini = "";
    for (const [key, record] of Object.entries(state.coordsDatabase)) {
        ini += `[${key}]\n`;
        ini += `mode=${record.editMode || 'freeform'}\n`;
        ini += `dpi=${record.dpi || 300}\n`;

        if (record.editMode === 'freeform' && record.cards && record.cards.length > 0) {
            const cardStrings = record.cards.map(card => {
                return card.map(pt => `${pt.x},${pt.y}`).join(';');
            });
            ini += `cards=${cardStrings.join(' | ')}\n`;
        } else if (record.editMode === 'rect' && record.rectCards && record.rectCards.length > 0) {
            ini += `rectWidth=${record.rectWidth}\n`;
            ini += `rectHeight=${record.rectHeight}\n`;
            ini += `rectSkew=${record.rectSkew || 0}\n`;
            
            const cardStrings = record.rectCards.map(card => {
                return `${card.x},${card.y},${card.angle || 0}`;
            });
            ini += `cards=${cardStrings.join(' | ')}\n`;
        }
        ini += `\n`;
    }
    return ini.trim();
}

export function parseIniToDatabase(iniText, merge = false) {
    const lines = iniText.split(/\r?\n/);
    let currentKey = null;
    let db = {};

    for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith(';') || line.startsWith('#')) continue;

        if (line.startsWith('[') && line.endsWith(']')) {
            currentKey = line.substring(1, line.length - 1);
            db[currentKey] = {
                editMode: 'freeform',
                dpi: 300,
                cards: [],
                rectCards: [],
                rectWidth: 0,
                rectHeight: 0,
                rectSkew: 0
            };
            continue;
        }

        if (!currentKey) continue;

        const eqIndex = line.indexOf('=');
        if (eqIndex === -1) continue;

        const key = line.substring(0, eqIndex).trim();
        const value = line.substring(eqIndex + 1).trim();

        if (key === 'mode') {
            db[currentKey].editMode = value;
        } else if (key === 'dpi') {
            db[currentKey].dpi = parseInt(value) || 300;
        } else if (key === 'rectWidth') {
            db[currentKey].rectWidth = parseFloat(value) || 0;
        } else if (key === 'rectHeight') {
            db[currentKey].rectHeight = parseFloat(value) || 0;
        } else if (key === 'rectSkew') {
            db[currentKey].rectSkew = parseFloat(value) || 0;
        } else if (key === 'cards') {
            const cardParts = value.split('|').map(s => s.trim()).filter(s => s.length > 0);
            
            // We'll parse according to what mode has been read.
            // mode usually comes before cards.
            if (db[currentKey].editMode === 'freeform') {
                db[currentKey].cards = cardParts.map(part => {
                    const points = part.split(';');
                    return points.map(pt => {
                        const [x, y] = pt.split(',').map(Number);
                        return { x, y };
                    });
                });
            } else {
                db[currentKey].rectCards = cardParts.map(part => {
                    const [x, y, angle] = part.split(',').map(Number);
                    return { x, y, angle: angle || 0 };
                });
            }
        }
    }

    if (merge) {
        state.coordsDatabase = { ...state.coordsDatabase, ...db };
    } else {
        state.coordsDatabase = db;
    }
    // If we have an active image, immediately try to load its coords.
    loadCurrentFromDatabase();
}

export function generateCurrentIniFileContent() {
    // Generate INI content for JUST the current file (used for ZIP export)
    saveCurrentToDatabase(false);
    
    const key = getCurrentFileKey();
    if (!key) return "";
    
    const record = state.coordsDatabase[key];
    if (!record) return "";

    let ini = `[${key}]\n`;
    ini += `mode=${record.editMode || 'freeform'}\n`;
    ini += `dpi=${record.dpi || 300}\n`;

    if (record.editMode === 'freeform' && record.cards && record.cards.length > 0) {
        const cardStrings = record.cards.map(card => {
            return card.map(pt => `${pt.x},${pt.y}`).join(';');
        });
        ini += `cards=${cardStrings.join(' | ')}\n`;
    } else if (record.editMode === 'rect' && record.rectCards && record.rectCards.length > 0) {
        ini += `rectWidth=${record.rectWidth}\n`;
        ini += `rectHeight=${record.rectHeight}\n`;
        ini += `rectSkew=${record.rectSkew || 0}\n`;
        
        const cardStrings = record.rectCards.map(card => {
            return `${card.x},${card.y},${card.angle || 0}`;
        });
        ini += `cards=${cardStrings.join(' | ')}\n`;
    }
    
    return ini;
}
