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
