import { dom } from './dom.js';
import { state } from './state.js';
import { handleFileUpload } from './file-loader.js';
import { applyFilter } from './filter.js';
import { injectPngDpi } from '../grid/png-modifier.js';

export function bindEvents() {
    dom.fileInput.addEventListener('change', handleFileUpload);
    
    import('./tune.js').then(module => {
        module.initTuneModal();
    });
    
    dom.processBtn.addEventListener('click', applyFilter);
    
    dom.undoBtn.addEventListener('click', () => {
        if (state.historyIndex > 0) {
            state.historyIndex--;
            const imgData = state.history[state.historyIndex];
            dom.resultCtx.putImageData(imgData, 0, 0);
            if (!dom.compareCheckbox.checked) {
                dom.ctx.clearRect(0, 0, dom.canvas.width, dom.canvas.height);
                dom.ctx.drawImage(dom.resultCanvas, 0, 0);
            }
            import('./ui.js').then(m => m.updateButtonStates());
        }
    });
    
    dom.filterMethod.addEventListener('change', (e) => {
        e.currentTarget.closest('[data-method]').dataset.method = e.target.value;
    });
    
    dom.compareCheckbox.addEventListener('change', (e) => {
        if (!state.isImageLoaded) return;
        dom.ctx.clearRect(0, 0, dom.canvas.width, dom.canvas.height);
        if (e.target.checked) {
            dom.ctx.drawImage(dom.sourceCanvas, 0, 0);
        } else {
            dom.ctx.drawImage(dom.resultCanvas, 0, 0);
        }
    });

    // Provide a mousedown/mouseup quick compare (only if checkbox is inside a <label>)
    const compareLabel = dom.compareCheckbox.closest('label');
    if (compareLabel) {
        compareLabel.addEventListener('mousedown', () => {
            if (!dom.compareCheckbox.checked) {
                dom.ctx.clearRect(0, 0, dom.canvas.width, dom.canvas.height);
                dom.ctx.drawImage(dom.sourceCanvas, 0, 0);
            }
        });
        compareLabel.addEventListener('mouseup', () => {
            if (!dom.compareCheckbox.checked) {
                dom.ctx.clearRect(0, 0, dom.canvas.width, dom.canvas.height);
                dom.ctx.drawImage(dom.resultCanvas, 0, 0);
            }
        });
        compareLabel.addEventListener('mouseleave', () => {
            if (!dom.compareCheckbox.checked && state.isImageLoaded) {
                dom.ctx.clearRect(0, 0, dom.canvas.width, dom.canvas.height);
                dom.ctx.drawImage(dom.resultCanvas, 0, 0);
            }
        });
    }

    dom.downloadBtn.addEventListener('click', async () => {
        if (!state.isImageLoaded) return;
        
        const dpi = parseFloat(dom.dpiInput.value) || 300;
        let blob = await new Promise(resolve => dom.resultCanvas.toBlob(resolve, 'image/png'));
        blob = await injectPngDpi(blob, dpi);
        
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = state.originalFileName + '_descreened.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    });

    const cvCheck = setInterval(() => {
        if (window.openCvReady === true) {
            state.isCvReady = true;
            if (dom.opencvStatus) {
                dom.opencvStatus.style.display = "none";
            }
            import('./ui.js').then(module => module.updateButtonStates());
            clearInterval(cvCheck);
        }
    }, 500);
}
