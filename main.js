const { app, action, core } = require("photoshop");
const { storage } = require("uxp");

const els = {};
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const BRIDGE_SERVER_URL = "http://127.0.0.1:3187";
const PROVIDER_NAMES = {
  doubao: "豆包",
  qwen: "通义千问",
  openai: "ChatGPT"
};
let selectedProvider = "doubao";
const logEntries = [];

function byId(id) {
  return document.getElementById(id);
}

function setStatus(message, isError = false) {
  const timestamp = new Date().toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  logEntries.push(`[${timestamp}] ${isError ? "失败: " : ""}${message}`);
  if (logEntries.length > 30) logEntries.shift();
  els.status.textContent = logEntries.join("\n");
  els.status.style.color = isError ? "#fecaca" : "#b8b8b8";
  els.status.style.borderColor = isError ? "#7f1d1d" : "#3a3a3a";
  els.status.scrollTop = els.status.scrollHeight;
}

function setBusy(isBusy) {
  els.runButton.disabled = isBusy;
  els.runButton.textContent = isBusy ? "等待网页 AI 出图..." : "开始生成";
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function base64ByteLength(base64) {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("无法处理当前画布的 PNG 文件。"));
    image.src = source;
  });
}

async function fitJpegWithinLimit(base64, onProgress) {
  const originalBytes = base64ByteLength(base64);
  if (originalBytes <= MAX_UPLOAD_BYTES) {
    onProgress(`当前画布 JPEG 为 ${(originalBytes / 1024 / 1024).toFixed(2)} MiB，正在上传...`);
    return base64;
  }

  const image = await loadImage(`data:image/jpeg;base64,${base64}`);
  const originalWidth = image.naturalWidth || image.width;
  const originalHeight = image.naturalHeight || image.height;
  if (!originalWidth || !originalHeight) {
    throw new Error("无法读取画布导出 JPEG 的尺寸，无法安全适配 10 MiB 上限。");
  }

  let scale = Math.sqrt(MAX_UPLOAD_BYTES / originalBytes) * 0.97;
  let result = base64;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const width = Math.max(1, Math.floor(originalWidth * scale));
    const height = Math.max(1, Math.floor(originalHeight * scale));
    onProgress(`原图超过 10 MiB，正在无损编码并适配为 ${width} x ${height}...`);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法创建 JPEG 尺寸适配画布。");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);

    // 0.9 is a high-quality JPEG fallback used only when the file still exceeds 10 MiB.
    result = canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
    if (base64ByteLength(result) <= MAX_UPLOAD_BYTES) return result;
    scale *= Math.sqrt(MAX_UPLOAD_BYTES / base64ByteLength(result)) * 0.97;
  }

  throw new Error("当前画布即使适配后仍无法控制在 10 MiB 内，请先降低画布像素尺寸后重试。");
}

async function ensureActiveDocument() {
  if (!app.activeDocument) throw new Error("请先在 Photoshop 打开一个文档。");
  return app.activeDocument;
}

async function exportCurrentCanvas(onProgress) {
  const fs = storage.localFileSystem;
  const documentRef = await ensureActiveDocument();
  const tempFolder = await fs.getTemporaryFolder();
  const file = await tempFolder.createFile(`ai-link-source-${Date.now()}.jpg`, { overwrite: true });

  await core.executeAsModal(async () => {
    await documentRef.saveAs.jpg(file, { quality: 10 }, true);
  }, { commandName: "Export Canvas For Browser AI" });

  const base64 = arrayBufferToBase64(await file.read({ format: storage.formats.binary }));
  return {
    mimeType: "image/jpeg",
    base64: await fitJpegWithinLimit(base64, onProgress)
  };
}

function detectImageFormat(base64Image) {
  const binary = atob(base64Image.slice(0, 32));
  const byte = (index) => binary.charCodeAt(index);
  if (byte(0) === 0x89 && binary.slice(1, 4) === "PNG") return { mimeType: "image/png", extension: "png" };
  if (byte(0) === 0xff && byte(1) === 0xd8 && byte(2) === 0xff) return { mimeType: "image/jpeg", extension: "jpg" };
  if (binary.slice(0, 4) === "RIFF" && binary.slice(8, 12) === "WEBP") return { mimeType: "image/webp", extension: "webp" };
  if (binary.slice(0, 3) === "GIF") return { mimeType: "image/gif", extension: "gif" };
  throw new Error("网页返回的文件不是有效图片，已停止置入，避免 Photoshop 弹出格式错误窗口。");
}

async function placeImageAsNewLayer(base64Image, reportedMimeType) {
  const fs = storage.localFileSystem;
  const tempFolder = await fs.getTemporaryFolder();
  const format = detectImageFormat(base64Image);
  if (reportedMimeType && reportedMimeType !== format.mimeType) {
    setStatus(`网页标注为 ${reportedMimeType}，实际检测为 ${format.mimeType}；已按实际格式处理。`);
  }
  const file = await tempFolder.createFile(`ai-link-result-${Date.now()}.${format.extension}`, { overwrite: true });
  await file.write(base64ToArrayBuffer(base64Image), { format: storage.formats.binary });
  const token = fs.createSessionToken(file);

  await core.executeAsModal(async () => {
    await action.batchPlay([{ _obj: "placeEvent", null: { _path: token, _kind: "local" }, _options: { dialogOptions: "dontDisplay" } }], {});
  }, { commandName: "Place Browser AI Result" });
}

async function callBridgeServer(payload) {
  let response;
  try {
    response = await fetch(`${payload.serverUrl.replace(/\/$/, "")}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    throw new Error("无法连接本地桥接服务。请在项目目录运行：cd server; node index.js");
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `本地服务请求失败 (${response.status})`);
  return result;
}

async function runWorkflow() {
  const prompt = els.prompt.value.trim();
  const provider = selectedProvider;
  if (!prompt) throw new Error("请输入出图指令。");
  if (!provider) throw new Error("请选择一个目标平台。");

  setBusy(true);
  try {
    setStatus("正在导出当前画布...");
    const sourceImage = await exportCurrentCanvas(setStatus);
    setStatus("任务已交给浏览器扩展，请保持目标网页打开...");
    const result = await callBridgeServer({
      provider,
      prompt,
      serverUrl: BRIDGE_SERVER_URL,
      imageBase64: sourceImage ? sourceImage.base64 : null,
      imageMimeType: sourceImage ? sourceImage.mimeType : null
    });
    setStatus("已获取网页生成结果，正在贴回 Photoshop...");
    await placeImageAsNewLayer(result.imageBase64, result.imageMimeType);
    setStatus(`完成：${PROVIDER_NAMES[provider]} 的结果已置入新图层。`);
  } finally {
    setBusy(false);
  }
}

function init() {
  ["prompt", "runButton", "clearLog", "status"].forEach((id) => {
    els[id] = byId(id);
  });
  document.querySelectorAll(".provider-card").forEach((card) => {
    const selectProvider = () => {
      selectedProvider = card.dataset.provider;
      document.querySelectorAll(".provider-card").forEach((card) => {
        const isSelected = card.dataset.provider === selectedProvider;
        card.classList.toggle("is-selected", isSelected);
        card.setAttribute("aria-checked", String(isSelected));
      });
      setStatus(`已选择 ${PROVIDER_NAMES[selectedProvider]}。`);
    };
    card.addEventListener("click", selectProvider);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectProvider();
      }
    });
  });
  els.clearLog.addEventListener("click", () => {
    logEntries.length = 0;
    els.status.textContent = "日志已清空。";
    els.status.style.color = "#b8b8b8";
    els.status.style.borderColor = "#3a3a3a";
  });
  els.runButton.addEventListener("click", async () => {
    try {
      await runWorkflow();
    } catch (error) {
      setStatus(error.message || String(error), true);
    }
  });
}

init();
