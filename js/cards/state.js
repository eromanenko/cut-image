export const state = {
    isImageLoaded: false,
    originalFileName: "cards_archive",
    detectedCards: [],

    isPdf: false,
    pdfDoc: null,
    currentPreviewPage: 1,
    PDF_SCALE: 4.166666666666667, // 300 DPI (72 * 4.166... = 300)

    isDraggingPoint: false,
    draggedPoint: null,
    selectedPoint: null,
    hoveredPoint: null,
    hoveredCard: null,

    isDraggingCard: false,
    draggedCard: null,
    dragStartX: 0,
    dragStartY: 0,

    isCvReady: window.openCvReady === true,

    zoomLevel: 3,
    rectZoomLevel: 3,       // separate zoom for rect-mode 4-quadrant view

    // -----------------------------------------------------------------------
    // Rectangle Mode
    // -----------------------------------------------------------------------
    editMode: 'freeform',          // 'freeform' | 'rect'

    rectCards: [],                  // [{ x, y, angle }]
    selectedRectCardIndex: -1,
    isDraggingRectCard: false,
    draggedRectCardIndex: -1,
    dragRectStartX: 0,
    dragRectStartY: 0,
    hoveredRectCardIndex: -1,

    // Global dimensions for all rect-mode cards (canvas pixels)
    rectWidth: 0,
    rectHeight: 0,
    rectSkew: 0,

    // -----------------------------------------------------------------------
    // Persistent Coordinates
    // -----------------------------------------------------------------------
    coordsDatabase: {}, // { "filename.jpg": { editMode, dpi, freeformCards, rectCards, rectGlobal } }
    currentFileName: "",
    
    hasUnsavedChanges: false,
};

export function resetState() {
    state.detectedCards = [];
    state.isImageLoaded = false;
    state.pdfDoc = null;
    state.isPdf = false;

    state.isDraggingPoint = false;
    state.draggedPoint = null;
    state.selectedPoint = null;
    state.hoveredPoint = null;
    state.hoveredCard = null;

    state.isDraggingCard = false;
    state.draggedCard = null;
    state.dragStartX = 0;
    state.dragStartY = 0;

    // Rect mode — keep editMode & global dims, but clear cards
    state.rectCards = [];
    state.selectedRectCardIndex = -1;
    state.isDraggingRectCard = false;
    state.draggedRectCardIndex = -1;
    state.dragRectStartX = 0;
    state.dragRectStartY = 0;
    state.hoveredRectCardIndex = -1;
}
