import { initDom } from './dom.js';
import { state } from './state.js';
import { bindEvents } from './events.js';
import { updateButtonStates } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize DOM elements
    initDom();

    // 2. Bind Events
    bindEvents();

    // 3. Setup OpenCV ready state
    state.isCvReady = window.openCvReady === true;
    updateButtonStates();

    document.addEventListener('opencv-ready', () => {
        state.isCvReady = true;
        updateButtonStates();
    });
});
