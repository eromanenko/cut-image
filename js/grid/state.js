export const state = {
    lines: [],
    cutRegions: [],
    isImageLoaded: false,
    originalFileName: "archive",

    isPdf: false,
    pdfDoc: null,
    currentPreviewPage: 1,
    PDF_SCALE: 2,

    isDragging: false,
    draggedLine: null,
    selectedLine: null,
    hoverLine: null,
    startMousePos: { x: 0, y: 0 },
    hasMoved: false,

    isMouseOverCanvas: false,
    currentMousePos: { x: 0, y: 0 },
    isShiftPressed: false
};
