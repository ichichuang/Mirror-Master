from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np


PointTuple = tuple[float, float]
QuadTuple = tuple[PointTuple, PointTuple, PointTuple, PointTuple]


@dataclass(frozen=True, slots=True)
class EvidenceMetrics:
    line_coverage: float = 0.0
    lattice_inlier_ratio: float = 0.0
    normalized_residual: float = 1.0
    periodicity_score: float = 0.0
    harmonic_margin: float = 0.0
    boundary_support: float = 0.0
    cell_consistency: float = 0.0
    hypothesis_agreement: float = 0.0


@dataclass(frozen=True, slots=True)
class LatticeCandidate:
    detector: Literal[
        "line", "component", "periodic", "rectified", "manual"
    ]
    style: Literal[
        "line-grid", "ring-grid", "filled-cell-grid", "mixed"
    ]
    mirror_frame: Literal[
        "explicit-grid", "occupied-bounds", "manual-region"
    ]
    source_quad: QuadTuple
    rectified_width: int
    rectified_height: int
    pitch_x: float
    pitch_y: float
    columns: int
    rows: int
    x_boundaries: tuple[int, ...]
    y_boundaries: tuple[int, ...]
    confidence: float
    review: Literal["ready", "review"]
    metrics: EvidenceMetrics
    warnings: tuple[str, ...] = ()
    score: float = 0.0

    @property
    def geometry_key(self) -> tuple[object, ...]:
        rounded_quad = tuple(
            (round(point[0], 1), round(point[1], 1))
            for point in self.source_quad
        )
        return (
            self.columns,
            self.rows,
            round(self.pitch_x, 1),
            round(self.pitch_y, 1),
            rounded_quad,
        )


@dataclass(frozen=True, slots=True)
class ComponentObservation:
    x: float
    y: float
    width: float
    height: float
    area: float
    circularity: float
    ring_score: float


@dataclass(frozen=True, slots=True)
class CellRecord:
    row: int
    column: int
    occupied: bool
    representative_lab: tuple[float, float, float] | None
    color_cluster_id: int | None
    confidence: float


@dataclass(frozen=True, slots=True)
class RectifiedImage:
    rgba: np.ndarray
    forward: np.ndarray
    inverse: np.ndarray
