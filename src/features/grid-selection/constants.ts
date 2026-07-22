export const PIXELANIM_GRID_COLUMNS = 34;
export const PIXELANIM_GRID_ROWS = 27;
export const PIXELANIM_VERTICAL_BOUNDARY_COUNT = PIXELANIM_GRID_COLUMNS + 1;
export const PIXELANIM_HORIZONTAL_BOUNDARY_COUNT = PIXELANIM_GRID_ROWS + 1;
export const PIXELANIM_GRID_RATIO = PIXELANIM_GRID_COLUMNS / PIXELANIM_GRID_ROWS;

export const MIN_GRID_SELECTION_CELL_SIZE = 4;
export const MIN_GRID_SELECTION_WIDTH = PIXELANIM_GRID_COLUMNS * MIN_GRID_SELECTION_CELL_SIZE;
export const MIN_GRID_SELECTION_HEIGHT = PIXELANIM_GRID_ROWS * MIN_GRID_SELECTION_CELL_SIZE;

/**
 * A corrected 34 x 27 rectangle is accepted when derived cell width and height
 * differ by no more than 12%. This keeps manual correction forgiving while
 * still rejecting visibly non-square Pixelanim cells.
 */
export const GRID_CELL_SQUARE_TOLERANCE = 0.12;
