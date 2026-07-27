export interface PaletteControlColor {
  readonly id: string;
  readonly paletteId: string;
  readonly series: string;
  readonly code: string;
  readonly displayHex: string;
  readonly name: string | null;
}

export interface PaletteFilterOptions {
  readonly availableColorIds: readonly string[];
  readonly query?: string;
  readonly series?: string;
  readonly scope?: 'all' | 'used' | 'recent';
  readonly usedColorIds?: readonly string[];
  readonly recentColorIds?: readonly string[];
}

export const ALL_SERIES_SELECT_VALUE = '__all__';

export function paletteSeriesToSelectValue(series: string): string {
  return series || ALL_SERIES_SELECT_VALUE;
}

export function paletteSeriesFromSelectValue(selectedValue: string): string {
  return selectedValue === ALL_SERIES_SELECT_VALUE ? '' : selectedValue;
}

export function filterPaletteColors<Color extends PaletteControlColor>(
  colors: readonly Color[],
  options: PaletteFilterOptions,
): readonly Color[] {
  const available = new Set(options.availableColorIds);
  const query = normalizeSearch(options.query ?? '');
  const series = normalizeSearch(options.series ?? '');
  const scope = options.scope ?? 'all';
  const used = new Set(options.usedColorIds ?? []);
  const recentOrder = new Map(
    (options.recentColorIds ?? []).map((colorId, index) => [colorId, index]),
  );
  const filtered = colors.filter((color) => {
    if (!available.has(color.id)) {
      return false;
    }
    if (series && normalizeSearch(color.series) !== series) {
      return false;
    }
    if (scope === 'used' && !used.has(color.id)) {
      return false;
    }
    if (scope === 'recent' && !recentOrder.has(color.id)) {
      return false;
    }
    if (!query) {
      return true;
    }
    return normalizeSearch(
      [
        color.id,
        color.paletteId,
        color.series,
        color.code,
        color.displayHex,
        color.name ?? '',
      ].join(' '),
    ).includes(query);
  });

  if (scope === 'recent') {
    filtered.sort(
      (left, right) =>
        (recentOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (recentOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER),
    );
  }

  return Object.freeze(filtered);
}

export interface PaletteSeriesGroup<Color extends PaletteControlColor> {
  readonly series: string;
  readonly colors: readonly Color[];
}

export function groupPaletteColorsBySeries<Color extends PaletteControlColor>(
  colors: readonly Color[],
): readonly PaletteSeriesGroup<Color>[] {
  const groups = new Map<string, Color[]>();
  for (const color of colors) {
    const group = groups.get(color.series);
    if (group) {
      group.push(color);
    } else {
      groups.set(color.series, [color]);
    }
  }

  return Object.freeze(
    [...groups.entries()]
      .sort(([left], [right]) =>
        left.localeCompare(right, 'zh-CN', { numeric: true, sensitivity: 'base' }),
      )
      .map(([series, seriesColors]) =>
        Object.freeze({ series, colors: Object.freeze(seriesColors) }),
      ),
  );
}

export function pushRecentColor(
  recentColorIds: readonly string[],
  colorId: string,
  limit = 8,
): readonly string[] {
  const normalizedId = colorId.trim();
  const normalizedLimit = Math.max(0, Math.floor(limit));
  if (!normalizedId || normalizedLimit === 0) {
    return Object.freeze([]);
  }
  return Object.freeze(
    [normalizedId, ...recentColorIds.filter((entry) => entry !== normalizedId)].slice(
      0,
      normalizedLimit,
    ),
  );
}

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase('zh-CN');
}
