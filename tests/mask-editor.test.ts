import assert from 'node:assert/strict';
import test from 'node:test';

import {
  brushSizeToImageRadius,
  clientPointToImagePoint,
  fitMaskFrame,
  imageRadiusToScreen,
} from '../src/features/mask-editor/maskEditGeometry';
import {
  clampBrushSize,
  createMaskEditSession,
  MASK_EDIT_DEFAULT_BRUSH_SIZE,
} from '../src/features/mask-editor/maskEditSession';
import {
  extractMaskValues,
  fillHighlightOverlay,
  highlightColorFromHex,
  highlightColorToCssRgba,
  highlightColorToHex,
  HIGHLIGHT_OUTLINE_ALPHA,
  MASK_HIGHLIGHT_COLOR,
} from '../src/features/mask-editor/maskEditCanvas';

test('fitMaskFrame 按图片宽高比适配显示区域', () => {
  assert.deepEqual(fitMaskFrame(800, 600, 400, 300), { width: 800, height: 600 });
  assert.deepEqual(fitMaskFrame(800, 600, 300, 400), { width: 450, height: 600 });
  assert.deepEqual(fitMaskFrame(0, 600, 300, 400), { width: 0, height: 0 });
});

test('clientPointToImagePoint 把客户端坐标换算为图片像素坐标并裁剪', () => {
  const frame = { left: 100, top: 50, width: 400, height: 300 };
  assert.deepEqual(clientPointToImagePoint(300, 200, frame, 800, 600), { x: 400, y: 300 });
  assert.deepEqual(clientPointToImagePoint(0, 0, frame, 800, 600), { x: 0, y: 0 });
  assert.deepEqual(clientPointToImagePoint(9999, 9999, frame, 800, 600), { x: 800, y: 600 });
});

test('brushSizeToImageRadius 按滑杆映射到图片像素半径', () => {
  assert.equal(brushSizeToImageRadius(1, 1000, 800, 512), 2);
  assert.equal(brushSizeToImageRadius(100, 1000, 800, 512), 160);
  assert.equal(brushSizeToImageRadius(100, 4000, 4000, 512), 512);
});

test('imageRadiusToScreen 与 clientPointToImagePoint 尺度一致', () => {
  const frame = { left: 0, top: 0, width: 500, height: 250 };
  assert.equal(imageRadiusToScreen(100, frame, 1000), 50);
});

test('clampBrushSize 限制滑杆范围', () => {
  assert.equal(clampBrushSize(0), 1);
  assert.equal(clampBrushSize(101), 100);
  assert.equal(clampBrushSize(Number.NaN), MASK_EDIT_DEFAULT_BRUSH_SIZE);
});

test('mask edit session 笔刷队列：完成笔刷进入待发送，取走后进入在途', () => {
  const session = createMaskEditSession<string>({ maxUndo: 3 });
  session.beginStroke(10, 10, 8);
  session.extendStroke(20, 20);
  const stroke = session.endStroke();
  assert.ok(stroke);
  assert.equal(stroke.mode, 'remove');
  assert.equal(stroke.radius, 8);
  assert.deepEqual(
    stroke.points.map((point) => [point.x, point.y]),
    [
      [10, 10],
      [20, 20],
    ],
  );
  assert.equal(session.pendingStrokes().length, 1);

  const taken = session.takePendingForRefine();
  assert.equal(taken.length, 1);
  assert.equal(session.pendingStrokes().length, 0);
  assert.equal(session.inFlightStrokes().length, 1);
  // 在途期间不能重复取
  assert.equal(session.takePendingForRefine().length, 0);
  session.acknowledgeRefine();
  assert.equal(session.inFlightStrokes().length, 0);
});

test('mask edit session 精修失败时把在途笔刷放回待发送队首', () => {
  const session = createMaskEditSession<string>({ maxUndo: 3 });
  session.beginStroke(1, 1, 4);
  session.endStroke();
  session.takePendingForRefine();
  session.beginStroke(2, 2, 4);
  session.endStroke();
  session.requeueInFlight();
  assert.equal(session.pendingStrokes().length, 2);
  assert.equal(session.pendingStrokes()[0]?.points[0]?.x, 1);
});

test('mask edit session 撤销栈有上限并能丢弃最后一条待发送笔刷', () => {
  const session = createMaskEditSession<string>({ maxUndo: 2 });
  session.pushUndo('a');
  session.pushUndo('b');
  session.pushUndo('c');
  assert.equal(session.undoDepth(), 2);
  assert.equal(session.popUndo(), 'c');
  session.beginStroke(5, 5, 4);
  session.endStroke();
  const dropped = session.dropLastPending();
  assert.ok(dropped);
  assert.equal(session.pendingStrokes().length, 0);
  assert.equal(session.popUndo(), 'b');
  assert.equal(session.popUndo(), undefined);
});

test('mask edit session 切模式影响后续笔刷', () => {
  const session = createMaskEditSession<string>({ maxUndo: 1 });
  session.setBrushMode('keep');
  session.beginStroke(3, 3, 6);
  const stroke = session.endStroke();
  assert.equal(stroke?.mode, 'keep');
});

test('fillHighlightOverlay 只给蒙版值小于 128 的像素着色', () => {
  const maskValues = new Uint8ClampedArray([0, 127, 128, 255]);
  const target = new Uint8ClampedArray(4 * 4);
  fillHighlightOverlay(maskValues, target, 4, 1);
  // 像素 0、1 着色
  assert.equal(target[0], MASK_HIGHLIGHT_COLOR.r);
  assert.equal(target[4], MASK_HIGHLIGHT_COLOR.r);
  // 像素 2、3 完全透明
  assert.equal(target[11], 0);
  assert.equal(target[15], 0);
});

test('fillHighlightOverlay 给选区边界像素更强的描边不透明度', () => {
  // 3x3：中心保留，周围去除 —— 与保留区相邻的去除像素是边界
  const maskValues = new Uint8ClampedArray([0, 0, 0, 0, 255, 0, 0, 0, 0]);
  const target = new Uint8ClampedArray(9 * 4);
  fillHighlightOverlay(maskValues, target, 3, 3);
  // 与保留像素相邻的边界（如像素 1）使用描边不透明度
  assert.equal(target[1 * 4 + 3], HIGHLIGHT_OUTLINE_ALPHA);
  // 远离边界的去除像素（角落 8 与中心保留相邻？角落与像素 5 相邻 —— 像素 5 是去除）
  // 角落 0 的右/下邻居都是去除区 → 非边界，使用填充不透明度
  assert.equal(target[0 * 4 + 3], MASK_HIGHLIGHT_COLOR.alpha);
  // 自定义颜色生效
  const customTarget = new Uint8ClampedArray(9 * 4);
  const custom = highlightColorFromHex('#1570EF');
  fillHighlightOverlay(maskValues, customTarget, 3, 3, custom);
  assert.equal(customTarget[0], 0x15);
  assert.equal(customTarget[1], 0x70);
  assert.equal(customTarget[2], 0xef);
});

test('highlightColorFromHex 解析颜色并在非法输入时回退主题色', () => {
  assert.deepEqual(highlightColorFromHex('#d92d20'), {
    r: 0xd9,
    g: 0x2d,
    b: 0x20,
    alpha: MASK_HIGHLIGHT_COLOR.alpha,
  });
  assert.equal(highlightColorFromHex('not-a-color').r, MASK_HIGHLIGHT_COLOR.r);
});

test('highlightColor 往返转换与 CSS rgba 输出', () => {
  const color = highlightColorFromHex('#12B76A');
  assert.equal(highlightColorToHex(color), '#12b76a');
  assert.equal(highlightColorToCssRgba(color), 'rgba(18, 183, 106, 0.51)');
});

test('extractMaskValues 取 r 通道作为蒙版值', () => {
  const data = new Uint8ClampedArray([200, 200, 200, 255, 10, 10, 10, 255]);
  const bitmap = { width: 2, height: 1, data } as ImageData;
  assert.deepEqual([...extractMaskValues(bitmap)], [200, 10]);
});
