from __future__ import annotations

import math
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


class GridPoint(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    x: Annotated[float, Field(ge=0)]
    y: Annotated[float, Field(ge=0)]


class GridEvidenceMetrics(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    line_coverage: Confidence = Field(alias="lineCoverage")
    lattice_inlier_ratio: Confidence = Field(alias="latticeInlierRatio")
    normalized_residual: Confidence = Field(alias="normalizedResidual")
    periodicity_score: Confidence = Field(alias="periodicityScore")
    harmonic_margin: Confidence = Field(alias="harmonicMargin")
    boundary_support: Confidence = Field(alias="boundarySupport")
    cell_consistency: Confidence = Field(alias="cellConsistency")
    hypothesis_agreement: Confidence = Field(alias="hypothesisAgreement")


class GridCellSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    total_cell_count: PositiveStrictInt = Field(alias="totalCellCount")
    occupied_cell_count: Annotated[StrictInt, Field(ge=0)] = Field(
        alias="occupiedCellCount"
    )
    color_cluster_count: Annotated[StrictInt, Field(ge=0)] = Field(
        alias="colorClusterCount"
    )
    uncertain_cell_count: Annotated[StrictInt, Field(ge=0)] = Field(
        alias="uncertainCellCount"
    )
    matrix_digest: Sha256Hex = Field(alias="matrixDigest")

    @model_validator(mode="after")
    def validate_counts(self) -> "GridCellSummary":
        if (
            self.occupied_cell_count > self.total_cell_count
            or self.uncertain_cell_count > self.total_cell_count
            or self.color_cluster_count > self.occupied_cell_count
        ):
            raise ValueError("cell summary counts are inconsistent")
        return self


class GridCandidateV2(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    candidate_id: Annotated[
        str, Field(alias="candidateId", pattern=r"^[a-z][a-z0-9-]{7,79}$")
    ]
    detector: Literal[
        "line", "component", "periodic", "rectified", "manual"
    ]
    style: Literal[
        "line-grid", "ring-grid", "filled-cell-grid", "mixed"
    ]
    mirror_frame: Literal[
        "explicit-grid", "occupied-bounds", "manual-region"
    ] = Field(alias="mirrorFrame")
    source_quad: Annotated[
        list[GridPoint], Field(alias="sourceQuad", min_length=4, max_length=4)
    ]
    rectified_width: PositiveStrictInt = Field(alias="rectifiedWidth")
    rectified_height: PositiveStrictInt = Field(alias="rectifiedHeight")
    pitch_x: Annotated[float, Field(alias="pitchX", gt=0)]
    pitch_y: Annotated[float, Field(alias="pitchY", gt=0)]
    columns: Annotated[StrictInt, Field(ge=2, le=300)]
    rows: Annotated[StrictInt, Field(ge=2, le=300)]
    x_boundaries: Annotated[
        list[StrictInt], Field(alias="xBoundaries", min_length=3, max_length=301)
    ]
    y_boundaries: Annotated[
        list[StrictInt], Field(alias="yBoundaries", min_length=3, max_length=301)
    ]
    confidence: Confidence
    review: Literal["ready", "review"]
    metrics: GridEvidenceMetrics
    cell_summary: GridCellSummary = Field(alias="cellSummary")
    warnings: Annotated[
        list[Annotated[str, Field(pattern=r"^GRID_[A-Z0-9_]+$", max_length=80)]],
        Field(max_length=8),
    ]

    @model_validator(mode="after")
    def validate_geometry(self) -> "GridCandidateV2":
        _validate_v2_quad(self.source_quad)
        _validate_v2_axis(
            self.x_boundaries,
            cells=self.columns,
            extent=self.rectified_width,
            pitch=self.pitch_x,
        )
        _validate_v2_axis(
            self.y_boundaries,
            cells=self.rows,
            extent=self.rectified_height,
            pitch=self.pitch_y,
        )
        if self.cell_summary.total_cell_count != self.rows * self.columns:
            raise ValueError("cell summary does not match grid dimensions")
        if self.review == "ready" and self.warnings:
            raise ValueError("ready candidates cannot carry warnings")
        return self


class GridDetectionResultV2(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    contract_version: Literal["2.0"] = Field(
        default="2.0", alias="contractVersion"
    )
    image_sha256: Sha256Hex = Field(alias="imageSha256")
    natural_width: PositiveStrictInt = Field(alias="naturalWidth")
    natural_height: PositiveStrictInt = Field(alias="naturalHeight")
    selected_candidate_id: str = Field(alias="selectedCandidateId")
    candidates: Annotated[
        list[GridCandidateV2], Field(min_length=1, max_length=3)
    ]

    @model_validator(mode="after")
    def validate_selection(self) -> "GridDetectionResultV2":
        candidate_ids = [candidate.candidate_id for candidate in self.candidates]
        if len(set(candidate_ids)) != len(candidate_ids):
            raise ValueError("candidate ids must be unique")
        if self.selected_candidate_id not in candidate_ids:
            raise ValueError("selected candidate is missing")
        return self


class GridContractV2(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    contract_version: Literal["2.0"] = Field(alias="contractVersion")
    image_sha256: Sha256Hex = Field(alias="imageSha256")
    natural_width: PositiveStrictInt = Field(alias="naturalWidth")
    natural_height: PositiveStrictInt = Field(alias="naturalHeight")
    candidate_id: Annotated[
        str, Field(alias="candidateId", pattern=r"^[a-z][a-z0-9-]{7,79}$")
    ]
    source_quad: Annotated[
        list[GridPoint], Field(alias="sourceQuad", min_length=4, max_length=4)
    ]
    rectified_width: PositiveStrictInt = Field(alias="rectifiedWidth")
    rectified_height: PositiveStrictInt = Field(alias="rectifiedHeight")
    pitch_x: Annotated[float, Field(alias="pitchX", gt=0)]
    pitch_y: Annotated[float, Field(alias="pitchY", gt=0)]
    columns: Annotated[StrictInt, Field(ge=2, le=300)]
    rows: Annotated[StrictInt, Field(ge=2, le=300)]
    x_boundaries: Annotated[
        list[StrictInt], Field(alias="xBoundaries", min_length=3, max_length=301)
    ]
    y_boundaries: Annotated[
        list[StrictInt], Field(alias="yBoundaries", min_length=3, max_length=301)
    ]
    matrix_digest: Sha256Hex = Field(alias="matrixDigest")
    confirmed: Literal[True]
    axis: Literal["horizontal", "vertical"] = "horizontal"

    @model_validator(mode="after")
    def validate_geometry(self) -> "GridContractV2":
        _validate_v2_quad(self.source_quad)
        _validate_v2_axis(
            self.x_boundaries,
            cells=self.columns,
            extent=self.rectified_width,
            pitch=self.pitch_x,
        )
        _validate_v2_axis(
            self.y_boundaries,
            cells=self.rows,
            extent=self.rectified_height,
            pitch=self.pitch_y,
        )
        return self


def _validate_v2_axis(
    boundaries: list[int],
    *,
    cells: int,
    extent: int,
    pitch: float,
) -> None:
    if len(boundaries) != cells + 1:
        raise ValueError("boundary count does not match grid dimensions")
    if boundaries[0] != 0 or boundaries[-1] != extent:
        raise ValueError("canonical boundaries must span the rectified image")
    steps = [
        right - left for left, right in zip(boundaries, boundaries[1:])
    ]
    if any(step <= 0 for step in steps):
        raise ValueError("canonical boundaries must be strictly increasing")
    expected_pitch = extent / cells
    tolerance = max(0.51, expected_pitch * 0.02)
    if abs(pitch - expected_pitch) > tolerance:
        raise ValueError("pitch does not match the canonical extent")
    if max(steps) - min(steps) > 1:
        raise ValueError("canonical rounding may differ by at most one pixel")


def _validate_v2_quad(points: list[GridPoint]) -> None:
    if len(points) != 4:
        raise ValueError("source quad must contain four points")
    coordinates = [(point.x, point.y) for point in points]
    if any(not math.isfinite(value) for point in coordinates for value in point):
        raise ValueError("source quad coordinates must be finite")

    crosses: list[float] = []
    for index in range(4):
        previous = coordinates[index - 1]
        current = coordinates[index]
        following = coordinates[(index + 1) % 4]
        crosses.append(
            (current[0] - previous[0]) * (following[1] - current[1])
            - (current[1] - previous[1]) * (following[0] - current[0])
        )
    if any(abs(cross) < 1e-6 for cross in crosses):
        raise ValueError("source quad has a zero-area corner")
    if not (all(cross > 0 for cross in crosses) or all(cross < 0 for cross in crosses)):
        raise ValueError("source quad must be convex and ordered")


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
    color_boost: Literal["none", "vivid"] = Field(
        default="none", alias="colorBoost"
    )

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
    template: Literal["pure", "annotated", "numbered", "rounded"]
