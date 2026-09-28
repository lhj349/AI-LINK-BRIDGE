"use strict";

function pixelBounds(bounds) {
  const values = ['left', 'top', 'right', 'bottom'].map(key => Number(bounds[key]));
  if (!values.every(Number.isFinite) || values[2] <= values[0] || values[3] <= values[1]) {
    throw new Error('所选图层没有可导出的有效图片范围。');
  }
  const [left, top, right, bottom] = [Math.floor(values[0]), Math.floor(values[1]), Math.ceil(values[2]), Math.ceil(values[3])];
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function placement(quad, target) {
  if (!Array.isArray(quad) || quad.length !== 8 || !quad.every(Number.isFinite)) throw new Error('无法读取返回图片的完整尺寸。');
  const [l,t,r,t2,r2,b,l2,b2] = quad;
  if (r <= l || b <= t || Math.abs(t2-t)>0.01 || Math.abs(r2-r)>0.01 || Math.abs(l2-l)>0.01 || Math.abs(b2-b)>0.01) {
    throw new Error('返回图层存在旋转或无效变换，已停止回贴。');
  }
  return {scaleX: target.width/(r-l)*100, scaleY: target.height/(b-t)*100, dx: target.left-l, dy:target.top-t};
}

module.exports = {pixelBounds, placement};
