from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt

PositiveStrictInt = Annotated[StrictInt, Field(gt=0)]
Sha256Hex = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]


class GridContract(BaseModel):
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
    confirmed: Literal[True]
