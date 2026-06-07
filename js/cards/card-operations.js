import { state } from './state.js';
import { saveCurrentToDatabase } from './ini-handler.js';
import { updateButtonStates, applyModeUI } from './ui.js';
import { redraw } from './renderer.js';
import { showConfirm } from '../dialogs.js';

export async function deleteSelectedCard() {
    if (!state.selectedPoint) return;
    const index = state.detectedCards.findIndex(card => card.includes(state.selectedPoint));
    if (index !== -1) {
        state.detectedCards.splice(index, 1);
        if (state.detectedCards.length > 0) {
            const nextIndex = Math.min(index, state.detectedCards.length - 1);
            state.selectedPoint = state.detectedCards[nextIndex][0];
        } else {
            state.selectedPoint = null;
        }
        saveCurrentToDatabase();
        updateButtonStates();
        redraw();
    }
}

export async function deleteSelectedRectCard() {
    if (state.selectedRectCardIndex === -1) return;
    state.rectCards.splice(state.selectedRectCardIndex, 1);
    state.selectedRectCardIndex = state.rectCards.length > 0
        ? Math.min(state.selectedRectCardIndex, state.rectCards.length - 1)
        : -1;
    saveCurrentToDatabase();
    updateButtonStates();
    redraw();
}

export function hasCards() {
    return state.detectedCards.length > 0 || state.rectCards.length > 0;
}

export async function switchMode(newMode) {
    if (state.editMode === newMode) return;

    if (hasCards()) {
        const msg = `You have ${state.detectedCards.length + state.rectCards.length} card(s). Switching modes will unselect all of them. Continue?`;
        const proceed = await showConfirm(msg);
        if (!proceed) return;
    }

    state.detectedCards.length = 0;
    state.rectCards.length = 0;
    state.selectedPoint = null;
    state.selectedRectCardIndex = -1;
    state.editMode = newMode;

    saveCurrentToDatabase();
    applyModeUI(newMode);
    updateButtonStates();
    redraw();
}
