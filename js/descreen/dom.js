export const dom = {};

export function initDom() {
    dom.fileInput = document.getElementById("dsFileInput");
    dom.undoBtn = document.getElementById("dsUndoBtn");
    dom.processBtn = document.getElementById("dsProcessBtn");
    dom.downloadBtn = document.getElementById("dsDownloadBtn");
    dom.compareCheckbox = document.getElementById("dsCompareCheckbox");
    dom.filterMethod = document.getElementById("dsFilterMethod");

    dom.bilateralControls = document.getElementById("dsBilateralControls");
    dom.gaussianControls = document.getElementById("dsGaussianControls");
    dom.medianControls = document.getElementById("dsMedianControls");
    dom.fftControls = document.getElementById("dsFftControls");

    dom.biD = document.getElementById("dsBiD");
    dom.biSigmaColor = document.getElementById("dsBiSigmaColor");
    dom.biSigmaSpace = document.getElementById("dsBiSigmaSpace");

    dom.gaussK = document.getElementById("dsGaussK");
    dom.unsharpAmount = document.getElementById("dsUnsharpAmount");

    dom.medianK = document.getElementById("dsMedianK");
    
    dom.fftThreshold = document.getElementById("dsFftThreshold");
    dom.fftRadius = document.getElementById("dsFftRadius");
    
    dom.dpiInput = document.getElementById("dsDpiInput");
    dom.tuneBtn = document.getElementById("dsTuneBtn");

    dom.tuneModal = document.getElementById("dsTuneModal");
    dom.tuneCancelX = document.getElementById("dsTuneCancelX");
    dom.tuneCancelBtn = document.getElementById("dsTuneCancelBtn");
    dom.tuneApplyBtn = document.getElementById("dsTuneApplyBtn");
    
    dom.tuneMethod = document.getElementById("dsTuneMethod");
    dom.tuneBiControls = document.getElementById("dsTuneBiControls");
    dom.tuneGaussControls = document.getElementById("dsTuneGaussControls");
    dom.tuneMedianControls = document.getElementById("dsTuneMedianControls");
    dom.tuneFftControls = document.getElementById("dsTuneFftControls");

    dom.tuneBiD = document.getElementById("dsTuneBiD");
    dom.tuneBiColor = document.getElementById("dsTuneBiColor");
    dom.tuneBiSpace = document.getElementById("dsTuneBiSpace");

    dom.tuneGaussK = document.getElementById("dsTuneGaussK");
    dom.tuneUnsharpAmt = document.getElementById("dsTuneUnsharpAmt");

    dom.tuneMedianK = document.getElementById("dsTuneMedianK");

    dom.tuneFftThreshold = document.getElementById("dsTuneFftThreshold");
    dom.tuneFftRadius = document.getElementById("dsTuneFftRadius");

    dom.tuneCanvasContainer = document.getElementById("dsTuneCanvasContainer");
    dom.tuneCanvas = document.getElementById("dsTuneCanvas");
    if (dom.tuneCanvas) {
        dom.tuneCtx = dom.tuneCanvas.getContext("2d");
        dom.tuneSourceCanvas = document.createElement("canvas");
        dom.tuneSourceCtx = dom.tuneSourceCanvas.getContext("2d");
    }

    dom.opencvStatus = document.getElementById("dsOpencvStatus");
    dom.canvas = document.getElementById("dsCanvas");
    dom.ctx = dom.canvas.getContext("2d");

    dom.sourceCanvas = document.createElement("canvas");
    dom.sourceCtx = dom.sourceCanvas.getContext("2d");

    dom.resultCanvas = document.createElement("canvas");
    dom.resultCtx = dom.resultCanvas.getContext("2d");
    dom.fileNameDisplay = document.getElementById("dsFileName");
}
