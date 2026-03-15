// Card Extractor Logic
(function() {
    // DOM Elements
    const ceFileInput = document.getElementById("ceFileInput");
    const cePrefixInput = document.getElementById("cePrefixInput");
    const ceProcessButton = document.getElementById("ceProcessButton");
    const ceAddManualButton = document.getElementById("ceAddManualButton");
    const ceDeleteButton = document.getElementById("ceDeleteButton");
    const ceDownloadButton = document.getElementById("ceDownloadButton");
    const ceCanvas = document.getElementById("ceCanvas");
    const ceCtx = ceCanvas.getContext("2d");
    
    // PDF DOM
    const cePdfControls = document.getElementById("cePdfControls");
    const cePrevPageBtn = document.getElementById("cePrevPageBtn");
    const ceNextPageBtn = document.getElementById("ceNextPageBtn");
    const cePageIndicator = document.getElementById("cePageIndicator");

    // Styling Controls DOM
    const ceLineColor = document.getElementById("ceLineColor");
    const ceLineOpacity = document.getElementById("ceLineOpacity");
    const ceLineOpacityVal = document.getElementById("ceLineOpacityVal");

    // Application State
    const ceSourceCanvas = document.createElement("canvas");
    const ceSourceCtx = ceSourceCanvas.getContext("2d");
    
    let isImageLoaded = false;
    let originalFileName = "cards_archive";
    let detectedCards = []; // Array of arrays containing 4 points: [{x,y}, {x,y}, ...]
    
    // PDF State
    let isPdf = false;
    let pdfDoc = null;
    let currentPreviewPage = 1;
    const PDF_SCALE = 2; 

    // Interaction State
    let isDraggingPoint = false;
    let draggedPoint = null;
    let selectedPoint = null;
    let hoveredPoint = null;
    let hoveredCard = null;

    let isDraggingCard = false;
    let draggedCard = null;
    let dragStartX = 0;
    let dragStartY = 0;

    let isCvReady = window.openCvReady === true;

    // Enable process button if CV is ready and image is loaded
    function updateButtonStates() {
        ceProcessButton.disabled = !(isCvReady && isImageLoaded);
        ceAddManualButton.disabled = !isImageLoaded;
        ceDeleteButton.disabled = (selectedPoint === null);
        ceDownloadButton.disabled = detectedCards.length === 0;
        ceDownloadButton.textContent = detectedCards.length > 0
            ? `Download ${detectedCards.length} card${detectedCards.length !== 1 ? 's' : ''}`
            : 'Download Cards';
    }

    // Wait for OpenCV ready event
    document.addEventListener('opencv-ready', () => {
        isCvReady = true;
        updateButtonStates();
    });

    // Style listeners
    ceLineColor.addEventListener("input", redraw);
    ceLineOpacity.addEventListener("input", (e) => {
        ceLineOpacityVal.textContent = e.target.value;
        redraw();
    });

    function hexToRgb(hex) {
        let r = parseInt(hex.slice(1, 3), 16);
        let g = parseInt(hex.slice(3, 5), 16);
        let b = parseInt(hex.slice(5, 7), 16);
        return {r, g, b};
    }

    // File upload
    ceFileInput.addEventListener("change", async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        resetState();
        originalFileName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
        cePrefixInput.value = originalFileName + "-";

        if (file.type === "application/pdf") {
            isPdf = true;
            cePdfControls.style.display = "flex";
            
            try {
                const arrayBuffer = await file.arrayBuffer();
                const pdfjsLib = window['pdfjs-dist/build/pdf'];
                pdfDoc = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
                currentPreviewPage = 1;
                await renderPdfPageForPreview(currentPreviewPage);
            } catch (err) {
                console.error("PDF load error:", err);
                alert("Error loading PDF document.");
            }
        } else {
            isPdf = false;
            cePdfControls.style.display = "none";

            const fileBuffer = await file.arrayBuffer();
            
            // Check if file is TIFF
            const isTiff = file.type === 'image/tiff' || file.type === 'image/tif'
                || file.name.toLowerCase().endsWith('.tif')
                || file.name.toLowerCase().endsWith('.tiff');

            if (isTiff && typeof UTIF !== 'undefined') {
                try {
                    const ifds = UTIF.decode(fileBuffer);
                    if (ifds.length === 0) {
                        alert("Could not decode TIFF file.");
                        return;
                    }
                    UTIF.decodeImage(fileBuffer, ifds[0]);
                    const rgba = UTIF.toRGBA8(ifds[0]);
                    const w = ifds[0].width;
                    const h = ifds[0].height;

                    ceSourceCanvas.width = w;
                    ceSourceCanvas.height = h;
                    const imgData = ceSourceCtx.createImageData(w, h);
                    imgData.data.set(new Uint8Array(rgba));
                    ceSourceCtx.putImageData(imgData, 0, 0);

                    ceCanvas.width = w;
                    ceCanvas.height = h;
                    isImageLoaded = true;
                    redraw();
                    updateButtonStates();
                } catch (err) {
                    console.error("TIFF decode error:", err);
                    alert("Error decoding TIFF file: " + err.message);
                }
            } else {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const image = new Image();
                    image.onload = () => {
                        ceSourceCanvas.width = image.width;
                        ceSourceCanvas.height = image.height;
                        ceSourceCtx.drawImage(image, 0, 0);
                        
                        ceCanvas.width = image.width;
                        ceCanvas.height = image.height;
                        isImageLoaded = true;
                        redraw();
                        updateButtonStates();
                    };
                    image.src = e.target.result;
                };
                reader.readAsDataURL(file);
            }
        }
    });

    async function renderPdfPageForPreview(pageNumber) {
        if (!pdfDoc) return;
        try {
            const page = await pdfDoc.getPage(pageNumber);
            const viewport = page.getViewport({ scale: PDF_SCALE });
            
            ceSourceCanvas.width = viewport.width;
            ceSourceCanvas.height = viewport.height;
            
            ceSourceCtx.clearRect(0, 0, ceSourceCanvas.width, ceSourceCanvas.height);
            await page.render({
                canvasContext: ceSourceCtx,
                viewport: viewport
            }).promise;
            
            ceCanvas.width = ceSourceCanvas.width;
            ceCanvas.height = ceSourceCanvas.height;
            
            cePageIndicator.textContent = `Page ${pageNumber} / ${pdfDoc.numPages}`;
            cePrevPageBtn.disabled = pageNumber <= 1;
            ceNextPageBtn.disabled = pageNumber >= pdfDoc.numPages;
            
            isImageLoaded = true;
            detectedCards = []; // clear previous detections on new page
            redraw();
            updateButtonStates();
        } catch (err) {
            console.error("Error rendering PDF page:", err);
        }
    }

    cePrevPageBtn.addEventListener("click", () => {
        if (currentPreviewPage > 1) {
            currentPreviewPage--;
            renderPdfPageForPreview(currentPreviewPage);
        }
    });

    ceNextPageBtn.addEventListener("click", () => {
        if (pdfDoc && currentPreviewPage < pdfDoc.numPages) {
            currentPreviewPage++;
            renderPdfPageForPreview(currentPreviewPage);
        }
    });

    function resetState() {
        detectedCards = [];
        isImageLoaded = false;
        pdfDoc = null;
        isPdf = false;
        
        isDraggingPoint = false;
        draggedPoint = null;
        selectedPoint = null;
        hoveredPoint = null;
        hoveredCard = null;
        
        isDraggingCard = false;
        draggedCard = null;
        dragStartX = 0;
        dragStartY = 0;
        
        updateButtonStates();
    }

    function sortDetectedCards() {
        if (detectedCards.length <= 1) return;
        
        detectedCards.sort((cardA, cardB) => {
            // Calculate centers
            let cyA = cardA.reduce((sum, p) => sum + p.y, 0) / 4;
            let cyB = cardB.reduce((sum, p) => sum + p.y, 0) / 4;
            let cxA = cardA.reduce((sum, p) => sum + p.x, 0) / 4;
            let cxB = cardB.reduce((sum, p) => sum + p.x, 0) / 4;
            
            // Approximate height of cardA
            let hA = Math.max(
                Math.hypot(cardA[3].x - cardA[0].x, cardA[3].y - cardA[0].y),
                Math.hypot(cardA[2].x - cardA[1].x, cardA[2].y - cardA[1].y)
            );
            
            // If difference in Y is less than half the height, they are roughly on the same row
            if (Math.abs(cyA - cyB) < hA * 0.5) {
                return cxA - cxB; // Sort left to right
            }
            return cyA - cyB; // Sort top to bottom
        });
    }

    function redraw() {
        if (!isImageLoaded) return;
        
        ceCtx.drawImage(ceSourceCanvas, 0, 0);
        
        sortDetectedCards();
        
        // Draw detected cards
        for (let i = 0; i < detectedCards.length; i++) {
            const card = detectedCards[i];
            
            // Draw polygon outline
            ceCtx.beginPath();
            ceCtx.moveTo(card[0].x, card[0].y);
            for (let j = 1; j < 4; j++) {
                ceCtx.lineTo(card[j].x, card[j].y);
            }
            ceCtx.closePath();
            
            // Get selected style values
            const colorRgb = hexToRgb(ceLineColor.value);
            const opacity = ceLineOpacity.value;
            
            // Style
            ceCtx.lineWidth = 1.5;
            ceCtx.strokeStyle = `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, ${opacity})`; 
            ceCtx.stroke();
            
            // Fill lightly (using same color but much more transparent than line)
            ceCtx.fillStyle = `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, ${opacity * 0.2})`;
            ceCtx.fill();

            // Draw Corners (Points) — outlined rings so the corner is visible
            for (let j = 0; j < 4; j++) {
                const pt = card[j];
                const radius = 10;
                const crossSize = 4;
                
                let color;
                let lineW;
                if (pt === selectedPoint) {
                    color = "#007bff"; // Blue
                    lineW = 3;
                } else if (pt === hoveredPoint) {
                    color = "orange";
                    lineW = 2.5;
                } else {
                    color = "red";
                    lineW = 2;
                }

                // Outer ring
                ceCtx.beginPath();
                ceCtx.arc(pt.x, pt.y, radius, 0, 2 * Math.PI);
                ceCtx.strokeStyle = color;
                ceCtx.lineWidth = lineW;
                ceCtx.stroke();

                // Crosshair in center
                ceCtx.beginPath();
                ceCtx.moveTo(pt.x - crossSize, pt.y);
                ceCtx.lineTo(pt.x + crossSize, pt.y);
                ceCtx.moveTo(pt.x, pt.y - crossSize);
                ceCtx.lineTo(pt.x, pt.y + crossSize);
                ceCtx.strokeStyle = color;
                ceCtx.lineWidth = 1.5;
                ceCtx.stroke();
            }
            
            // Label
            ceCtx.font = "bold 30px Arial";
            ceCtx.fillStyle = "red";
            ceCtx.fillText((i + 1).toString(), card[0].x + 20, card[0].y + 40);

            // Draw Dimensions for active card
            if (card.includes(selectedPoint) || card.includes(hoveredPoint) || card === draggedCard || card === hoveredCard) {
                ceCtx.font = "bold 14px Arial";
                ceCtx.textAlign = "center";
                ceCtx.textBaseline = "middle";

                let cx = card.reduce((sum, p) => sum + p.x, 0) / 4;
                let cy = card.reduce((sum, p) => sum + p.y, 0) / 4;

                const drawLabel = (ctx, text, x, y, color = "#007bff") => {
                    const metrics = ctx.measureText(text);
                    const width = metrics.width + 12;
                    const height = 24;
                    
                    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
                    if (ctx.roundRect) {
                        ctx.beginPath();
                        ctx.roundRect(x - width/2, y - height/2, width, height, 4);
                        ctx.fill();
                    } else {
                        ctx.fillRect(x - width/2, y - height/2, width, height);
                    }
                    ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
                    ctx.lineWidth = 1;
                    ctx.stroke();

                    ctx.fillStyle = color;
                    ctx.fillText(text, x, y);
                };

                for (let k = 0; k < 4; k++) {
                    const pt = card[k];
                    const ptNext = card[(k + 1) % 4];
                    const ptPrev = card[(k + 3) % 4];
                    
                    // 1. Draw Edge Length
                    const dist = Math.round(Math.hypot(ptNext.x - pt.x, ptNext.y - pt.y));
                    const mx = (pt.x + ptNext.x) / 2;
                    const my = (pt.y + ptNext.y) / 2;
                    drawLabel(ceCtx, `${dist} px`, mx, my);

                    // 2. Draw Angle
                    const v1x = ptPrev.x - pt.x;
                    const v1y = ptPrev.y - pt.y;
                    const v2x = ptNext.x - pt.x;
                    const v2y = ptNext.y - pt.y;
                    
                    const len1 = Math.hypot(v1x, v1y);
                    const len2 = Math.hypot(v2x, v2y);
                    
                    if (len1 > 0 && len2 > 0) {
                        const dot = (v1x * v2x + v1y * v2y) / (len1 * len2);
                        const angleRad = Math.acos(Math.max(-1, Math.min(1, dot)));
                        const angleDeg = (angleRad * 180 / Math.PI).toFixed(2);
                        
                        // Offset towards center
                        const dirX = cx - pt.x;
                        const dirY = cy - pt.y;
                        const lenDir = Math.hypot(dirX, dirY);
                        if (lenDir > 0) {
                            const offsetPx = 40; // Push angle label a bit inside
                            const ax = pt.x + (dirX / lenDir) * offsetPx;
                            const ay = pt.y + (dirY / lenDir) * offsetPx;
                            // Draw angle using a different color (purple/magenta) to distinguish from length
                            drawLabel(ceCtx, `${angleDeg}°`, ax, ay, "#800080");
                        }
                    }
                }
                
                // reset context defaults
                ceCtx.textAlign = "start";
                ceCtx.textBaseline = "alphabetic";
            }
        }
    }

    function getMousePos(event) {
        const rect = ceCanvas.getBoundingClientRect();
        const scaleX = ceCanvas.width / rect.width;
        const scaleY = ceCanvas.height / rect.height;
        return {
            x: (event.clientX - rect.left) * scaleX,
            y: (event.clientY - rect.top) * scaleY
        };
    }

    function findPointNear(x, y) {
        let closest = null;
        let minDistance = 20; // Hit tolerance
        for (const card of detectedCards) {
            for (const pt of card) {
                const dist = Math.hypot(pt.x - x, pt.y - y);
                if (dist < minDistance) {
                    minDistance = dist;
                    closest = pt;
                }
            }
        }
        return closest;
    }

    function findCardContaining(x, y) {
        for (const card of detectedCards) {
            ceCtx.beginPath();
            ceCtx.moveTo(card[0].x, card[0].y);
            for (let j = 1; j < 4; j++) {
                ceCtx.lineTo(card[j].x, card[j].y);
            }
            ceCtx.closePath();
            if (ceCtx.isPointInPath(x, y)) {
                return card;
            }
        }
        return null;
    }

    // Canvas Event Listeners for Interaction
    ceCanvas.addEventListener("mousedown", (e) => {
        if (!isImageLoaded || detectedCards.length === 0) return;
        ceCanvas.focus();
        
        const pos = getMousePos(e);
        const hitPoint = findPointNear(pos.x, pos.y);
        
        if (hitPoint) {
            selectedPoint = hitPoint;
            isDraggingPoint = true;
            draggedPoint = hitPoint;
        } else {
            selectedPoint = null;
            const hitCard = findCardContaining(pos.x, pos.y);
            if (hitCard) {
                isDraggingCard = true;
                draggedCard = hitCard;
                dragStartX = pos.x;
                dragStartY = pos.y;
                // Treat a clicked card as selecting its first corner for UI state
                selectedPoint = hitCard[0]; 
            }
        }
        updateButtonStates();
        redraw();
    });

    ceCanvas.addEventListener("mousemove", (e) => {
        if (!isImageLoaded || detectedCards.length === 0) return;
        const pos = getMousePos(e);
        
        if (isDraggingPoint && draggedPoint) {
            draggedPoint.x = Math.max(0, Math.min(ceCanvas.width, pos.x));
            draggedPoint.y = Math.max(0, Math.min(ceCanvas.height, pos.y));
            ceCanvas.style.cursor = 'grabbing';
            redraw();
        } else if (isDraggingCard && draggedCard) {
            const dx = pos.x - dragStartX;
            const dy = pos.y - dragStartY;
            
            for (const pt of draggedCard) {
                pt.x += dx;
                pt.y += dy;
                // keep points inside canvas horizontally
                pt.x = Math.max(0, Math.min(ceCanvas.width, pt.x));
                // keep points inside canvas vertically
                pt.y = Math.max(0, Math.min(ceCanvas.height, pt.y));
            }
            
            dragStartX = pos.x;
            dragStartY = pos.y;
            ceCanvas.style.cursor = 'grabbing';
            redraw();
        } else {
            hoveredPoint = findPointNear(pos.x, pos.y);
            hoveredCard = findCardContaining(pos.x, pos.y);
            
            if (hoveredPoint) {
                ceCanvas.style.cursor = 'grab';
            } else if (hoveredCard) {
                ceCanvas.style.cursor = 'move';
            } else {
                ceCanvas.style.cursor = 'crosshair';
            }
            redraw();
        }
    });

    window.addEventListener("mouseup", () => {
        if (isDraggingPoint) {
            isDraggingPoint = false;
            draggedPoint = null;
            if (ceCanvas.matches(':hover')) {
                ceCanvas.style.cursor = hoveredPoint ? 'grab' : 'crosshair';
            }
        }
        if (isDraggingCard) {
            isDraggingCard = false;
            draggedCard = null;
            if (ceCanvas.matches(':hover')) {
                ceCanvas.style.cursor = 'crosshair'; // simple reset
            }
        }
    });

    // Scroll the browser so the selected corner appears near
    // the corresponding viewport corner (TL→top-left, TR→top-right, etc.)
    function scrollToCorner(point, cornerIndex) {
        const rect = ceCanvas.getBoundingClientRect();
        const scaleX = rect.width / ceCanvas.width;
        const scaleY = rect.height / ceCanvas.height;

        // Corner position in viewport coordinates
        const vpX = rect.left + point.x * scaleX;
        const vpY = rect.top + point.y * scaleY;

        // Account for sticky header height
        const stickyEl = ceCanvas.closest('.tab-content')?.querySelector('.sticky-controls');
        const stickyH = stickyEl ? stickyEl.getBoundingClientRect().height : 0;

        const pad = 20;
        let targetX = window.scrollX;
        let targetY = window.scrollY;

        switch (cornerIndex) {
            case 0: // TL — near top-left of viewport (below sticky header)
                targetX += vpX - pad;
                targetY += vpY - (stickyH + pad);
                break;
            case 1: // TR — near top-right of viewport (below sticky header)
                targetX += vpX - (window.innerWidth - pad);
                targetY += vpY - (stickyH + pad);
                break;
            case 2: // BR — near bottom-right of viewport
                targetX += vpX - (window.innerWidth - pad);
                targetY += vpY - (window.innerHeight - pad);
                break;
            case 3: // BL — near bottom-left of viewport
                targetX += vpX - pad;
                targetY += vpY - (window.innerHeight - pad);
                break;
        }

        window.scrollTo({ left: targetX, top: targetY, behavior: 'smooth' });
    }

    window.addEventListener("keydown", (e) => {
        if (!isImageLoaded || detectedCards.length === 0) return;
        if (e.target.tagName === 'INPUT') return;

        // Tab / Shift+Tab corner navigation (only when ceCanvas is focused)
        if (e.key === "Tab" && document.activeElement === ceCanvas) {
            e.preventDefault();

            if (e.shiftKey) {
                // Shift+Tab: counter-clockwise through corners
                if (!selectedPoint) {
                    selectedPoint = detectedCards[0][0];
                } else {
                    const cardIdx = detectedCards.findIndex(c => c.includes(selectedPoint));
                    if (cardIdx !== -1) {
                        const cornerIdx = detectedCards[cardIdx].indexOf(selectedPoint);
                        const prevCornerIdx = (cornerIdx + 3) % 4; // -1 mod 4
                        selectedPoint = detectedCards[cardIdx][prevCornerIdx];
                    }
                }
            } else {
                // Tab: clockwise through corners
                if (!selectedPoint) {
                    selectedPoint = detectedCards[0][0];
                } else {
                    const cardIdx = detectedCards.findIndex(c => c.includes(selectedPoint));
                    if (cardIdx !== -1) {
                        const cornerIdx = detectedCards[cardIdx].indexOf(selectedPoint);
                        const nextCornerIdx = (cornerIdx + 1) % 4;
                        selectedPoint = detectedCards[cardIdx][nextCornerIdx];
                    }
                }
            }

            // Scroll to the selected corner
            const cardIdx = detectedCards.findIndex(c => c.includes(selectedPoint));
            if (cardIdx !== -1) {
                const cornerIdx = detectedCards[cardIdx].indexOf(selectedPoint);
                scrollToCorner(selectedPoint, cornerIdx);
            }

            updateButtonStates();
            redraw();
            return;
        }

        // Enter: jump to top-left corner of the next card
        if (e.key === "Enter" && document.activeElement === ceCanvas) {
            e.preventDefault();

            if (!selectedPoint) {
                selectedPoint = detectedCards[0][0];
            } else {
                const cardIdx = detectedCards.findIndex(c => c.includes(selectedPoint));
                const nextCardIdx = (cardIdx + 1) % detectedCards.length;
                selectedPoint = detectedCards[nextCardIdx][0];
            }

            scrollToCorner(selectedPoint, 0);
            updateButtonStates();
            redraw();
            return;
        }

        // Arrow keys and Delete require a selected point
        if (!selectedPoint) return;

        let step = e.shiftKey ? 10 : 1;
        let handled = false;

        if (e.key === "ArrowLeft") {
            selectedPoint.x = Math.max(0, selectedPoint.x - step);
            handled = true;
        } else if (e.key === "ArrowRight") {
            selectedPoint.x = Math.min(ceCanvas.width, selectedPoint.x + step);
            handled = true;
        } else if (e.key === "ArrowUp") {
            selectedPoint.y = Math.max(0, selectedPoint.y - step);
            handled = true;
        } else if (e.key === "ArrowDown") {
            selectedPoint.y = Math.min(ceCanvas.height, selectedPoint.y + step);
            handled = true;
        } else if (e.key === "Delete" || e.key === "Backspace") {
            deleteSelectedCard();
            handled = true;
        }

        if (handled) {
            e.preventDefault();
            redraw();
        }
    });

    function deleteSelectedCard() {
        if (!selectedPoint) return;
        const index = detectedCards.findIndex(card => card.includes(selectedPoint));
        if (index !== -1) {
            detectedCards.splice(index, 1);
            selectedPoint = null;
            updateButtonStates();
            redraw();
        }
    }

    ceDeleteButton.addEventListener("click", () => {
        deleteSelectedCard();
    });

    function orderPoints(pts) {
        // Sort points to TL, TR, BR, BL
        let ptsCopy = [...pts];
        
        // Find centers
        let cx = ptsCopy.reduce((sum, p) => sum + p.x, 0) / 4;
        let cy = ptsCopy.reduce((sum, p) => sum + p.y, 0) / 4;
        
        // Sort by angle relative to center point - this reliably orders corners clockwise
        ptsCopy.sort((a, b) => {
            let angleA = Math.atan2(a.y - cy, a.x - cx);
            let angleB = Math.atan2(b.y - cy, b.x - cx);
            return angleA - angleB;
        });

        // The angle atan2 goes from -PI to PI.
        // It wraps around the left side. Depending on screen coordinates (Y down),
        // we might get them in specific order, typically TL, TR, BR, BL depending on starting point.
        // Let's do a more robust standard sorting:
        ptsCopy = [...pts];
        ptsCopy.sort((a, b) => a.y - b.y); // Sort by Y
        
        // Top two points
        let topPts = [ptsCopy[0], ptsCopy[1]].sort((a, b) => a.x - b.x); // TL, TR
        // Bottom two points
        let botPts = [ptsCopy[2], ptsCopy[3]].sort((a, b) => b.x - a.x); // BR, BL (reverse X sort to keep clockwise)
        
        return [topPts[0], topPts[1], botPts[0], botPts[1]]; // TL, TR, BR, BL
    }

    ceProcessButton.addEventListener('click', () => {
        if (!isCvReady) {
            alert("OpenCV is not ready yet.");
            return;
        }

        if (detectedCards.length > 0) {
            if (!confirm(`You have ${detectedCards.length} card${detectedCards.length !== 1 ? 's' : ''} selected. Auto-detect will reset them. Continue?`)) {
                return;
            }
        }

        ceProcessButton.disabled = true;
        ceProcessButton.textContent = "Processing...";
        
        // Use a slight timeout to allow UI to update
        setTimeout(() => {
            try {
                detectCards();
            } catch (err) {
                console.error("OpenCV Processing Error:", err);
                alert("An error occurred during card detection.");
            } finally {
                ceProcessButton.disabled = false;
                ceProcessButton.textContent = "Auto-Detect Cards";
                updateButtonStates();
            }
        }, 50);
    });

    function detectCards() {
        detectedCards = [];
        
        // Read image from canvas to OpenCV Mat
        let src = cv.imread(ceSourceCanvas);
        let gray = new cv.Mat();
        let blurred = new cv.Mat();
        let edges = new cv.Mat();
        
        // Grayscale
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
        // Blur to remove noise
        cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
        // Canny edge detection
        // Parameters: threshold1, threshold2. 50 and 150 are standard.
        // It might be useful to compute medians or use adaptive thresholding for bad scans.
        cv.Canny(blurred, edges, 50, 150);

        // Dilate edges slightly to close gaps
        let M = cv.Mat.ones(3, 3, cv.CV_8U);
        cv.dilate(edges, edges, M, new cv.Point(-1, -1), 1, cv.BORDER_CONSTANT, cv.morphologyDefaultBorderValue());
        
        // Find Contours
        let contours = new cv.MatVector();
        let hierarchy = new cv.Mat();
        cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        let imgArea = src.rows * src.cols;
        let minCardArea = imgArea * 0.01; // Cards must be at least 1% of the image
        
        for (let i = 0; i < contours.size(); ++i) {
            let contour = contours.get(i);
            let area = cv.contourArea(contour);
            
            if (area < minCardArea) {
                continue;
            }

            let perimeter = cv.arcLength(contour, true);
            let approx = new cv.Mat();
            // Approximate polygon. 2% of perimeter is a good epsilon
            cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);

            // We are looking for quadrilaterals (4 vertices) that are convex
            if (approx.rows === 4 && cv.isContourConvex(approx)) {
                let pts = [];
                for (let j = 0; j < 4; j++) {
                    pts.push({
                        x: approx.data32S[j * 2],
                        y: approx.data32S[j * 2 + 1]
                    });
                }
                
                detectedCards.push(orderPoints(pts));
            }
            approx.delete();
        }

        // Cleanup
        src.delete();
        gray.delete();
        blurred.delete();
        edges.delete();
        M.delete();
        contours.delete();
        hierarchy.delete();
        
        if (detectedCards.length === 0) {
            alert("No cards could be automatically detected with clarity. Make sure the background contrasts with the cards.");
        }
        
        redraw();
    }

    ceAddManualButton.addEventListener('click', () => {
        if (!isImageLoaded) return;
        
        let cx = ceSourceCanvas.width / 2;
        let cy = ceSourceCanvas.height / 2;
        
        // Define a default size (around 20% of width, preserving typical card aspect ratio)
        let w = Math.min(ceSourceCanvas.width * 0.2, cx * 0.8);
        if (w < 100) w = 100; // Minimum width
        let h = w * 1.5;
        
        // Points: TL, TR, BR, BL
        let pts = [
            { x: cx - w/2, y: cy - h/2 },
            { x: cx + w/2, y: cy - h/2 },
            { x: cx + w/2, y: cy + h/2 },
            { x: cx - w/2, y: cy + h/2 }
        ];
        
        detectedCards.push(pts);
        updateButtonStates();
        redraw();
    });

    ceDownloadButton.addEventListener('click', async () => {
        if (detectedCards.length === 0) return;
        
        ceDownloadButton.disabled = true;
        ceDownloadButton.textContent = "Processing Archive...";
        const prefix = cePrefixInput.value;
        
        try {
            const zip = new JSZip();
            
            // We transform and crop each detected card
            let srcMat = cv.imread(ceSourceCanvas);

            for (let i = 0; i < detectedCards.length; i++) {
                let card = detectedCards[i]; // [TL, TR, BR, BL]
                
                // Calculate dimensions of the output image based on the detected corners
                let widthA = Math.hypot(card[2].x - card[3].x, card[2].y - card[3].y);
                let widthB = Math.hypot(card[1].x - card[0].x, card[1].y - card[0].y);
                let maxWidth = Math.max(widthA, widthB);

                let heightA = Math.hypot(card[1].x - card[2].x, card[1].y - card[2].y);
                let heightB = Math.hypot(card[0].x - card[3].x, card[0].y - card[3].y);
                let maxHeight = Math.max(heightA, heightB);

                // Source points
                let srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
                    card[0].x, card[0].y, // TL
                    card[1].x, card[1].y, // TR
                    card[2].x, card[2].y, // BR
                    card[3].x, card[3].y  // BL
                ]);
                
                // Destination points
                let dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
                    0, 0,
                    maxWidth - 1, 0,
                    maxWidth - 1, maxHeight - 1,
                    0, maxHeight - 1
                ]);

                // Create transformation matrix
                let M = cv.getPerspectiveTransform(srcTri, dstTri);
                
                let dst = new cv.Mat();
                let dsize = new cv.Size(maxWidth, maxHeight);
                
                // Warp
                cv.warpPerspective(srcMat, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

                // Create temporary canvas to get blob
                const tempCanvas = document.createElement('canvas');
                cv.imshow(tempCanvas, dst);
                
                // Cleanup current loop
                srcTri.delete();
                dstTri.delete();
                M.delete();
                dst.delete();

                // To Blob
                const blob = await new Promise(resolve => tempCanvas.toBlob(resolve, "image/png"));
                const padIndex = String(i + 1).padStart(2, '0');
                zip.file(`${prefix}${padIndex}.png`, blob);
            }

            srcMat.delete();

            const content = await zip.generateAsync({ type: "blob" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(content);
            a.download = originalFileName + "_cards.zip";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href); 

        } catch (e) {
            console.error(e);
            alert("Error generating card archive.");
        } finally {
            ceDownloadButton.disabled = false;
            updateButtonStates();
        }
    });
})();
