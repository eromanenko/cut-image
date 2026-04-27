export const dom = {};

export function initDom() {
    dom.fileInput = document.getElementById("fileInput");
    dom.prefixInput = document.getElementById("prefixInput");
    dom.canvas = document.getElementById("canvas");
    dom.ctx = dom.canvas.getContext("2d");
    dom.downloadButton = document.getElementById("downloadButton");
    dom.resetButton = document.getElementById("resetButton");
    dom.skipEdgesCheckbox = document.getElementById("skipEdgesCheckbox");
    dom.autoDetectButton = document.getElementById("autoDetectButton");
    dom.minSizeInput = document.getElementById("minSizeInput");
    dom.dpiInput = document.getElementById("dpiInput");

    dom.pdfControls = document.getElementById("pdfControls");
    dom.prevPageBtn = document.getElementById("prevPageBtn");
    dom.nextPageBtn = document.getElementById("nextPageBtn");
    dom.pageIndicator = document.getElementById("pageIndicator");
    dom.allPagesCheckbox = document.getElementById("allPagesCheckbox");
    dom.allPagesCheckContainer = document.getElementById("allPagesCheckContainer");
    dom.fileNameDisplay = document.getElementById("gridFileName");

    dom.sourceCanvas = document.createElement("canvas");
    dom.sourceCtx = dom.sourceCanvas.getContext("2d");
}
