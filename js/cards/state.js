export const state = {
    isImageLoaded: false,
    originalFileName: "cards_archive",
    detectedCards: [],

    isPdf: false,
    pdfDoc: null,
    currentPreviewPage: 1,
    PDF_SCALE: 2,

    isDraggingPoint: false,
    draggedPoint: null,
    selectedPoint: null,
    hoveredPoint: null,
    hoveredCard: null,

    isDraggingCard: false,
    draggedCard: null,
    dragStartX: 0,
    dragStartY: 0,

    isCvReady: window.openCvReady === true
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
}
