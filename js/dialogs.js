export function createDialogsContainer() {
    let container = document.getElementById('custom-dialogs-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'custom-dialogs-container';
        document.body.appendChild(container);
    }
    return container;
}

export function showAlert(message) {
    return new Promise((resolve) => {
        const container = createDialogsContainer();
        
        const modal = document.createElement('div');
        modal.className = 'ce-modal';
        modal.style.display = 'flex';
        modal.style.zIndex = '10001';
        
        modal.innerHTML = `
            <div class="ce-modal-content" style="max-width: 400px; width: 90%;">
                <div class="ce-modal-header">
                    <h3>Alert</h3>
                    <span class="ce-modal-close">&times;</span>
                </div>
                <div class="ce-modal-body" style="text-align: left; word-break: break-word;">
                    <p>${message.replace(/\n/g, '<br>')}</p>
                </div>
                <div class="ce-modal-footer">
                    <button class="btn-primary">OK</button>
                </div>
            </div>
        `;
        
        container.appendChild(modal);
        
        const closeBtn = modal.querySelector('.ce-modal-close');
        const okBtn = modal.querySelector('.btn-primary');
        
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' || e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                cleanup();
            }
        };
        document.addEventListener('keydown', handleKeyDown);

        const cleanup = () => {
            document.removeEventListener('keydown', handleKeyDown);
            modal.remove();
            resolve();
        };
        
        closeBtn.addEventListener('click', cleanup);
        okBtn.addEventListener('click', cleanup);
        
        // Focus OK button for accessibility
        setTimeout(() => okBtn.focus(), 10);
    });
}

export function showConfirm(message) {
    return new Promise((resolve) => {
        const container = createDialogsContainer();
        
        const modal = document.createElement('div');
        modal.className = 'ce-modal';
        modal.style.display = 'flex';
        modal.style.zIndex = '10001';
        
        modal.innerHTML = `
            <div class="ce-modal-content" style="max-width: 450px; width: 90%;">
                <div class="ce-modal-header">
                    <h3>Confirm</h3>
                    <span class="ce-modal-close">&times;</span>
                </div>
                <div class="ce-modal-body" style="text-align: left; word-break: break-word;">
                    <p>${message.replace(/\n/g, '<br>')}</p>
                </div>
                <div class="ce-modal-footer">
                    <button class="btn-secondary">Cancel</button>
                    <button class="btn-primary">OK</button>
                </div>
            </div>
        `;
        
        container.appendChild(modal);
        
        const closeBtn = modal.querySelector('.ce-modal-close');
        const cancelBtn = modal.querySelector('.btn-secondary');
        const okBtn = modal.querySelector('.btn-primary');
        
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                handleCancel();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                handleOk();
            }
        };
        document.addEventListener('keydown', handleKeyDown);

        const handleCancel = () => {
            document.removeEventListener('keydown', handleKeyDown);
            modal.remove();
            resolve(false);
        };
        
        const handleOk = () => {
            document.removeEventListener('keydown', handleKeyDown);
            modal.remove();
            resolve(true);
        };
        
        closeBtn.addEventListener('click', handleCancel);
        cancelBtn.addEventListener('click', handleCancel);
        okBtn.addEventListener('click', handleOk);
        
        // Focus OK button for accessibility
        setTimeout(() => okBtn.focus(), 10);
    });
}

export function showToast(message) {
    const container = createDialogsContainer();
    let toast = document.getElementById('ce-toast-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'ce-toast-notification';
        toast.className = 'ce-toast';
        container.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    
    const audio = new Audio('assets/notification.mp3');
    audio.play().catch(e => console.warn('Could not play notification sound:', e));
    
    // Clear existing timeout
    if (toast.hideTimeout) clearTimeout(toast.hideTimeout);
    
    toast.hideTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

export function showCardCountDialog(sourceCanvas) {
    return new Promise((resolve) => {
        const container = createDialogsContainer();
        
        const modal = document.createElement('div');
        modal.className = 'ce-modal';
        modal.style.display = 'flex';
        modal.style.zIndex = '10001';
        
        let gridHtml = '';
        for (let i = 1; i <= 16; i++) {
            const tooltip = i <= 9 ? ` title="Hotkey: ${i}"` : '';
            gridHtml += `<button class="btn-secondary count-btn" data-count="${i}"${tooltip}>${i}</button>`;
        }
        gridHtml += `<button class="btn-primary count-btn" data-count="null" style="grid-column: span 4;" title="Hotkey: 0">Auto</button>`;
        
        let thumbHtml = '';
        if (sourceCanvas) {
            thumbHtml = `<div style="text-align:center; margin-bottom: 10px;"><canvas id="cc-thumb-canvas" style="display: block; margin: 0 auto; max-width:100%; max-height:150px; border:1px solid var(--border); border-radius:4px;"></canvas></div>`;
        }

        modal.innerHTML = `
            <div class="ce-modal-content" style="max-width: 320px; width: 90%;">
                <div class="ce-modal-header">
                    <h3>Expected Cards</h3>
                    <span class="ce-modal-close">&times;</span>
                </div>
                <div class="ce-modal-body">
                    ${thumbHtml}
                    <p style="text-align: center; margin:0 0 10px 0; font-size:13px; color:var(--text-subtle);">Select how many cards are on this scan:</p>
                    <div class="ce-count-grid">
                        ${gridHtml}
                    </div>
                </div>
            </div>
        `;
        
        container.appendChild(modal);

        if (sourceCanvas) {
            const thumbCanvas = modal.querySelector('#cc-thumb-canvas');
            if (thumbCanvas) {
                const scale = Math.min(300 / sourceCanvas.width, 150 / sourceCanvas.height);
                thumbCanvas.width = sourceCanvas.width * scale;
                thumbCanvas.height = sourceCanvas.height * scale;
                const ctx = thumbCanvas.getContext('2d');
                ctx.drawImage(sourceCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
            }
        }
        
        const closeBtn = modal.querySelector('.ce-modal-close');
        
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                cleanup(undefined);
            }
        };
        document.addEventListener('keydown', handleKeyDown);

        const cleanup = (value) => {
            document.removeEventListener('keydown', handleKeyDown);
            modal.remove();
            resolve(value);
        };
        
        closeBtn.addEventListener('click', () => cleanup(undefined));
        
        modal.querySelectorAll('.count-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const val = e.target.getAttribute('data-count');
                cleanup(val === 'null' ? null : parseInt(val, 10));
            });
        });
    });
}
