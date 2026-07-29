# Super Mirror V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:executing-plans` and `superpowers:test-driven-development`.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the square-line-only chart mirror with a backend-owned, ranked multi-evidence
lattice pipeline that mirrors complete cells for line, ring, filled-cell, unequal-pitch, and
perspective charts.

**Architecture:** Keep the current line recognizer as one evidence source. Add component,
periodicity, rectification, cell-summary, and ranking modules behind a versioned candidate
envelope. The frontend selects a backend candidate and submits only an explicit immutable mirror
contract.

**Tech Stack:** Python 3.12, FastAPI, Pydantic 2, OpenCV 4.13, NumPy, Pillow, TypeScript 6,
vanilla DOM/SVG, Vite 8, Node test runner.

## Global Constraints

- Geometry, never color, addresses mirror destinations.
- No OCR or new model dependency is introduced.
- Automatic detection abstains or requests review when geometry is underdetermined.
- Axis-aligned integer geometry retains exact outside pixels and pixel-exact double mirror.
- Perspective geometry retains exact outside-quad pixels and matrix-level double-mirror identity.
- Existing upload, privacy, hash, request-size, and no-store contracts remain intact.
- Do not commit, push, switch branches, or stage files unless the user explicitly asks.

---

### Task 1: Freeze the V2 contract with failing backend tests

**Files:**

- Create: `backend/tests/test_chart_detection_v2.py`
- Modify: `backend/tests/conftest.py`
- Modify: `backend/tests/test_mirror_api.py`

**Interfaces:**

- Produces fixtures for line, unequal-pitch ring, filled-cell-with-legend, and projective grids.
- Defines expected JSON fields for `GridDetectionResultV2` and `GridCandidateV2`.

- [ ] Add a synthetic 12 × 9 ring fixture with `pitchX=24`, `pitchY=20`, missing occupied cells,
      asymmetric symbols inside cells, and a non-grid legend.
- [ ] Add a 10 × 7 separated filled-cell fixture with internal text-like marks and an adjacent
      repeated-color legend.
- [ ] Add a 13 × 8 line grid warped from a known source rectangle into a convex quadrilateral.
- [ ] Assert automatic detection returns the correct ring/filled dimensions, independent pitches,
      candidate provenance, cell summary, and a review warning for occupied-boundary inference.
- [ ] Assert a manual projective request returns the known 13 × 8 geometry.
- [ ] Assert horizontal and vertical V2 mirror requests move complete asymmetric cell patches and
      preserve pixels outside the authoritative region.
- [ ] Run
      `backend/.venv/bin/pytest -q backend/tests/test_chart_detection_v2.py backend/tests/test_mirror_api.py`
      and confirm failures are caused by the missing V2 contract.

### Task 2: Introduce typed geometry and candidate models

**Files:**

- Modify: `backend/app/models.py`
- Create: `backend/app/chart_detection/__init__.py`
- Create: `backend/app/chart_detection/types.py`
- Create: `backend/app/chart_detection/geometry.py`

**Interfaces:**

- Produces Pydantic `GridPoint`, `GridEvidenceMetrics`, `GridCellSummary`,
  `GridCandidateV2`, `GridDetectionResultV2`, `GridContractV2`, and
  `DetectionQuadrilateral`.
- Produces internal `LatticeCandidate`, `CellRecord`, `quad_homography()`,
  `rectify_quad()`, `project_grid_line()`, and geometry validators.

- [ ] Add strict V2 models with aliases, 2–300 row/column limits, exactly four ordered points,
      bounded candidate/warning arrays, and no unknown fields.
- [ ] Validate convex clockwise/counter-clockwise-normalized quadrilaterals without accepting
      self-intersections or zero area.
- [ ] Generate canonical boundaries with deterministic rounding:

  ```python
  boundaries = [round(index * extent / cells) for index in range(cells + 1)]
  boundaries[0], boundaries[-1] = 0, extent
  ```

- [ ] Add homography helpers that preserve the original RGBA array and return an explicit inverse
      transform.
- [ ] Run the focused model/geometry tests until green.

### Task 3: Turn the current recognizer into the line evidence source

**Files:**

- Move: `backend/app/detection.py` to `backend/app/chart_detection/line_grid.py`
- Create: `backend/app/detection.py`
- Modify: `backend/app/chart_detection/line_grid.py`

**Interfaces:**

- `detect_line_candidates(source: Image.Image, rectangle: DetectionRectangle | None)
-> tuple[LatticeCandidate, ...]`
- `detect_grid(...) -> GridDetectionResultV2` remains the public service facade.

- [ ] Preserve the current owner-sample behavior as a regression test before changing the module.
- [ ] Convert every viable old `GridFit`, not only the area-ranked winner, into a V2 axis-aligned
      candidate.
- [ ] Replace area-first ordering with evidence ordering and keep area only as a tie-breaker.
- [ ] Mark clear full-span line grids as `explicit-grid` and retain label-band stripping.
- [ ] Run the owner sample and line-grid focused tests until green.

### Task 4: Add periodicity and component lattice evidence

**Files:**

- Create: `backend/app/chart_detection/periodicity.py`
- Create: `backend/app/chart_detection/components.py`
- Create: `backend/app/chart_detection/lattice.py`
- Test: `backend/tests/test_chart_detection_v2.py`

**Interfaces:**

- `period_candidates(signal: np.ndarray, minimum=3, maximum=None)
-> tuple[PeriodHypothesis, ...]`
- `extract_component_observations(rgb: np.ndarray) -> tuple[ComponentObservation, ...]`
- `fit_component_lattices(observations, x_periods, y_periods) -> tuple[LatticeCandidate, ...]`

- [ ] Test that de-meaned linear autocorrelation ranks the 20/24-pixel fundamentals above their
      2× and 5× harmonics for the synthetic fixtures.
- [ ] Implement padded FFT/autocorrelation, local maxima, multiple-period support, and
      higher-peak dominance distance.
- [ ] Test component extraction keeps the repeated ring/filled-cell size family while rejecting
      tiny text and oversized legend/page components.
- [ ] Implement multi-threshold connected-component and contour observations with robust median
      size/circularity filters.
- [ ] Test global lattice assignment returns unique integer `(row, column)` inliers, independent
      X/Y pitch, normalized residual, and the largest coherent lattice group.
- [ ] Implement provisional integer assignment, robust phase selection, inlier filtering, and
      harmonic de-duplication.
- [ ] Run the periodicity/component focused tests until green.

### Task 5: Add quadrilateral proposals, cell records, and candidate ranking

**Files:**

- Create: `backend/app/chart_detection/regions.py`
- Create: `backend/app/chart_detection/cells.py`
- Create: `backend/app/chart_detection/pipeline.py`
- Modify: `backend/app/detection.py`
- Test: `backend/tests/test_chart_detection_v2.py`

**Interfaces:**

- `propose_quadrilaterals(rgb: np.ndarray) -> tuple[QuadrilateralProposal, ...]`
- `extract_cell_records(rectified_rgba, candidate) -> tuple[CellRecord, ...]`
- `analyze_chart(source, image_sha256, constraints) -> GridDetectionResultV2`

- [ ] Test the known projective fixture yields a valid quad proposal and the rectified 13 × 8
      candidate outranks the wrong 5 × 5 macro candidate.
- [ ] Implement multi-scale edge/line masks, closed external contours, convex quad filtering, and
      perspective rectification with bounded proposal count.
- [ ] Test representative Lab sampling excludes borders/holes, occupancy survives black and white
      backgrounds, and the cell matrix digest is stable.
- [ ] Implement inner-cell robust medians, Lab conversion on normalized float input, deterministic
      bounded clustering, uncertainty, and digest generation.
- [ ] Test ranking exposes metrics, warns on close alternatives/boundary uncertainty, returns no
      more than three de-duplicated candidates, and rejects no-lattice images.
- [ ] Implement evidence-first scoring, cross-detector agreement, harmonic penalty, review
      semantics, and stable candidate IDs.
- [ ] Run all backend detection tests until green.

### Task 6: Implement V2 validation and two-path whole-cell rendering

**Files:**

- Modify: `backend/app/mirror.py`
- Modify: `backend/app/service.py`
- Modify: `backend/app/main.py`
- Modify: `backend/tests/test_mirror_api.py`
- Test: `backend/tests/test_chart_detection_v2.py`

**Interfaces:**

- `validate_grid_contract(contract: GridContractV2, image_size: tuple[int, int]) -> None`
- `mirror_cells(source: Image.Image, contract: GridContractV2) -> Image.Image`
- `create_detection_contract(..., quad_text, expected_columns_text, expected_rows_text)`

- [ ] Add failing tests for non-convex/out-of-bounds quads, boundary count/span/order,
      pitch mismatch, stale image, unknown fields, and one-sided row/column constraints.
- [ ] Implement strict parsing and endpoint form fields without adding routes or persistence.
- [ ] Keep a no-interpolation axis-aligned branch that reads every patch from the immutable source.
- [ ] Add a projective branch that rectifies, rearranges cells, inverse-warps only the quad mask,
      and copies all outside pixels directly from the source.
- [ ] Recompute the cell summary before mirror and reject a mismatched matrix digest.
- [ ] Run `backend/.venv/bin/pytest -q` until green.

### Task 7: Add the V2 TypeScript client and backend-owned confirmation state

**Files:**

- Create: `tests/grid-api-client.test.ts`
- Modify: `src/features/grid-api/client.ts`
- Modify: `src/features/grid-editor/confirmationState.ts`
- Modify: `tests/grid-confirmation-state.test.ts`

**Interfaces:**

- `detectGrid(...) -> Promise<GridDetectionResult>`
- `candidateContract(result, candidateId) -> GridDetectionContract`
- `mirrorGrid()` explicitly serializes the selected contract fields.
- `resolveGridConfirmation(contract, acknowledgedCandidateId)` consumes backend `review`.

- [ ] Add failing parser tests for multiple candidates, independent/fractional pitch, valid
      perspective geometry, malformed quads/boundaries, unknown versions, and explicit mirror payload.
- [ ] Implement immutable V2 parsing without accepting display-only or unknown values.
- [ ] Delete local `createGridDimensionContract`; model row/column edits as server constraints.
- [ ] Add confirmation tests that candidate changes reset acknowledgement and backend `review`
      controls submit readiness.
- [ ] Run the three focused TypeScript test files until green.

### Task 8: Integrate candidate selection, projective overlay, and real cancellation

**Files:**

- Create: `src/features/grid-editor/gridDetectionCoordinator.ts`
- Create: `tests/grid-detection-coordinator.test.ts`
- Modify: `src/features/grid-editor/gridEditor.ts`
- Modify: `src/app.ts`
- Modify: `src/main.ts`
- Modify: `src/styles/page.css`
- Modify: `tests/app-markup.test.ts`
- Modify: `tests/editor-canvas-controller.test.ts`

**Interfaces:**

- `createGridDetectionCoordinator()` aborts superseded fetches and retains the previous ready result.
- `GridEditorController` adds `selectCandidate(delta)`, `getCandidatePosition()`, and async
  `adjustDimensions(columns, rows)`.

- [ ] Add failing coordinator tests for actual abort, late success/failure suppression, and
      preserving the last ready result.
- [ ] Implement the coordinator and pass its `AbortSignal` to `detectGrid`.
- [ ] Add candidate picker markup, keyboard-operable previous/next controls, method/cell summary,
      and a multiline error surface.
- [ ] Render all projected grid lines into one SVG path using bilinear interpolation across the
      source quad; keep DOM node count independent of `rows * columns`.
- [ ] Make four corner handles submit `quad` manual constraints and make row/column edits call the
      backend instead of synthesizing geometry.
- [ ] Preserve the previous candidate, overlay, and mirror URL during pending/failed detection;
      invalidate the old mirror only after a successful geometry change.
- [ ] Run focused UI and integration tests until green.

### Task 9: Update canonical documentation and complete validation

**Files:**

- Modify: `docs/PRODUCT_SPEC.zh-CN.md`
- Modify: `backend/README.zh-CN.md`
- Modify: `design-qa.md` only if new browser evidence is captured

**Interfaces:**

- Documents the exact implemented V2 envelope, candidate review semantics, manual constraints,
  lossless/projective distinction, and known identifiability limit.

- [ ] Replace the strict square `cellSize` contract in product specification section 10.
- [ ] Update backend request/response examples and error contracts.
- [ ] Run `backend/.venv/bin/pytest -q`.
- [ ] Run `pnpm test`, `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check`, and
      `pnpm run build`.
- [ ] Run `git diff --check` and review the complete focused diff.
- [ ] Start the local unified service and validate owner-grid plus synthetic ring/filled/projective
      fixtures at 390 and 1440 CSS px; confirm candidate switching, warning acknowledgement, mirror,
      download, failure recovery, and no horizontal overflow.
- [ ] Record any missing real owner fixture as residual calibration risk rather than claiming
      unsupported row/column accuracy.
