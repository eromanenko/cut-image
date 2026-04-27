import { dom } from './dom.js';
import { state } from './state.js';

export function updateButtonStates() {
    dom.processBtn.disabled = !state.isImageLoaded || !state.isCvReady || state.isProcessing;
    dom.downloadBtn.disabled = !state.isImageLoaded || state.isProcessing;
    dom.undoBtn.disabled = !state.isImageLoaded || state.isProcessing || state.historyIndex <= 0;
    dom.tuneBtn.disabled = !state.isImageLoaded || !state.isCvReady || state.isProcessing;
    
    if (state.isCvReady && dom.opencvStatus) {
        dom.opencvStatus.style.display = "none";
    }
}
