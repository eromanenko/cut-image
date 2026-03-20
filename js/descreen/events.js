import { dom } from './dom.js';
import { state } from './state.js';
import { handleFileUpload } from './file-loader.js';
import { applyFilter } from './filter.js';

export function bindEvents() {
    dom.fileInput.addEventListener('change', handleFileUpload);
    
    dom.processBtn.addEventListener('click', applyFilter);
    
    dom.filterMethod.addEventListener('change', (e) => {
        dom.bilateralControls.style.display = 'none';
        dom.gaussianControls.style.display = 'none';
        dom.medianControls.style.display = 'none';
        
        if (e.target.value === 'bilateral') dom.bilateralControls.style.display = 'inline-flex';
        else if (e.target.value === 'gaussian') dom.gaussianControls.style.display = 'inline-flex';
        else if (e.target.value === 'median') dom.medianControls.style.display = 'inline-flex';
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

    // Provide a mousedown/mouseup quick compare
    dom.compareCheckbox.closest('label').addEventListener('mousedown', () => {
        if (!dom.compareCheckbox.checked) {
            dom.ctx.clearRect(0, 0, dom.canvas.width, dom.canvas.height);
            dom.ctx.drawImage(dom.sourceCanvas, 0, 0);
        }
    });
    dom.compareCheckbox.closest('label').addEventListener('mouseup', () => {
        if (!dom.compareCheckbox.checked) {
            dom.ctx.clearRect(0, 0, dom.canvas.width, dom.canvas.height);
            dom.ctx.drawImage(dom.resultCanvas, 0, 0);
        }
    });
    dom.compareCheckbox.closest('label').addEventListener('mouseleave', () => {
        if (!dom.compareCheckbox.checked && state.isImageLoaded) {
            dom.ctx.clearRect(0, 0, dom.canvas.width, dom.canvas.height);
            dom.ctx.drawImage(dom.resultCanvas, 0, 0);
        }
    });

    dom.downloadBtn.addEventListener('click', () => {
        if (!state.isImageLoaded) return;
        
        dom.resultCanvas.toBlob(blob => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = state.originalFileName + '_descreened.png';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
        }, 'image/png');
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
