export const state = {
    lines: [],
    cutRegions: [],
    isImageLoaded: false,
    originalFileName: "archive",

    gridCols: 0,
    gridRows: 0,

    isPdf: false,
    pdfDoc: null,
    currentPreviewPage: 1,
    PDF_SCALE: 4.166666666666667, // 300 DPI (72 * 4.166... = 300)

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
