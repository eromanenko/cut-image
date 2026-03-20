import { initDom } from './dom.js';
import { bindEvents } from './events.js';

document.addEventListener('DOMContentLoaded', () => {
    initDom();
    bindEvents();
});
