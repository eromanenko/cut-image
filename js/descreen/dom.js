export const dom = {};

export function initDom() {
    dom.fileInput = document.getElementById("dsFileInput");
    dom.processBtn = document.getElementById("dsProcessBtn");
    dom.downloadBtn = document.getElementById("dsDownloadBtn");
    dom.compareCheckbox = document.getElementById("dsCompareCheckbox");
    dom.filterMethod = document.getElementById("dsFilterMethod");

    dom.bilateralControls = document.getElementById("dsBilateralControls");
    dom.gaussianControls = document.getElementById("dsGaussianControls");
    dom.medianControls = document.getElementById("dsMedianControls");

    dom.biD = document.getElementById("dsBiD");
    dom.biSigmaColor = document.getElementById("dsBiSigmaColor");
    dom.biSigmaSpace = document.getElementById("dsBiSigmaSpace");

    dom.gaussK = document.getElementById("dsGaussK");
    dom.unsharpAmount = document.getElementById("dsUnsharpAmount");

    dom.medianK = document.getElementById("dsMedianK");

    dom.opencvStatus = document.getElementById("dsOpencvStatus");
    dom.canvas = document.getElementById("dsCanvas");
    dom.ctx = dom.canvas.getContext("2d");

    dom.sourceCanvas = document.createElement("canvas");
    dom.sourceCtx = dom.sourceCanvas.getContext("2d");

    dom.resultCanvas = document.createElement("canvas");
    dom.resultCtx = dom.resultCanvas.getContext("2d");
}
