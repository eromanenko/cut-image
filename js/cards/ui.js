import { dom } from './dom.js';
import { state } from './state.js';
import { redraw } from './renderer.js';
import { showAlert, showConfirm } from '../dialogs.js';

export function updateButtonStates() {
    const isRect = state.editMode === 'rect';

    dom.processButton.disabled = !(state.isCvReady && state.isImageLoaded);
    dom.addManualButton.disabled = !state.isImageLoaded;
    
    if (dom.saveCoordsButton) {
        dom.saveCoordsButton.disabled = Object.keys(state.coordsDatabase || {}).length === 0 && !state.isImageLoaded;
    }

    if (dom.viewCoordsCount) {
        let fileCount = 0;
        if (state.coordsDatabase) {
            for (const [key, record] of Object.entries(state.coordsDatabase)) {
                let count = 0;
                if (record.editMode === 'freeform') {
                    count = record.cards ? record.cards.length : 0;
                } else {
                    count = record.rectCards ? record.rectCards.length : 0;
                }
                if (count > 0) fileCount++;
            }
        }
        dom.viewCoordsCount.textContent = fileCount.toString();
    }

    if (isRect) {
        const total = state.rectCards.length;
        const current = state.selectedRectCardIndex + 1;
        dom.deleteButton.disabled = state.selectedRectCardIndex === -1;
        dom.deleteButton.textContent = (total > 0 && current > 0) 
            ? `Unselect ${current}/${total}` 
            : 'Unselect';

        dom.downloadButton.disabled = state.rectCards.length === 0;
        dom.downloadButton.textContent = state.rectCards.length > 0
            ? `Download ${state.rectCards.length} card${state.rectCards.length !== 1 ? 's' : ''}`
            : 'Download';
        const getSizeBtns = document.querySelectorAll('.ceGetSizeBtn');
        getSizeBtns.forEach(btn => btn.disabled = true);
    } else {
        const total = state.detectedCards.length;
        let current = 0;
        if (state.selectedPoint) {
            current = state.detectedCards.findIndex(c => c.includes(state.selectedPoint)) + 1;
        }
        dom.deleteButton.disabled = (state.selectedPoint === null);
        dom.deleteButton.textContent = (total > 0 && current > 0) 
            ? `Unselect ${current}/${total}` 
            : 'Unselect';

        dom.downloadButton.disabled = state.detectedCards.length === 0;
        dom.downloadButton.textContent = state.detectedCards.length > 0
            ? `Download ${state.detectedCards.length} card${state.detectedCards.length !== 1 ? 's' : ''}`
            : 'Download';
        const getSizeBtns = document.querySelectorAll('.ceGetSizeBtn');
        const disableGetSize = state.detectedCards.length === 0;
        getSizeBtns.forEach(btn => btn.disabled = disableGetSize);
    }
}

export function applyModeUI(mode) {
    const isRect = mode === 'rect';

    // Toggle button active classes
    dom.freeformModeBtn.classList.toggle('active', !isRect);
    dom.rectModeBtn.classList.toggle('active', isRect);

    // Show/hide toolbar rows
    if (dom.freeformStylingRow)    dom.freeformStylingRow.style.display    = isRect ? 'none' : '';
    if (dom.freeformDimensionsRow) dom.freeformDimensionsRow.style.display = isRect ? 'none' : '';
    if (dom.rectControls)          dom.rectControls.style.display          = isRect ? ''     : 'none';

    // Swap instruction text
    if (dom.instrFreeform) dom.instrFreeform.style.display = isRect ? 'none' : '';
    if (dom.instrRect)     dom.instrRect.style.display     = isRect ? ''     : 'none';
}

export function pulseViewCoordsButton() {
    if (dom.viewCoordsButton) {
        dom.viewCoordsButton.classList.remove('highlight-pulse');
        void dom.viewCoordsButton.offsetWidth; // Trigger reflow
        dom.viewCoordsButton.classList.add('highlight-pulse');
        
        setTimeout(() => {
            if (dom.viewCoordsButton) {
                dom.viewCoordsButton.classList.remove('highlight-pulse');
            }
        }, 1000);
    }
}

export function scrollToCorner(point, cornerIndex) {
    if (!point) return;
    const rect = dom.canvas.getBoundingClientRect();
    const scaleX = rect.width / dom.canvas.width;
    const scaleY = rect.height / dom.canvas.height;

    const vpX = rect.left + point.x * scaleX;
    const vpY = rect.top + point.y * scaleY;

    const stickyEl = dom.canvas.closest('.tab-content')?.querySelector('.sticky-controls');
    const stickyH = stickyEl ? stickyEl.getBoundingClientRect().height : 0;

    const pad = 20;
    let targetX = window.scrollX;
    let targetY = window.scrollY;

    switch (cornerIndex) {
        case 0:
            targetX += vpX - pad;
            targetY += vpY - (stickyH + pad);
            break;
        case 1:
            targetX += vpX - (window.innerWidth - pad);
            targetY += vpY - (stickyH + pad);
            break;
        case 2:
            targetX += vpX - (window.innerWidth - pad);
            targetY += vpY - (window.innerHeight - pad);
            break;
        case 3:
            targetX += vpX - pad;
            targetY += vpY - (window.innerHeight - pad);
            break;
    }

    window.scrollTo({ left: targetX, top: targetY, behavior: 'smooth' });
}

/**
 * Scroll the viewport so the center of a rect-mode card is visible.
 */
export function scrollToRectCard(card, corners) {
    if (!corners) return;
    const cx = corners.reduce((s, p) => s + p.x, 0) / 4;
    const cy = corners.reduce((s, p) => s + p.y, 0) / 4;
    const rect = dom.canvas.getBoundingClientRect();
    const scaleX = rect.width / dom.canvas.width;
    const scaleY = rect.height / dom.canvas.height;
    const vpX = rect.left + cx * scaleX;
    const vpY = rect.top  + cy * scaleY;
    const stickyEl = dom.canvas.closest('.tab-content')?.querySelector('.sticky-controls');
    const stickyH = stickyEl ? stickyEl.getBoundingClientRect().height : 0;
    window.scrollTo({
        left: window.scrollX + vpX - window.innerWidth  / 2,
        top:  window.scrollY + vpY - (stickyH + (window.innerHeight - stickyH) / 2),
        behavior: 'smooth',
    });
}

let lastIniStatsState = null;
let iniStatsKeydownHandler = null;

export async function showIniStatsModal(db) {
    if (!db || Object.keys(db).length === 0) {
        await showAlert("No layouts found in the selected file.");
        return;
    }

    dom.iniStatsList.innerHTML = '';
    
    let hasEntries = false;
    let fileCount = 0;
    for (const [key, record] of Object.entries(db)) {
        let count = 0;
        let iconSvg = '';
        let modeTitle = '';
        
        if (record.editMode === 'freeform') {
            count = record.cards ? record.cards.length : 0;
            modeTitle = 'Free form';
            iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 16px; height: 16px;">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>`;
        } else {
            count = record.rectCards ? record.rectCards.length : 0;
            modeTitle = 'Rectangular form';
            iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 16px; height: 16px;">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            </svg>`;
        }
        
        if (count > 0) {
            hasEntries = true;
            fileCount++;
            const li = document.createElement('li');
            li.style.padding = '8px 0';
            li.style.borderBottom = '1px solid #eee';
            li.style.display = 'flex';
            li.style.alignItems = 'center';
            
            const iconSpan = document.createElement('span');
            iconSpan.innerHTML = iconSvg;
            iconSpan.title = modeTitle;
            iconSpan.style.marginRight = '8px';
            iconSpan.style.display = 'inline-flex';
            iconSpan.style.alignItems = 'center';
            iconSpan.style.color = '#555';
            
            const nameSpan = document.createElement('span');
            nameSpan.style.fontWeight = 'bold';
            nameSpan.style.wordBreak = 'break-word';
            nameSpan.style.flexGrow = '1';
            nameSpan.textContent = key;
            
            const countSpan = document.createElement('span');
            countSpan.style.color = '#555';
            countSpan.style.marginLeft = '15px';
            countSpan.style.whiteSpace = 'nowrap';
            countSpan.textContent = `${count} card${count !== 1 ? 's' : ''}`;
            
            li.style.cursor = 'pointer';
            li.title = "Click to apply this layout to the current image";
            li.onmouseover = () => li.style.backgroundColor = '#f0f0f0';
            li.onmouseout = () => li.style.backgroundColor = 'transparent';

            li.addEventListener('click', async (e) => {
                if (e.target.closest('.delete-record-btn')) return;
                
                if (!state.isImageLoaded) return;
                
                const currentDpi = parseInt(dom.dpiInput.value) || 300;
                const recordDpi = record.dpi || 300;
                
                if (currentDpi !== recordDpi) {
                    const proceed = await showConfirm(`Warning: The loaded layout was saved with ${recordDpi} DPI, but the current image is set to ${currentDpi} DPI. The coordinates might not match exactly. Continue?`);
                    if (!proceed) {
                        return;
                    }
                }
                
                const totalCards = state.editMode === 'freeform' ? state.detectedCards.length : state.rectCards.length;
                if (totalCards > 0) {
                    const replace = await showConfirm(`You already have ${totalCards} card${totalCards !== 1 ? 's' : ''} on the current image. Loading this layout will replace them. Continue?`);
                    if (!replace) {
                        return;
                    }
                }
                
                state.editMode = record.editMode || 'freeform';
                if (record.dpi && dom.dpiInput) dom.dpiInput.value = record.dpi;
                
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
                
                if (dom.freeformModeBtn && dom.rectModeBtn) {
                    applyModeUI(state.editMode);
                }
                if (state.editMode === 'rect') {
                    if (dom.rectWidthPx) dom.rectWidthPx.value = state.rectWidth;
                    if (dom.rectHeightPx) dom.rectHeightPx.value = state.rectHeight;
                    if (dom.rectSkewPx) dom.rectSkewPx.value = state.rectSkew;
                }
                
                state.hasUnsavedChanges = true;
                state.selectedPoint = null;
                state.hoveredPoint = null;
                state.selectedRectCardIndex = -1;
                state.hoveredRectCardIndex = -1;
                
                updateButtonStates();
                redraw();
                
                dom.iniStatsModal.style.display = 'none';
                pulseViewCoordsButton();
                dom.canvas.focus({ preventScroll: true });
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-record-btn';
            deleteBtn.style.marginLeft = '15px';
            deleteBtn.style.background = 'none';
            deleteBtn.style.border = 'none';
            deleteBtn.style.color = '#dc3545';
            deleteBtn.style.cursor = 'pointer';
            deleteBtn.style.padding = '4px 8px';
            deleteBtn.innerHTML = '&#x2715;'; // HTML entity for multiplication X
            deleteBtn.title = "Delete layout";
            
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const proceed = await showConfirm(`Are you sure you want to delete the layout for '${key}'?`);
                if (proceed) {
                    delete db[key];
                    state.hasUnsavedChanges = true;
                    await showIniStatsModal(db);
                }
            });

            li.appendChild(iconSpan);
            li.appendChild(nameSpan);
            li.appendChild(countSpan);
            li.appendChild(deleteBtn);
            dom.iniStatsList.appendChild(li);
        }
    }

    const titleEl = document.getElementById("ceIniStatsTitle");
    if (titleEl) {
        if (fileCount > 0) {
            titleEl.textContent = `Cuts found for the following ${fileCount} file${fileCount !== 1 ? 's' : ''}:`;
        } else {
            titleEl.textContent = `Cuts found for the following files:`;
        }
    }

    if (!hasEntries) {
        const li = document.createElement('li');
        li.style.padding = '8px 0';
        li.style.color = '#888';
        li.textContent = 'No cards found in the selected file.';
        dom.iniStatsList.appendChild(li);
    }

    dom.iniStatsModal.style.display = 'flex';
    
    if (iniStatsKeydownHandler) {
        document.removeEventListener('keydown', iniStatsKeydownHandler);
    }
    iniStatsKeydownHandler = (e) => {
        // Avoid intercepting if a top-level alert/confirm is shown
        if (document.querySelector('#custom-dialogs-container .ce-modal')) return;

        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            if (dom.iniStatsCancelX) dom.iniStatsCancelX.click();
            document.removeEventListener('keydown', iniStatsKeydownHandler);
            iniStatsKeydownHandler = null;
        } else if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            if (dom.iniStatsOkBtn) dom.iniStatsOkBtn.click();
            document.removeEventListener('keydown', iniStatsKeydownHandler);
            iniStatsKeydownHandler = null;
        }
    };
    document.addEventListener('keydown', iniStatsKeydownHandler);
}
