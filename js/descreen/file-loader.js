import { dom } from './dom.js';
import { state } from './state.js';
import { updateButtonStates } from './ui.js';

export function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    state.originalFileName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;

    const reader = new FileReader();
    reader.onload = (e) => {
        const image = new Image();
        image.onload = () => {
            dom.sourceCanvas.width = image.width;
            dom.sourceCanvas.height = image.height;
            dom.sourceCtx.drawImage(image, 0, 0);

            dom.resultCanvas.width = image.width;
            dom.resultCanvas.height = image.height;
            dom.resultCtx.drawImage(image, 0, 0);

            dom.canvas.width = image.width;
            dom.canvas.height = image.height;
            dom.ctx.drawImage(image, 0, 0);

            state.isImageLoaded = true;
            updateButtonStates();
        };
        image.src = e.target.result;
    };
    reader.readAsDataURL(file);
}
