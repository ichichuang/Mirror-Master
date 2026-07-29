from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True, slots=True)
class PeriodHypothesis:
    period: float
    score: float
    harmonic_margin: float


def period_candidates(
    signal: np.ndarray,
    *,
    minimum: int = 3,
    maximum: int | None = None,
) -> tuple[PeriodHypothesis, ...]:
    values = np.asarray(signal, dtype=np.float64).reshape(-1)
    if values.size < minimum * 3:
        return ()
    values = values - float(values.mean())
    energy = float(np.dot(values, values))
    if energy <= 1e-9:
        return ()

    padded_size = 1 << (values.size * 2 - 1).bit_length()
    spectrum = np.fft.rfft(values, n=padded_size)
    correlation = np.fft.irfft(spectrum * np.conjugate(spectrum))[
        : values.size
    ]
    overlap = np.arange(values.size, 0, -1, dtype=np.float64)
    correlation = correlation / np.maximum(overlap, 1)
    correlation /= max(float(correlation[0]), 1e-9)

    upper = min(
        maximum if maximum is not None else values.size // 3,
        values.size // 2,
    )
    if upper < minimum:
        return ()

    local_peaks: list[int] = []
    for lag in range(minimum, upper + 1):
        left = correlation[lag - 1]
        center = correlation[lag]
        right = correlation[lag + 1] if lag + 1 < values.size else -1
        if center > 0.03 and center >= left and center >= right:
            local_peaks.append(lag)

    hypotheses: list[PeriodHypothesis] = []
    for lag in local_peaks:
        supports = [
            max(0.0, float(correlation[multiple]))
            for multiple in range(lag, upper + 1, lag)
        ]
        support_score = sum(
            value / (index + 1) for index, value in enumerate(supports)
        ) / sum(1 / (index + 1) for index in range(len(supports)))
        divisor_peak = max(
            (
                float(correlation[round(lag / divisor)])
                for divisor in range(2, 7)
                if round(lag / divisor) >= minimum
            ),
            default=0.0,
        )
        harmonic_margin = max(
            0.0, min(1.0, support_score - max(0.0, divisor_peak) + 0.35)
        )
        hypotheses.append(
            PeriodHypothesis(
                period=float(lag),
                score=max(0.0, min(1.0, support_score)),
                harmonic_margin=harmonic_margin,
            )
        )

    hypotheses.sort(
        key=lambda item: (
            item.score + item.harmonic_margin * 0.35,
            -item.period,
        ),
        reverse=True,
    )
    selected: list[PeriodHypothesis] = []
    for hypothesis in hypotheses:
        if any(
            abs(hypothesis.period - existing.period) <= 1
            for existing in selected
        ):
            continue
        selected.append(hypothesis)
        if len(selected) == 8:
            break
    return tuple(selected)
