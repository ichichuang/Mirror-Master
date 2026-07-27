export type WorkspaceLayoutMode = 'compact' | 'tablet' | 'desktop';

export interface WorkspaceLayout {
  readonly mode: WorkspaceLayoutMode;
  readonly attachSheet: boolean;
  readonly attachInspector: boolean;
  readonly toolRailWidth: number;
  readonly inspectorWidth: number;
  readonly canvasWidth: number;
}

export interface ResponsiveWorkspaceMount {
  readonly inspector: HTMLElement;
  readonly sheet: HTMLElement;
  readonly update: (viewportWidth: number) => WorkspaceLayout;
  readonly destroy: () => void;
}

export interface CreateResponsiveWorkspaceMountOptions {
  readonly root: HTMLElement;
  readonly inspector: HTMLElement;
  readonly sheet: HTMLElement;
}

export type WorkspaceFocusPanel = 'tools' | 'palette' | 'materials' | 'settings';

export interface WorkspaceSurfaceFocusSnapshot {
  readonly panel: WorkspaceFocusPanel;
  readonly target:
    | {
        readonly kind: 'panelTab';
        readonly value: WorkspaceFocusPanel;
      }
    | {
        readonly kind: 'paletteSearch';
        readonly selectionStart: number | null;
        readonly selectionEnd: number | null;
        readonly selectionDirection: 'forward' | 'backward' | 'none' | null;
      }
    | {
        readonly kind: 'tool';
        readonly value: string;
      }
    | {
        readonly kind: 'seriesFilter';
      }
    | {
        readonly kind: 'panelHeading';
      };
}

export function captureWorkspaceSurfaceFocus(
  surface: HTMLElement,
  activeElement: Element | null,
  activePanel: WorkspaceFocusPanel,
): WorkspaceSurfaceFocusSnapshot | null {
  if (!activeElement || !surface.contains(activeElement)) {
    return null;
  }
  const search = activeElement.closest<HTMLInputElement>('[data-color-search]');
  if (search && surface.contains(search)) {
    return Object.freeze({
      panel: activePanel,
      target: Object.freeze({
        kind: 'paletteSearch' as const,
        selectionStart: search.selectionStart,
        selectionEnd: search.selectionEnd,
        selectionDirection: search.selectionDirection,
      }),
    });
  }
  const tool = activeElement.closest<HTMLElement>('[data-tool]');
  if (tool && surface.contains(tool) && tool.dataset.tool) {
    return Object.freeze({
      panel: activePanel,
      target: Object.freeze({ kind: 'tool' as const, value: tool.dataset.tool }),
    });
  }
  const seriesFilter = activeElement.closest<HTMLElement>('[data-color-series-filter]');
  if (seriesFilter && surface.contains(seriesFilter)) {
    return Object.freeze({
      panel: activePanel,
      target: Object.freeze({ kind: 'seriesFilter' as const }),
    });
  }
  const tab = activeElement.closest<HTMLElement>('[role="tab"][data-panel-tab]');
  const panel = tab?.dataset.panelTab;
  if (!tab || !surface.contains(tab) || !isWorkspaceFocusPanel(panel)) {
    return Object.freeze({
      panel: activePanel,
      target: Object.freeze({ kind: 'panelHeading' as const }),
    });
  }
  return Object.freeze({
    panel: activePanel,
    target: Object.freeze({ kind: 'panelTab' as const, value: panel }),
  });
}

export function restoreWorkspaceSurfaceFocus(
  surface: HTMLElement,
  snapshot: WorkspaceSurfaceFocusSnapshot | null,
): HTMLElement | null {
  if (!snapshot) {
    return null;
  }
  const focusTarget = snapshot.target;
  const equivalentTarget =
    focusTarget.kind === 'panelTab'
      ? [...surface.querySelectorAll<HTMLElement>('[role="tab"][data-panel-tab]')].find(
          (candidate) => candidate.dataset.panelTab === focusTarget.value,
        )
      : focusTarget.kind === 'paletteSearch'
        ? (surface.querySelector<HTMLInputElement>('[data-color-search]') ?? undefined)
        : focusTarget.kind === 'tool'
          ? [...surface.querySelectorAll<HTMLElement>('[data-tool]')].find(
              (candidate) => candidate.dataset.tool === focusTarget.value,
            )
          : focusTarget.kind === 'seriesFilter'
            ? (surface.querySelector<HTMLElement>('[data-color-series-filter]') ?? undefined)
            : undefined;
  const target = equivalentTarget ?? panelHeadingFor(surface, snapshot.panel);
  target?.focus({ preventScroll: true });
  const InputElement = surface.ownerDocument.defaultView?.HTMLInputElement;
  if (
    InputElement &&
    target instanceof InputElement &&
    focusTarget.kind === 'paletteSearch' &&
    focusTarget.selectionStart !== null &&
    focusTarget.selectionEnd !== null
  ) {
    target.setSelectionRange(
      focusTarget.selectionStart,
      focusTarget.selectionEnd,
      focusTarget.selectionDirection ?? undefined,
    );
  }
  return target ?? null;
}

export function resolveWorkspaceLayout(viewportWidth: number): WorkspaceLayout {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    throw new Error('视口宽度必须是正数。');
  }
  if (viewportWidth < 768) {
    return Object.freeze({
      mode: 'compact',
      attachSheet: true,
      attachInspector: false,
      toolRailWidth: 0,
      inspectorWidth: 0,
      canvasWidth: viewportWidth,
    });
  }
  if (viewportWidth < 1024) {
    return Object.freeze({
      mode: 'tablet',
      attachSheet: true,
      attachInspector: false,
      toolRailWidth: 0,
      inspectorWidth: 0,
      canvasWidth: viewportWidth,
    });
  }

  const toolRailWidth = Math.round(clamp(viewportWidth * 0.055, 56, 64));
  const inspectorWidth = Math.round(clamp(viewportWidth * 0.23, 304, 344));
  return Object.freeze({
    mode: 'desktop',
    attachSheet: false,
    attachInspector: true,
    toolRailWidth,
    inspectorWidth,
    canvasWidth: viewportWidth - toolRailWidth - inspectorWidth,
  });
}

export function createResponsiveWorkspaceMount({
  root,
  inspector,
  sheet,
}: CreateResponsiveWorkspaceMountOptions): ResponsiveWorkspaceMount {
  if (inspector.parentElement !== root || sheet.parentElement !== root) {
    throw new Error('响应式工作区节点必须直接属于同一个工作区。');
  }
  const document = root.ownerDocument;
  const inspectorAnchor = document.createComment('workspace-inspector');
  const sheetAnchor = document.createComment('workspace-sheet');
  root.insertBefore(inspectorAnchor, inspector);
  root.insertBefore(sheetAnchor, sheet);
  let destroyed = false;

  return Object.freeze({
    inspector,
    sheet,
    update(viewportWidth: number): WorkspaceLayout {
      if (destroyed) {
        throw new Error('响应式工作区已销毁。');
      }
      const layout = resolveWorkspaceLayout(viewportWidth);
      root.dataset.workspaceLayout = layout.mode;
      if (layout.attachInspector) {
        if (inspector.parentElement !== root) {
          root.insertBefore(inspector, sheetAnchor);
        }
      } else if (inspector.parentElement === root) {
        inspector.remove();
      }
      if (layout.attachSheet) {
        if (sheet.parentElement !== root) {
          root.insertBefore(sheet, sheetAnchor.nextSibling);
        }
      } else if (sheet.parentElement === root) {
        sheet.remove();
      }
      return layout;
    },
    destroy(): void {
      if (destroyed) {
        return;
      }
      destroyed = true;
      root.insertBefore(inspector, sheetAnchor);
      root.insertBefore(sheet, sheetAnchor.nextSibling);
      inspectorAnchor.remove();
      sheetAnchor.remove();
      delete root.dataset.workspaceLayout;
    },
  });
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function isWorkspaceFocusPanel(value: string | undefined): value is WorkspaceFocusPanel {
  return value === 'tools' || value === 'palette' || value === 'materials' || value === 'settings';
}

function panelHeadingFor(
  surface: HTMLElement,
  panel: WorkspaceFocusPanel,
): HTMLElement | undefined {
  const panelElement = [...surface.querySelectorAll<HTMLElement>('[data-workspace-panel]')].find(
    (candidate) => candidate.dataset.workspacePanel === panel,
  );
  return panelElement?.querySelector<HTMLElement>('h1, h2, h3, h4, h5, h6') ?? undefined;
}
