"use strict";
const {pixelBounds, placement} = require('./geometry');

function createRepaint({app, action, core, constants}, storage) {
  async function play(command) {
    const result = await action.batchPlay([command], {});
    if (!result || !result[0] || result[0]._obj === 'error') {
      throw new Error(result?.[0]?.message || 'Photoshop 操作失败。');
    }
    return result[0];
  }
  function findLayer(layers, id) {
    for (const layer of layers) {
      if (layer.id === id) return layer;
      if (layer.layers) {
        const found = findLayer(layer.layers, id);
        if (found) return found;
      }
    }
    return null;
  }
  const descriptor = (docId, layerId) => play({_obj:'get',_target:[{_ref:'layer',_id:layerId},{_ref:'document',_id:docId}],_options:{dialogOptions:'dontDisplay'}});

  async function exportLayer() {
    return core.executeAsModal(async () => {
      const doc = app.activeDocument;
      if (!doc) throw new Error('请先打开原文档。');
      if (doc.activeLayers.length !== 1) throw new Error('局部重绘请只选择一个图片图层。');
      const source = doc.activeLayers[0];
      if (![constants.LayerKind.NORMAL, constants.LayerKind.SMARTOBJECT].includes(source.kind)) {
        throw new Error('请选择像素图层或智能对象；图层组、文字和调整图层请先复制并转换为智能对象。');
      }
      const info = await descriptor(doc.id, source.id);
      if (info.group) throw new Error('剪贴图层依赖其他图层，请先复制并合成独立图片后重绘。');
      const bounds = pixelBounds(source.bounds);
      const target = {documentId:doc.id,layerId:source.id,layerName:source.name,bounds};
      const folder = await storage.localFileSystem.getTemporaryFolder();
      const file = await folder.createFile(`ai-link-layer-${Date.now()}.png`, {overwrite:true});
      let temp;
      try {
        temp = await app.documents.add({name:'AI Link 临时导出',width:bounds.width,height:bounds.height,resolution:doc.resolution,mode:'RGBColorMode',fill:'transparent',depth:8});
        app.activeDocument = doc;
        const copied = await source.duplicate(temp);
        app.activeDocument = temp;
        copied.allLocked = false;
        copied.visible = true;
        const copiedBounds = pixelBounds(copied.bounds);
        if (copiedBounds.width !== bounds.width || copiedBounds.height !== bounds.height) {
          throw new Error('图层复制后的尺寸发生变化，已停止导出以避免错位。');
        }
        await copied.translate(-copiedBounds.left, -copiedBounds.top);
        await temp.saveAs.png(file, {}, true);
        const buffer = await file.read({format:storage.formats.binary});
        if (!buffer.byteLength || buffer.byteLength > 10*1024*1024) {
          throw new Error('所选图层 PNG 为空或超过 10 MiB，请缩小图层后重试。');
        }
        return {buffer, target};
      } finally {
        try { if (temp) await temp.closeWithoutSaving(); }
        finally { app.activeDocument = doc; }
        try { await file.delete(); } catch (_) { /* UXP temporary storage will reclaim it. */ }
      }
    }, {commandName:'导出所选图层用于重绘'});
  }

  async function place(token, target) {
    await core.executeAsModal(async (context) => {
      const doc = Array.from(app.documents).find(item => item.id === target.documentId);
      if (!doc) throw new Error('原文档已关闭，无法回贴重绘结果。');
      const source = findLayer(doc.layers, target.layerId);
      if (!source) throw new Error('原图层已删除，无法定位重绘结果。');
      app.activeDocument = doc;
      const history = await context.hostControl.suspendHistory({documentID:doc.id,name:'AI 所选图层重绘'});
      let success = false;
      try {
        await play({_obj:'select',_target:[{_ref:'layer',_id:source.id}],makeVisible:false,_options:{dialogOptions:'dontDisplay'}});
        await play({_obj:'placeEvent',null:{_path:token,_kind:'local'},_options:{dialogOptions:'dontDisplay'}});
        const result = doc.activeLayers[0];
        if (!result || result.id === source.id) throw new Error('未创建重绘结果图层。');
        const quad = async () => (await descriptor(doc.id,result.id)).smartObjectMore?.transform;
        const size = placement(await quad(), target.bounds);
        await result.scale(size.scaleX,size.scaleY,constants.AnchorPosition.TOPLEFT);
        const position = placement(await quad(), target.bounds);
        await result.translate(position.dx,position.dy);
        const final = await quad();
        const b = target.bounds;
        const expected = [b.left,b.top,b.left+b.width,b.top,b.left+b.width,b.top+b.height,b.left,b.top+b.height];
        if (!final || final.some((v,i)=>!Number.isFinite(v)||Math.abs(v-expected[i])>1)) {
          throw new Error('重绘结果未能精确匹配原尺寸和位置，已撤销此次回贴。');
        }
        await result.move(source,constants.ElementPlacement.PLACEBEFORE);
        result.name = `${target.layerName} · AI重绘`;
        success = true;
      } finally {
        await context.hostControl.resumeHistory(history,success);
      }
    }, {commandName:'重绘结果按原位回贴'});
  }

  return {exportLayer, place};
}
module.exports = {createRepaint};
