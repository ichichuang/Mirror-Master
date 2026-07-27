export interface UiSelectOption {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface UiSelectState {
  readonly open: boolean;
  readonly selectedIndex: number;
  readonly activeIndex: number;
}

export type UiSelectMovement = 'next' | 'previous' | 'home' | 'end';

export function optionDomId(prefix: string, optionId: string): string {
  return `ui-${encodeDomIdPart(prefix)}-option-${encodeDomIdPart(optionId)}`;
}

export function createUiSelectState(
  options: readonly UiSelectOption[],
  selectedId: string,
): UiSelectState {
  const selectedIndex = findEnabledIndex(options, selectedId);
  return { open: false, selectedIndex, activeIndex: selectedIndex };
}

export function openUiSelect(state: UiSelectState): UiSelectState {
  return { ...state, open: true, activeIndex: state.selectedIndex };
}

export function moveActiveOption(
  state: UiSelectState,
  options: readonly UiSelectOption[],
  movement: UiSelectMovement,
): UiSelectState {
  const enabled = enabledIndexes(options);
  if (enabled.length === 0) return state;

  const activePosition = enabled.indexOf(state.activeIndex);
  if (activePosition === -1) {
    const activeIndex = nearestEnabledIndex(enabled, state.activeIndex, movement);
    return activeIndex === undefined ? state : { ...state, activeIndex };
  }
  const currentPosition = activePosition;
  const nextPosition = movementPosition(movement, currentPosition, enabled.length);
  const activeIndex = enabled[nextPosition];
  return activeIndex === undefined ? state : { ...state, activeIndex };
}

export function commitActiveOption(
  state: UiSelectState,
  options: readonly UiSelectOption[],
): UiSelectState {
  const option = options[state.activeIndex];
  if (option === undefined || option.disabled) {
    return { ...state, activeIndex: state.selectedIndex };
  }
  return { open: false, selectedIndex: state.activeIndex, activeIndex: state.activeIndex };
}

function findEnabledIndex(options: readonly UiSelectOption[], selectedId: string): number {
  const selectedIndex = options.findIndex((option) => option.id === selectedId && !option.disabled);
  if (selectedIndex !== -1) return selectedIndex;
  return enabledIndexes(options)[0] ?? -1;
}

function enabledIndexes(options: readonly UiSelectOption[]): number[] {
  return options.flatMap((option, index) => (option.disabled ? [] : [index]));
}

function movementPosition(movement: UiSelectMovement, current: number, count: number): number {
  switch (movement) {
    case 'next':
      return (current + 1) % count;
    case 'previous':
      return (current - 1 + count) % count;
    case 'home':
      return 0;
    case 'end':
      return count - 1;
  }
}

function nearestEnabledIndex(
  enabled: readonly number[],
  current: number,
  movement: UiSelectMovement,
): number | undefined {
  if (movement === 'home') return enabled[0];
  if (movement === 'end') return enabled.at(-1);
  if (movement === 'next') return enabled.find((index) => index > current) ?? enabled[0];
  for (let position = enabled.length - 1; position >= 0; position -= 1) {
    const index = enabled[position];
    if (index !== undefined && index < current) return index;
  }
  return enabled.at(-1);
}

function encodeDomIdPart(value: string): string {
  return Array.from(value, (character) =>
    (character.codePointAt(0) ?? 0).toString(16).padStart(6, '0'),
  ).join('');
}
