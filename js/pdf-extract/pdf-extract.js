// PDF Image Extractor module
// Extracts embedded raster images from PDF files using pdf.js

const dom = {};
let extractedImages = []; // { blob, width, height, page, index, objectUrl }

function initDom() {
    dom.fileInput = document.getElementById('peFileInput');
    dom.prefixInput = document.getElementById('pePrefixInput');
    dom.selectAllBtn = document.getElementById('peSelectAllBtn');
    dom.unselectAllBtn = document.getElementById('peUnselectAllBtn');
    dom.downloadBtn = document.getElementById('peDownloadBtn');
    dom.dropzone = document.getElementById('peDropzone');
    dom.gallery = document.getElementById('peGallery');
    dom.galleryContainer = document.getElementById('peGalleryContainer');
    dom.loading = document.getElementById('peLoading');
    dom.fileName = document.getElementById('peFileName');
    dom.statusText = document.getElementById('peStatusText');
}

function bindEvents() {
    // File input
    dom.fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handlePdfFile(file);
        e.target.value = '';
    });

    // Drag and drop on the dropzone
    dom.dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dom.dropzone.classList.add('drag-over');
    });
    dom.dropzone.addEventListener('dragleave', () => {
        dom.dropzone.classList.remove('drag-over');
    });
    dom.dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dom.dropzone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file && file.type === 'application/pdf') {
            handlePdfFile(file);
        }
    });

    // Click on dropzone opens file dialog
    dom.dropzone.addEventListener('click', () => {
        dom.fileInput.click();
    });

    // Selection buttons
    dom.selectAllBtn.addEventListener('click', () => setAllChecked(true));
    dom.unselectAllBtn.addEventListener('click', () => setAllChecked(false));

    // Download
    dom.downloadBtn.addEventListener('click', downloadSelected);
}

// ── PDF Processing ──────────────────────────────────────────────────────────

async function handlePdfFile(file) {
    // Show loading, hide dropzone and gallery
    dom.dropzone.style.display = 'none';
    dom.galleryContainer.style.display = 'none';
    dom.loading.style.display = 'block';
    dom.selectAllBtn.disabled = true;
    dom.unselectAllBtn.disabled = true;
    dom.downloadBtn.disabled = true;

    // Set prefix to filename without extension
    const baseName = file.name.replace(/\.[^.]+$/, '');
    dom.prefixInput.value = baseName + '_';

    // Cleanup previous
    cleanup();

    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const totalPages = pdf.numPages;

        for (let p = 1; p <= totalPages; p++) {
            const page = await pdf.getPage(p);
            await extractImagesFromPage(page, p);
            page.cleanup();
        }

        if (extractedImages.length === 0) {
            dom.loading.style.display = 'none';
            dom.dropzone.style.display = 'flex';
            // Show a message in dropzone
            const content = dom.dropzone.querySelector('.pe-dropzone-content p');
            if (content) {
                content.textContent = 'No embedded images found in this PDF. Try another file.';
            }
            return;
        }

        renderGallery(file.name);
    } catch (err) {
        console.error('Error processing PDF:', err);
        dom.loading.style.display = 'none';
        dom.dropzone.style.display = 'flex';
        const content = dom.dropzone.querySelector('.pe-dropzone-content p');
        if (content) {
            content.textContent = 'Error reading PDF file. Please try another file.';
        }
    }
}

async function extractImagesFromPage(page, pageNum) {
    // Force pdf.js to fully process the page by rendering it off-screen.
    // This ensures all image objects are decoded and available via page.objs.
    const viewport = page.getViewport({ scale: 0.1 }); // tiny render just to trigger decoding
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = viewport.width;
    tmpCanvas.height = viewport.height;
    const tmpCtx = tmpCanvas.getContext('2d');
    try {
        await page.render({ canvasContext: tmpCtx, viewport }).promise;
    } catch (e) {
        console.warn(`Render failed for page ${pageNum}, trying extraction anyway`, e);
    }

    const opList = await page.getOperatorList();
    const seenNames = new Set(); // avoid duplicates

    for (let i = 0; i < opList.fnArray.length; i++) {
        const fn = opList.fnArray[i];
        const args = opList.argsArray[i];

        // Named image XObjects
        if (fn === pdfjsLib.OPS.paintImageXObject || fn === pdfjsLib.OPS.paintJpegImageXObject) {
            const imgName = args[0];
            if (seenNames.has(imgName)) continue;
            seenNames.add(imgName);

            const imgData = await getImageObj(page, imgName);
            if (!imgData) continue;

            await pushExtractedImage(imgData, pageNum);
        }

        // Inline images (data embedded directly in content stream)
        if (fn === pdfjsLib.OPS.paintInlineImageXObject || fn === pdfjsLib.OPS.paintInlineImageXObjectGroup) {
            const imgData = args[0];
            if (!imgData || !imgData.width || !imgData.height) continue;
            await pushExtractedImage(imgData, pageNum);
        }
    }
}

/**
 * Retrieve an image object from page.objs (or commonObjs) with a timeout.
 */
function getImageObj(page, name) {
    return new Promise((resolve) => {
        let resolved = false;
        const timer = setTimeout(() => {
            if (!resolved) { resolved = true; resolve(null); }
        }, 3000);

        const tryGet = (store) => {
            try {
                store.get(name, (data) => {
                    if (!resolved && data) {
                        resolved = true;
                        clearTimeout(timer);
                        resolve(data);
                    }
                });
            } catch (e) { /* ignore */ }
        };

        tryGet(page.objs);
        tryGet(page.commonObjs);
    });
}

/**
 * Convert imgData to blob and push to extractedImages if valid.
 * Skips mask-like images (uniform gray rectangles).
 */
async function pushExtractedImage(imgData, pageNum) {
    const w = imgData.width || (imgData.bitmap ? imgData.bitmap.width : 0);
    const h = imgData.height || (imgData.bitmap ? imgData.bitmap.height : 0);
    if (w < 20 || h < 20) return;

    const blob = await imageDataToBlob(imgData);
    if (!blob) return;

    // Check if the image is a mask (uniform single-color image)
    if (await isUniformImage(blob)) return;

    const imgIndex = extractedImages.filter(img => img.page === pageNum).length + 1;
    const objectUrl = URL.createObjectURL(blob);

    extractedImages.push({
        blob,
        width: w,
        height: h,
        page: pageNum,
        index: imgIndex,
        objectUrl,
        selected: true
    });
}

/**
 * Detect mask/alpha images by sampling pixels and checking variance.
 * Returns true if the image appears to be a uniform single-color rectangle.
 */
async function isUniformImage(blob) {
    try {
        const bmp = await createImageBitmap(blob);
        const sampleSize = 8;
        const canvas = document.createElement('canvas');
        canvas.width = sampleSize;
        canvas.height = sampleSize;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bmp, 0, 0, sampleSize, sampleSize);
        bmp.close();

        const data = ctx.getImageData(0, 0, sampleSize, sampleSize).data;

        // Calculate variance across all sampled pixels
        let sumR = 0, sumG = 0, sumB = 0;
        const n = sampleSize * sampleSize;
        for (let i = 0; i < data.length; i += 4) {
            sumR += data[i];
            sumG += data[i + 1];
            sumB += data[i + 2];
        }
        const avgR = sumR / n, avgG = sumG / n, avgB = sumB / n;

        let variance = 0;
        for (let i = 0; i < data.length; i += 4) {
            variance += (data[i] - avgR) ** 2;
            variance += (data[i + 1] - avgG) ** 2;
            variance += (data[i + 2] - avgB) ** 2;
        }
        variance /= (n * 3);

        // Very low variance = uniform color = likely a mask
        return variance < 50;
    } catch (e) {
        return false;
    }
}

async function imageDataToBlob(imgData) {
    try {
        // If it has a .bitmap (ImageBitmap) — modern pdf.js behavior
        if (imgData.bitmap && imgData.bitmap instanceof ImageBitmap) {
            const canvas = document.createElement('canvas');
            canvas.width = imgData.bitmap.width;
            canvas.height = imgData.bitmap.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(imgData.bitmap, 0, 0);
            return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        }

        // If it's an HTMLImageElement (JPEG images from pdf.js)
        if (imgData instanceof HTMLImageElement) {
            const canvas = document.createElement('canvas');
            canvas.width = imgData.naturalWidth || imgData.width;
            canvas.height = imgData.naturalHeight || imgData.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(imgData, 0, 0);
            return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        }

        // If it has .data (raw pixel data from pdf.js)
        if (imgData.data && imgData.width && imgData.height) {
            const canvas = document.createElement('canvas');
            canvas.width = imgData.width;
            canvas.height = imgData.height;
            const ctx = canvas.getContext('2d');

            let rgbaData;
            if (imgData.data.length === imgData.width * imgData.height * 4) {
                // Already RGBA
                rgbaData = imgData.data;
            } else if (imgData.data.length === imgData.width * imgData.height * 3) {
                // RGB → RGBA
                rgbaData = new Uint8ClampedArray(imgData.width * imgData.height * 4);
                for (let j = 0, k = 0; j < imgData.data.length; j += 3, k += 4) {
                    rgbaData[k] = imgData.data[j];
                    rgbaData[k + 1] = imgData.data[j + 1];
                    rgbaData[k + 2] = imgData.data[j + 2];
                    rgbaData[k + 3] = 255;
                }
            } else if (imgData.data.length === imgData.width * imgData.height) {
                // Grayscale → RGBA
                rgbaData = new Uint8ClampedArray(imgData.width * imgData.height * 4);
                for (let j = 0, k = 0; j < imgData.data.length; j++, k += 4) {
                    rgbaData[k] = imgData.data[j];
                    rgbaData[k + 1] = imgData.data[j];
                    rgbaData[k + 2] = imgData.data[j];
                    rgbaData[k + 3] = 255;
                }
            } else {
                console.warn('Unexpected data length:', imgData.data.length, 'for', imgData.width, 'x', imgData.height);
                return null;
            }

            const imageData = new ImageData(rgbaData, imgData.width, imgData.height);
            ctx.putImageData(imageData, 0, 0);
            return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        }

        // If it has .src (a data URL or blob URL from pdf.js for JPEG)
        if (imgData.src) {
            const img = new Image();
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = imgData.src;
            });
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        }

        console.warn('Unknown image data format:', imgData);
        return null;
    } catch (e) {
        console.warn('Error converting image data to blob:', e);
        return null;
    }
}

// ── Gallery ─────────────────────────────────────────────────────────────────

function renderGallery(fileName) {
    dom.loading.style.display = 'none';
    dom.galleryContainer.style.display = 'block';
    dom.gallery.innerHTML = '';

    dom.fileName.textContent = fileName;
    updateStatus();

    extractedImages.forEach((img, idx) => {
        const item = document.createElement('div');
        item.className = 'pe-gallery-item selected';
        item.dataset.index = idx;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'pe-checkbox';
        checkbox.checked = true;
        checkbox.addEventListener('change', (e) => {
            e.stopPropagation();
            img.selected = checkbox.checked;
            item.classList.toggle('selected', checkbox.checked);
            updateStatus();
        });

        const thumb = document.createElement('img');
        thumb.className = 'pe-thumb';
        thumb.src = img.objectUrl;
        thumb.alt = `Page ${img.page}, image ${img.index}`;

        const info = document.createElement('div');
        info.className = 'pe-info';
        info.textContent = `p${img.page} #${img.index} — ${img.width}×${img.height}`;

        // Click on item toggles selection
        item.addEventListener('click', (e) => {
            if (e.target === checkbox) return; // checkbox handles itself
            checkbox.checked = !checkbox.checked;
            img.selected = checkbox.checked;
            item.classList.toggle('selected', checkbox.checked);
            updateStatus();
        });

        item.appendChild(checkbox);
        item.appendChild(thumb);
        item.appendChild(info);
        dom.gallery.appendChild(item);
    });

    dom.selectAllBtn.disabled = false;
    dom.unselectAllBtn.disabled = false;
    updateStatus();
}

function updateStatus() {
    const selected = extractedImages.filter(img => img.selected).length;
    const total = extractedImages.length;
    dom.statusText.textContent = `${selected} of ${total} selected`;
    dom.downloadBtn.disabled = selected === 0;
    dom.downloadBtn.textContent = selected > 0
        ? `Download ${selected} image${selected !== 1 ? 's' : ''}`
        : 'Download';
}

function setAllChecked(checked) {
    extractedImages.forEach(img => img.selected = checked);
    dom.gallery.querySelectorAll('.pe-gallery-item').forEach(item => {
        const cb = item.querySelector('.pe-checkbox');
        cb.checked = checked;
        item.classList.toggle('selected', checked);
    });
    updateStatus();
}

// ── Download ────────────────────────────────────────────────────────────────

async function downloadSelected() {
    const selected = extractedImages.filter(img => img.selected);
    if (selected.length === 0) return;

    dom.downloadBtn.disabled = true;
    dom.downloadBtn.textContent = 'Packing ZIP…';

    try {
        const zip = new JSZip();
        const prefix = dom.prefixInput.value || '';

        for (const img of selected) {
            const padPage = String(img.page).padStart(2, '0');
            const padIdx = String(img.index).padStart(2, '0');
            const name = `${prefix}p${padPage}_${padIdx}.png`;
            zip.file(name, img.blob);
        }

        const content = await zip.generateAsync({ type: 'blob' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(content);
        a.download = (dom.prefixInput.value || 'pdf_images') + '.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    } catch (e) {
        console.error('Error creating ZIP:', e);
    }

    updateStatus();
}

// ── Cleanup ─────────────────────────────────────────────────────────────────

function cleanup() {
    extractedImages.forEach(img => {
        if (img.objectUrl) URL.revokeObjectURL(img.objectUrl);
    });
    extractedImages = [];
    if (dom.gallery) dom.gallery.innerHTML = '';
}

// ── Init ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    initDom();
    if (!dom.dropzone) return; // tab not present
    bindEvents();
});
