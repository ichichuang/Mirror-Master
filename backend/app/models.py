from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt, model_validator

PositiveStrictInt = Annotated[StrictInt, Field(gt=0)]
Sha256Hex = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
Confidence = Annotated[StrictFloat, Field(ge=0, le=1)]


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
