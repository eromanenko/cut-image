export const dom = {};

export function initDom() {
    dom.fileInput = document.getElementById("ceFileInput");
    dom.prefixInput = document.getElementById("cePrefixInput");
    dom.processButton = document.getElementById("ceProcessButton");
    dom.downloadButton = document.getElementById("ceDownloadButton");
    dom.saveCoordsButton = document.getElementById("ceSaveCoordsButton");
    dom.viewCoordsButton = document.getElementById("ceViewCoordsButton");
    dom.loadCoordsButton = document.getElementById("ceLoadCoordsButton");
    dom.loadCoordsInput = document.getElementById("ceLoadCoordsInput");
    dom.viewCoordsCount = document.getElementById("ceViewCoordsCount");
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
    dom.zoomResizer = document.getElementById("ceZoomResizer");

    dom.sizeListContainer = document.getElementById("ceSizeListContainer");
    dom.addSizeBtn = document.getElementById("ceAddSizeBtn");
    dom.dpiInput = document.getElementById("ceDpiInput");

    dom.sourceCanvas = document.createElement("canvas");
    dom.sourceCtx = dom.sourceCanvas.getContext("2d", { willReadFrequently: true });

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

    // Calculator
    dom.calcBtnFreeform = document.getElementById("ceFreeformCalcBtn");
    dom.calcBtnRect = document.getElementById("ceRectCalcBtn");
    dom.calcModal = document.getElementById("ceCalcModal");
    dom.calcMmW = document.getElementById("ceCalcMmW");
    dom.calcMmH = document.getElementById("ceCalcMmH");
    dom.calcPxW = document.getElementById("ceCalcPxW");
    dom.calcPxH = document.getElementById("ceCalcPxH");
    dom.calcDpi = document.getElementById("ceCalcDpi");
    dom.calcPreset = document.getElementById("ceCalcPreset");
    dom.calcApplyBtn = document.getElementById("ceCalcApplyBtn");
    dom.calcCancelBtn = document.getElementById("ceCalcCancelBtn");
    dom.calcCancelX = document.getElementById("ceCalcCancelX");
    dom.fileNameDisplay = document.getElementById("ceFileName");

    // INI Stats Modal
    dom.iniStatsModal = document.getElementById("ceIniStatsModal");
    dom.iniStatsList = document.getElementById("ceIniStatsList");
    dom.iniStatsOkBtn = document.getElementById("ceIniStatsOkBtn");
    dom.iniStatsCancelX = document.getElementById("ceIniStatsCancelX");
    dom.iniStatsLoadMoreBtn = document.getElementById("ceIniStatsLoadMoreBtn");
    dom.iniStatsLoadMoreInput = document.getElementById("ceIniStatsLoadMoreInput");

    // Settings Modal
    dom.settingsModal = document.getElementById("ceSettingsModal");
    dom.settingsCancelX = document.getElementById("ceSettingsCancelX");
    dom.settingsOkBtn = document.getElementById("ceSettingsOkBtn");
    dom.settingsSummaryRow = document.getElementById("ceSettingsSummaryRow");
    dom.settingsSummaryText = document.getElementById("ceSettingsSummaryText");
    dom.settingsBtn = document.getElementById("ceSettingsBtn");
    dom.shareDataCheckbox = document.getElementById("ceShareDataCheckbox");
    dom.settingsResetBtn = document.getElementById("ceSettingsResetBtn");
}

export function getTargetSizes() {
    if (!dom.sizeListContainer) return [];
    const sizes = [];
    const rows = dom.sizeListContainer.querySelectorAll('.ce-size-row');
    rows.forEach(row => {
        const w = parseFloat(row.querySelector('.ceWidthInput').value) || 0;
        const h = parseFloat(row.querySelector('.ceHeightInput').value) || 0;
        if (w > 0 && h > 0) {
            sizes.push({ w, h });
        }
    });
    return sizes;
}
