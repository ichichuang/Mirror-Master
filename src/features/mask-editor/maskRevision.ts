export interface MaskRevisionGuard {
  readonly current: () => number;
  readonly advance: () => number;
  readonly capture: () => number;
  readonly accepts: (revision: number) => boolean;
}

export function createMaskRevisionGuard(): MaskRevisionGuard {
  let revision = 0;
  return Object.freeze({
    current: () => revision,
    advance: () => {
      revision += 1;
      return revision;
    },
    capture: () => revision,
    accepts: (candidate: number) => candidate === revision,
  });
}
