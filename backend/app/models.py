from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt, model_validator

from app import limits
from app.generated_palettes import PALETTE_COLORS, PALETTE_SOURCE_VERSION

PositiveStrictInt = Annotated[StrictInt, Field(gt=0)]
Sha256Hex = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
Confidence = Annotated[StrictFloat, Field(ge=0, le=1)]
BoardRows = Annotated[
    StrictInt, Field(ge=limits.MIN_BOARD_ROWS, le=limits.MAX_BOARD_ROWS)
]
BoardColumns = Annotated[
    StrictInt,
    Field(ge=limits.MIN_BOARD_COLUMNS, le=limits.MAX_BOARD_COLUMNS),
]

COLOR_BY_ID = {color["id"]: color for color in PALETTE_COLORS}


def _validate_board_dimensions(
    board_preset_id: str,
    board_rows: int,
    board_columns: int,
) -> None:
    fixed_dimensions = limits.FIXED_BOARD_PRESETS.get(board_preset_id)
    if fixed_dimensions is None:
        return
    expected_rows, expected_columns = fixed_dimensions
    if board_rows != expected_rows or board_columns != expected_columns:
        raise ValueError("board dimensions must match selected preset")


def _validate_palette_selection(
    palette_id: str,
    available_color_ids: list[str],
    maximum_colors: int | None,
) -> None:
    if len(set(available_color_ids)) != len(available_color_ids):
        raise ValueError("available colors must be unique")
    if any(
        color_id not in COLOR_BY_ID
        or COLOR_BY_ID[color_id]["paletteId"] != palette_id
        for color_id in available_color_ids
    ):
        raise ValueError("available colors must belong to selected palette")
    if maximum_colors is not None and maximum_colors > len(available_color_ids):
        raise ValueError("maximum colors exceeds available colors")


class GridGeometry(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    image_sha256: Sha256Hex = Field(alias="imageSha256")
    natural_width: PositiveStrictInt = Field(alias="naturalWidth")
    natural_height: PositiveStrictInt = Field(alias="naturalHeight")
    cell_size: PositiveStrictInt = Field(alias="cellSize")
    columns: PositiveStrictInt
    rows: PositiveStrictInt
    x_boundaries: list[StrictInt] = Field(
        alias="xBoundaries", min_length=2
    )
    y_boundaries: list[StrictInt] = Field(
        alias="yBoundaries", min_length=2
    )
    left: StrictInt | None = None
    top: StrictInt | None = None
    right: StrictInt | None = None
    bottom: StrictInt | None = None
    confidence: Confidence | None = None
    warning: Annotated[str, Field(max_length=120)] | None = None

    @model_validator(mode="after")
    def validate_optional_bounds(self) -> "GridGeometry":
        bounds = (self.left, self.top, self.right, self.bottom)
        if any(value is not None for value in bounds) and any(
            value is None for value in bounds
        ):
            raise ValueError("grid bounds must be complete")
        return self


class GridContract(GridGeometry):
    confirmed: Literal[True]
    axis: Literal["horizontal", "vertical"] = "horizontal"


class GridDetectionResponse(GridGeometry):
    left: StrictInt
    top: StrictInt
    right: StrictInt
    bottom: StrictInt
    confidence: Confidence
    warning: Annotated[str, Field(max_length=120)] | None


class DetectionRectangle(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    left: StrictInt
    top: StrictInt
    right: StrictInt
    bottom: StrictInt


class CropRectangle(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    x: Annotated[StrictInt, Field(ge=0)]
    y: Annotated[StrictInt, Field(ge=0)]
    width: PositiveStrictInt
    height: PositiveStrictInt


class PatternGenerationSettings(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    mode: Literal["photo", "pixelArt", "existingChart"]
    crop: CropRectangle
    rotation: Literal[0, 90, 180, 270] = 0
    rows: Annotated[StrictInt, Field(ge=1, le=300)]
    columns: Annotated[StrictInt, Field(ge=1, le=300)]
    aspect_locked: bool = Field(alias="aspectLocked")
    bead_diameter_mm: Annotated[StrictFloat, Field(ge=1, le=10)] = Field(
        alias="beadDiameterMm"
    )
    bead_pitch_mm: Annotated[StrictFloat, Field(ge=1, le=12)] = Field(
        alias="beadPitchMm"
    )
    board_preset_id: Literal[
        "smallSquare", "standardSquare", "custom"
    ] = Field(alias="boardPresetId")
    board_rows: BoardRows = Field(alias="boardRows")
    board_columns: BoardColumns = Field(alias="boardColumns")
    palette_id: Literal["default", "mard"] = Field(alias="paletteId")
    available_color_ids: list[str] = Field(
        alias="availableColorIds", min_length=1, max_length=260
    )
    maximum_colors: Annotated[StrictInt, Field(ge=1, le=260)] | None = (
        Field(alias="maximumColors")
    )
    sampling: Literal["average", "nearest"]
    dithering: Literal["none", "floydSteinberg"]
    alpha_empty_threshold: Annotated[
        StrictFloat, Field(ge=0, le=1)
    ] = Field(alias="alphaEmptyThreshold")

    @model_validator(mode="after")
    def validate_generation_settings(self) -> "PatternGenerationSettings":
        if self.bead_pitch_mm < self.bead_diameter_mm:
            raise ValueError("bead pitch must not be smaller than diameter")
        _validate_board_dimensions(
            self.board_preset_id,
            self.board_rows,
            self.board_columns,
        )
        _validate_palette_selection(
            self.palette_id,
            self.available_color_ids,
            self.maximum_colors,
        )
        return self


class EmptyBeadCell(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    kind: Literal["empty"]


class FilledBeadCell(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    kind: Literal["bead"]
    color_id: str = Field(alias="colorId")


BeadCell = Annotated[
    EmptyBeadCell | FilledBeadCell, Field(discriminator="kind")
]


class ProjectSource(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    file_name: Annotated[str, Field(min_length=1, max_length=255)] = Field(
        alias="fileName"
    )
    mime_type: Literal["image/png", "image/jpeg", "image/webp"] = Field(
        alias="mimeType"
    )
    natural_width: PositiveStrictInt = Field(alias="naturalWidth")
    natural_height: PositiveStrictInt = Field(alias="naturalHeight")
    sha256: Sha256Hex
    crop: CropRectangle
    rotation: Literal[0, 90, 180, 270]


class ProjectGrid(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    rows: Annotated[StrictInt, Field(ge=1, le=300)]
    columns: Annotated[StrictInt, Field(ge=1, le=300)]
    aspect_locked: bool = Field(alias="aspectLocked")
    bead_diameter_mm: Annotated[StrictFloat, Field(ge=1, le=10)] = Field(
        alias="beadDiameterMm"
    )
    bead_pitch_mm: Annotated[StrictFloat, Field(ge=1, le=12)] = Field(
        alias="beadPitchMm"
    )
    board_preset_id: Literal[
        "smallSquare", "standardSquare", "custom"
    ] = Field(alias="boardPresetId")
    board_rows: BoardRows = Field(alias="boardRows")
    board_columns: BoardColumns = Field(alias="boardColumns")

    @model_validator(mode="after")
    def validate_bead_dimensions(self) -> "ProjectGrid":
        if self.bead_pitch_mm < self.bead_diameter_mm:
            raise ValueError("bead pitch must not be smaller than diameter")
        _validate_board_dimensions(
            self.board_preset_id,
            self.board_rows,
            self.board_columns,
        )
        return self


class ProjectPalette(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    palette_id: Literal["default", "mard"] = Field(alias="paletteId")
    palette_version: Literal[PALETTE_SOURCE_VERSION] = Field(
        alias="paletteVersion"
    )
    available_color_ids: list[str] = Field(
        alias="availableColorIds", min_length=1, max_length=260
    )
    maximum_colors: Annotated[StrictInt, Field(ge=1, le=260)] | None = (
        Field(alias="maximumColors")
    )

    @model_validator(mode="after")
    def validate_selection(self) -> "ProjectPalette":
        _validate_palette_selection(
            self.palette_id,
            self.available_color_ids,
            self.maximum_colors,
        )
        return self


class ProjectGeneration(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    sampling: Literal["average", "nearest"]
    color_distance: Literal["ciede2000"] = Field(alias="colorDistance")
    dithering: Literal["none", "floydSteinberg"]
    alpha_empty_threshold: Annotated[
        StrictFloat, Field(ge=0, le=1)
    ] = Field(alias="alphaEmptyThreshold")


class BeadProject(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schema_version: Literal["1.0"] = Field(alias="schemaVersion")
    id: Annotated[str, Field(min_length=8, max_length=80)]
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")
    mode: Literal["photo", "pixelArt", "existingChart"]
    source: ProjectSource
    grid: ProjectGrid
    palette: ProjectPalette
    generation: ProjectGeneration
    cells: list[list[BeadCell]]
    revision: Annotated[StrictInt, Field(ge=0)]

    @model_validator(mode="after")
    def validate_matrix(self) -> "BeadProject":
        if len(self.cells) != self.grid.rows or any(
            len(row) != self.grid.columns for row in self.cells
        ):
            raise ValueError("matrix dimensions do not match project grid")
        available_ids = set(self.palette.available_color_ids)
        for row in self.cells:
            for cell in row:
                if (
                    isinstance(cell, FilledBeadCell)
                    and cell.color_id not in available_ids
                ):
                    raise ValueError(
                        "matrix colors must belong to available colors"
                    )
        return self


class ProjectStatistics(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    total_cell_count: StrictInt = Field(alias="totalCellCount")
    blank_count: StrictInt = Field(alias="blankCount")
    non_empty_bead_count: StrictInt = Field(alias="nonEmptyBeadCount")
    used_color_count: StrictInt = Field(alias="usedColorCount")
    per_color_counts: dict[str, StrictInt] = Field(alias="perColorCounts")

    @model_validator(mode="after")
    def validate_counts(self) -> "ProjectStatistics":
        if (
            sum(self.per_color_counts.values())
            != self.non_empty_bead_count
            or self.non_empty_bead_count + self.blank_count
            != self.total_cell_count
        ):
            raise ValueError("project statistics are inconsistent")
        return self


class PatternGenerationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    project: BeadProject
    statistics: ProjectStatistics


class PatternExportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    project: BeadProject
    format: Literal["png", "pdf", "csv"]
    template: Literal["pure", "annotated"]
