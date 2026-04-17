export const dom = {};

export function initDom() {
    dom.fileInput = document.getElementById("ceFileInput");
    dom.prefixInput = document.getElementById("cePrefixInput");
    dom.processButton = document.getElementById("ceProcessButton");
    dom.addManualButton = document.getElementById("ceAddManualButton");
    dom.deleteButton = document.getElementById("ceDeleteButton");
    dom.downloadButton = document.getElementById("ceDownloadButton");
    dom.canvas = document.getElementById("ceCanvas");
    dom.ctx = dom.canvas.getContext("2d");

    dom.pdfControls = document.getElementById("cePdfControls");
    dom.prevPageBtn = document.getElementById("cePrevPageBtn");
    dom.nextPageBtn = document.getElementById("ceNextPageBtn");
    dom.pageIndicator = document.getElementById("cePageIndicator");

    dom.lineColor = document.getElementById("ceLineColor");
    dom.lineOpacity = document.getElementById("ceLineOpacity");
    dom.lineOpacityVal = document.getElementById("ceLineOpacityVal");

    dom.zoomCheckbox = document.getElementById("ceZoomCheckbox");
    dom.zoomContainer = document.getElementById("ceZoomContainer");
    dom.zoomCanvas = document.getElementById("ceZoomCanvas");
    dom.zoomCtx = dom.zoomCanvas.getContext("2d");
    dom.zoomTitle = document.getElementById("ceZoomTitle");

    dom.widthInput = document.getElementById("ceWidthInput");
    dom.heightInput = document.getElementById("ceHeightInput");
    dom.dpiInput = document.getElementById("ceDpiInput");
    dom.getSizeBtn = document.getElementById("ceGetSizeBtn");

    dom.sourceCanvas = document.createElement("canvas");
    dom.sourceCtx = dom.sourceCanvas.getContext("2d");

    // Mode toggle
    dom.freeformModeBtn = document.getElementById("ceFreeformModeBtn");
    dom.rectModeBtn = document.getElementById("ceRectModeBtn");

    // Rect-mode controls row
    dom.rectControls = document.getElementById("ceRectControls");
    dom.rectWidthPx = document.getElementById("ceRectWidthPx");
    dom.rectHeightPx = document.getElementById("ceRectHeightPx");
    dom.rectSkewPx = document.getElementById("ceRectSkewPx");

    // Freeform-only rows (for show/hide on mode switch)
    dom.freeformStylingRow = document.getElementById("ceFreeformStylingRow");
    dom.freeformDimensionsRow = document.getElementById("ceFreeformDimensionsRow");

    // Mode-specific instruction spans
    dom.instrFreeform = document.getElementById("ceInstrFreeform");
    dom.instrRect     = document.getElementById("ceInstrRect");
}
