import { createKeyedListRenderer, type KeyedListRenderer } from './keyedList';

export type WorkspacePanelId = 'tools' | 'palette' | 'materials' | 'settings';

export interface WorkspaceSelectedColor {
  readonly id: string;
  readonly label: string;
  readonly name: string;
  readonly displayHex: string;
}

export interface WorkspacePaletteColor {
  readonly id: string;
  readonly paletteLabel: string;
  readonly series: string;
  readonly code: string;
  readonly name: string | null;
  readonly displayHex: string;
}

export interface WorkspaceMaterial {
  readonly id: string;
  readonly paletteLabel: string;
  readonly code: string;
  readonly name: string | null;
  readonly displayHex: string;
  readonly count: number;
}

export interface WorkspacePanelsView {
  readonly activePanel: WorkspacePanelId;
  readonly activeTool: string;
  readonly activeToolLabel: string;
  readonly selectionActive: boolean;
  readonly selectedColor: WorkspaceSelectedColor | null;
  readonly paletteColors: readonly WorkspacePaletteColor[];
  readonly materials: readonly WorkspaceMaterial[];
  readonly materialHeading: string;
  readonly materialSize: string;
  readonly materialBoards: string;
  readonly materialBlanks: string;
  readonly settingsHeading: string;
  readonly settingsPalette: string;
  readonly settingsMaximum: string;
  readonly settingsSampling: string;
  readonly settingsDithering: string;
  readonly settingsSize: string;
}

export interface WorkspacePanelsController {
  readonly update: (view: WorkspacePanelsView) => void;
  readonly setActivePanel: (panel: WorkspacePanelId) => void;
  readonly panelFor: (panel: WorkspacePanelId) => HTMLElement;
  readonly colorNodeFor: (colorId: string) => HTMLElement | undefined;
  readonly materialNodeFor: (colorId: string) => HTMLElement | undefined;
  readonly destroy: () => void;
}

interface PaletteSeries {
  readonly series: string;
  readonly colors: readonly WorkspacePaletteColor[];
}

const PANEL_IDS: readonly WorkspacePanelId[] = Object.freeze([
  'tools',
  'palette',
  'materials',
  'settings',
]);

const TOOLS = Object.freeze([
  Object.freeze({ id: 'paint', label: '画笔', icon: 'ph-pencil-simple' }),
  Object.freeze({ id: 'erase', label: '橡皮', icon: 'ph-eraser' }),
  Object.freeze({ id: 'eyedropper', label: '吸管', icon: 'ph-eyedropper' }),
  Object.freeze({ id: 'fill', label: '填充', icon: 'ph-paint-bucket' }),
  Object.freeze({ id: 'select', label: '选择', icon: 'ph-selection' }),
]);

export function createWorkspacePanels(root: HTMLElement): WorkspacePanelsController {
  const document = root.ownerDocument;
  const panels = new Map<WorkspacePanelId, HTMLElement>([
    ['tools', buildToolsPanel(document)],
    ['palette', buildPalettePanel(document)],
    ['materials', buildMaterialsPanel(document)],
    ['settings', buildSettingsPanel(document)],
  ]);
  const createdPanels = PANEL_IDS.map((panel) => requiredPanel(panels, panel));
  root.append(...createdPanels);
  const paletteList = required(requiredPanel(panels, 'palette'), '[data-workspace-palette-list]');
  const materialList = required(
    requiredPanel(panels, 'materials'),
    '[data-workspace-material-list]',
  );
  const colorNodes = new Map<string, HTMLElement>();
  const seriesRenderers = new Map<string, KeyedListRenderer<WorkspacePaletteColor>>();
  let selectedColorId: string | null = null;
  let paletteSignature = '';
  let destroyed = false;

  const seriesRenderer = createKeyedListRenderer<PaletteSeries>({
    container: paletteList,
    keyOf: (group) => group.series,
    create(group) {
      const section = document.createElement('section');
      const heading = document.createElement('h3');
      const list = document.createElement('div');
      section.className = 'palette-series-group';
      section.dataset.paletteSeriesGroup = group.series;
      section.tabIndex = -1;
      heading.dataset.paletteSeriesHeading = '';
      list.dataset.paletteSeriesColors = '';
      list.setAttribute('role', 'group');
      section.append(heading, list);
      const renderer = createKeyedListRenderer<WorkspacePaletteColor>({
        container: list,
        keyOf: (color) => color.id,
        create(color) {
          const button = document.createElement('button');
          const swatch = document.createElement('span');
          const code = document.createElement('small');
          const name = document.createElement('span');
          button.type = 'button';
          button.className = 'palette-swatch';
          button.dataset.colorId = color.id;
          swatch.setAttribute('aria-hidden', 'true');
          code.dataset.workspaceColorCode = '';
          name.className = 'visually-hidden';
          name.dataset.workspaceColorName = '';
          button.append(swatch, code, name);
          colorNodes.set(color.id, button);
          return button;
        },
        update: updateColorNode,
        destroyNode(_element, key) {
          colorNodes.delete(key);
        },
        focusFallback: heading,
      });
      seriesRenderers.set(group.series, renderer);
      return section;
    },
    update(section, group) {
      section.dataset.paletteSeriesGroup = group.series;
      section.setAttribute('aria-label', `${group.series} 系列`);
      setText(section, '[data-palette-series-heading]', `${group.series} 系列`);
      seriesRenderers.get(group.series)?.update(group.colors);
    },
    destroyNode(_section, key) {
      seriesRenderers.get(key)?.destroy();
      seriesRenderers.delete(key);
    },
    focusFallback: required(requiredPanel(panels, 'palette'), '[data-current-color-heading]'),
  });

  const materialRenderer = createKeyedListRenderer<WorkspaceMaterial>({
    container: materialList,
    keyOf: (material) => material.id,
    create() {
      const item = document.createElement('li');
      const swatch = document.createElement('span');
      const identity = document.createElement('span');
      const code = document.createElement('strong');
      const name = document.createElement('small');
      const count = document.createElement('b');
      swatch.className = 'material-swatch';
      swatch.dataset.workspaceMaterialSwatch = '';
      swatch.setAttribute('aria-hidden', 'true');
      code.dataset.workspaceMaterialCode = '';
      name.dataset.workspaceMaterialName = '';
      count.dataset.workspaceMaterialCount = '';
      identity.append(code, name);
      item.append(swatch, identity, count);
      return item;
    },
    update(item, material) {
      item.dataset.materialId = material.id;
      setText(item, '[data-workspace-material-code]', `${material.paletteLabel} ${material.code}`);
      setText(item, '[data-workspace-material-name]', material.name ?? '实物颜色以拼豆为准');
      setText(item, '[data-workspace-material-count]', `${String(material.count)} 颗`);
      required(item, '[data-workspace-material-swatch]').style.setProperty(
        '--swatch',
        material.displayHex,
      );
    },
    focusFallback: required(requiredPanel(panels, 'materials'), '[data-material-heading]'),
  });

  setActivePanel('tools');

  return Object.freeze({
    update(view: WorkspacePanelsView): void {
      assertAlive();
      selectedColorId = view.selectedColor?.id ?? null;
      const uniqueColorIds = new Set(view.paletteColors.map((color) => color.id));
      if (uniqueColorIds.size !== view.paletteColors.length) {
        throw new Error('工作区颜色必须使用唯一稳定键。');
      }
      const nextPaletteSignature = colorSignature(view.paletteColors, selectedColorId);
      if (nextPaletteSignature !== paletteSignature) {
        seriesRenderer.update(groupColors(view.paletteColors));
        paletteSignature = nextPaletteSignature;
      }
      materialRenderer.update(view.materials);
      updateSharedPanelContent(root, view);
      setActivePanel(view.activePanel);
    },
    setActivePanel,
    panelFor(panel: WorkspacePanelId): HTMLElement {
      assertAlive();
      return requiredPanel(panels, panel);
    },
    colorNodeFor(colorId: string): HTMLElement | undefined {
      return colorNodes.get(colorId);
    },
    materialNodeFor(colorId: string): HTMLElement | undefined {
      return materialRenderer.nodeFor(colorId);
    },
    destroy(): void {
      if (destroyed) {
        return;
      }
      destroyed = true;
      seriesRenderer.destroy();
      materialRenderer.destroy();
      for (const panel of createdPanels) {
        panel.remove();
      }
      panels.clear();
      colorNodes.clear();
    },
  });

  function updateColorNode(button: HTMLElement, color: WorkspacePaletteColor): void {
    button.dataset.colorId = color.id;
    button.dataset.colorSeries = color.series;
    button.style.setProperty('--swatch', color.displayHex);
    button.setAttribute(
      'aria-label',
      `色号 ${color.paletteLabel} ${color.code}${color.name ? `，${color.name}` : ''}`,
    );
    const selected = color.id === selectedColorId;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
    setText(button, '[data-workspace-color-code]', color.code);
    setText(button, '[data-workspace-color-name]', color.name ?? '');
  }

  function setActivePanel(panel: WorkspacePanelId): void {
    assertAlive();
    root.dataset.activeWorkspacePanel = panel;
    for (const panelId of PANEL_IDS) {
      const element = requiredPanel(panels, panelId);
      const active = panelId === panel;
      element.hidden = !active;
      element.setAttribute('aria-hidden', String(!active));
    }
  }

  function assertAlive(): void {
    if (destroyed) {
      throw new Error('工作区面板已销毁。');
    }
  }
}

function updateSharedPanelContent(root: HTMLElement, view: WorkspacePanelsView): void {
  setTextAll(root, '[data-tool-heading]', view.activeToolLabel);
  setTextAll(root, '[data-current-color-heading]', view.selectedColor?.label ?? '选择颜色');
  setTextAll(root, '[data-current-color-label]', view.selectedColor?.label ?? '尚未选择颜色');
  setTextAll(
    root,
    '[data-current-color-name]',
    view.selectedColor?.name ?? '点击“颜色”选择拼豆色号',
  );
  for (const swatch of root.querySelectorAll<HTMLElement>('[data-current-color-swatch]')) {
    swatch.style.setProperty('--swatch', view.selectedColor?.displayHex ?? 'transparent');
  }
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-tool]')) {
    const active = button.dataset.tool === view.activeTool;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-clear-selection]')) {
    button.disabled = !view.selectionActive;
  }

  setText(root, '[data-material-heading]', view.materialHeading);
  setText(root, '[data-material-size]', view.materialSize);
  setText(root, '[data-material-boards]', view.materialBoards);
  setText(root, '[data-material-blanks]', view.materialBlanks);
  setText(root, '[data-settings-heading]', view.settingsHeading);
  setText(root, '[data-settings-palette]', view.settingsPalette);
  setText(root, '[data-settings-maximum]', view.settingsMaximum);
  setText(root, '[data-settings-sampling]', view.settingsSampling);
  setText(root, '[data-settings-dithering]', view.settingsDithering);
  setText(root, '[data-settings-size]', view.settingsSize);
}

function buildToolsPanel(document: Document): HTMLElement {
  const panel = panelElement(document, 'tools');
  const heading = panelHeading(document, '编辑工具', 'data-tool-heading');
  const colorRow = document.createElement('div');
  const swatch = document.createElement('span');
  const identity = document.createElement('span');
  const label = document.createElement('strong');
  const name = document.createElement('small');
  const changeColor = document.createElement('button');
  const toolGrid = document.createElement('div');
  const clear = document.createElement('button');
  const note = document.createElement('p');
  colorRow.className = 'current-color-row';
  swatch.className = 'selected-swatch';
  swatch.dataset.currentColorSwatch = '';
  swatch.setAttribute('aria-hidden', 'true');
  label.dataset.currentColorLabel = '';
  name.dataset.currentColorName = '';
  identity.append(label, name);
  changeColor.type = 'button';
  changeColor.className = 'text-button';
  changeColor.dataset.panelTab = 'palette';
  changeColor.textContent = '换颜色';
  colorRow.append(swatch, identity, changeColor);
  toolGrid.className = 'mobile-tool-grid';
  for (const tool of TOOLS) {
    toolGrid.append(toolButton(document, tool.id, tool.label, tool.icon));
  }
  clear.type = 'button';
  clear.className = 'secondary-button full-width';
  clear.dataset.clearSelection = '';
  clear.append(icon(document, 'ph-trash'), document.createTextNode('清空选中区域'));
  note.className = 'panel-note';
  note.textContent =
    '画笔可连续拖动；选择区域后可明确复制、移动、清除或取消。键盘方向键定位，空格应用工具。';
  panel.append(heading, colorRow, toolGrid, clear, note);
  return panel;
}

function buildPalettePanel(document: Document): HTMLElement {
  const panel = panelElement(document, 'palette');
  const heading = panelHeading(document, '当前颜色', 'data-current-color-heading');
  const swatch = document.createElement('span');
  const note = document.createElement('p');
  const list = document.createElement('div');
  swatch.className = 'selected-swatch';
  swatch.dataset.currentColorSwatch = '';
  swatch.setAttribute('aria-hidden', 'true');
  heading.append(swatch);
  note.className = 'panel-note';
  note.textContent = '只显示生成时选定的可用颜色；屏幕颜色是近似预览，备料请以实物为准。';
  list.className = 'palette-grid';
  list.dataset.workspacePaletteList = '';
  list.setAttribute('role', 'list');
  list.setAttribute('aria-label', '项目可用拼豆颜色');
  panel.append(heading, note, list);
  return panel;
}

function buildMaterialsPanel(document: Document): HTMLElement {
  const panel = panelElement(document, 'materials');
  const heading = panelHeading(document, '材料清单', 'data-material-heading');
  const summary = document.createElement('dl');
  const list = document.createElement('ul');
  summary.className = 'material-summary';
  summary.append(
    definitionRow(document, '成品大小', 'data-material-size'),
    definitionRow(document, '拼板', 'data-material-boards'),
    definitionRow(document, '空格', 'data-material-blanks'),
  );
  list.className = 'material-list';
  list.dataset.workspaceMaterialList = '';
  list.dataset.materialList = '';
  panel.append(heading, summary, list);
  return panel;
}

function buildSettingsPanel(document: Document): HTMLElement {
  const panel = panelElement(document, 'settings');
  const heading = panelHeading(document, '图纸设置', 'data-settings-heading');
  const settings = document.createElement('dl');
  const actions = document.createElement('div');
  settings.className = 'settings-list';
  settings.append(
    definitionRow(document, '色板', 'data-settings-palette'),
    definitionRow(document, '最多颜色', 'data-settings-maximum'),
    definitionRow(document, '格子取色', 'data-settings-sampling'),
    definitionRow(document, '颜色过渡', 'data-settings-dithering'),
    definitionRow(document, '成品大小', 'data-settings-size'),
  );
  actions.className = 'panel-actions';
  actions.append(
    mirrorButton(document, 'horizontal', 'ph-arrows-left-right', '左右镜像'),
    mirrorButton(document, 'vertical', 'ph-arrows-down-up', '上下镜像'),
  );
  panel.append(heading, settings, actions);
  return panel;
}

function panelElement(document: Document, panel: WorkspacePanelId): HTMLElement {
  const element = document.createElement('section');
  element.dataset.workspacePanel = panel;
  return element;
}

function panelHeading(document: Document, eyebrow: string, textHook: string): HTMLElement {
  const heading = document.createElement('div');
  const copy = document.createElement('div');
  const label = document.createElement('span');
  const title = document.createElement('h2');
  heading.className = 'panel-heading';
  label.className = 'eyebrow';
  label.textContent = eyebrow;
  title.setAttribute(textHook, '');
  title.tabIndex = -1;
  copy.append(label, title);
  heading.append(copy);
  return heading;
}

function definitionRow(document: Document, term: string, valueHook: string): HTMLElement {
  const row = document.createElement('div');
  const title = document.createElement('dt');
  const value = document.createElement('dd');
  title.textContent = term;
  value.setAttribute(valueHook, '');
  row.append(title, value);
  return row;
}

function toolButton(
  document: Document,
  tool: string,
  label: string,
  iconName: string,
): HTMLButtonElement {
  const button = document.createElement('button');
  const text = document.createElement('span');
  button.type = 'button';
  button.className = 'tool-button';
  button.dataset.tool = tool;
  button.setAttribute('aria-pressed', 'false');
  text.textContent = label;
  button.append(icon(document, iconName), text);
  return button;
}

function mirrorButton(
  document: Document,
  axis: 'horizontal' | 'vertical',
  iconName: string,
  label: string,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary-button';
  button.dataset.matrixMirror = axis;
  button.append(icon(document, iconName), document.createTextNode(label));
  return button;
}

function icon(document: Document, iconName: string): HTMLElement {
  const element = document.createElement('i');
  element.className = `ph ${iconName}`;
  element.setAttribute('aria-hidden', 'true');
  return element;
}

function groupColors(colors: readonly WorkspacePaletteColor[]): readonly PaletteSeries[] {
  const groups = new Map<string, WorkspacePaletteColor[]>();
  for (const color of colors) {
    const group = groups.get(color.series) ?? [];
    group.push(color);
    groups.set(color.series, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) =>
      left.localeCompare(right, 'zh-CN', { numeric: true, sensitivity: 'base' }),
    )
    .map(([series, group]) => Object.freeze({ series, colors: Object.freeze(group) }));
}

function colorSignature(
  colors: readonly WorkspacePaletteColor[],
  selectedColorId: string | null,
): string {
  return `${selectedColorId ?? ''}\u0000${colors
    .map(
      (color) =>
        `${color.id}\u0001${color.paletteLabel}\u0001${color.series}\u0001${color.code}\u0001${
          color.name ?? ''
        }\u0001${color.displayHex}`,
    )
    .join('\u0000')}`;
}

function setTextAll(root: ParentNode, selector: string, text: string): void {
  for (const element of root.querySelectorAll<HTMLElement>(selector)) {
    if (element.textContent !== text) {
      element.textContent = text;
    }
  }
}

function setText(root: ParentNode, selector: string, text: string): void {
  const element = required(root, selector);
  if (element.textContent !== text) {
    element.textContent = text;
  }
}

function required(root: ParentNode, selector: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) {
    throw new Error(`工作区缺少必要节点：${selector}`);
  }
  return element;
}

function requiredPanel(
  panels: ReadonlyMap<WorkspacePanelId, HTMLElement>,
  panel: WorkspacePanelId,
): HTMLElement {
  const element = panels.get(panel);
  if (!element) {
    throw new Error(`工作区缺少 ${panel} 面板。`);
  }
  return element;
}
