const SCHEMA_VERSION = 1;
const FILE_NAMES = ["prompt-presets-a.json", "prompt-presets-b.json"];

function cleanName(value) {
  return String(value || "").trim();
}

function cleanPrompt(value) {
  return String(value || "").trim();
}

function validateDocument(value) {
  if (!value || value.version !== SCHEMA_VERSION || !Number.isInteger(value.revision) || !Array.isArray(value.items)) {
    throw new Error("提示词预设文件格式无效。原文件已保留，请先备份或删除损坏文件。");
  }
  const names = new Set();
  const items = value.items.map((item) => {
    const id = cleanName(item && item.id);
    const name = cleanName(item && item.name);
    const prompt = cleanPrompt(item && item.prompt);
    if (!id || !name || !prompt || names.has(name.toLocaleLowerCase())) throw new Error("提示词预设文件包含无效或重名记录。");
    names.add(name.toLocaleLowerCase());
    return { id, name, prompt };
  });
  return { version: SCHEMA_VERSION, revision: value.revision, items };
}

function createPresetStore(localFileSystem, formats) {
  let document = { version: SCHEMA_VERSION, revision: 0, items: [] };
  let nextSlot = 0;
  let hasCorruptStorage = false;

  async function readSlot(folder, fileName) {
    const entries = await folder.getEntries();
    const file = entries.find((entry) => entry.name === fileName);
    if (!file) return null;
    const text = await file.read({ format: formats.utf8 });
    return validateDocument(JSON.parse(text));
  }

  async function load() {
    const folder = await localFileSystem.getDataFolder();
    const results = [];
    let corrupt = false;
    for (let index = 0; index < FILE_NAMES.length; index += 1) {
      try {
        const value = await readSlot(folder, FILE_NAMES[index]);
        if (value) results.push({ value, index });
      } catch (_) {
        corrupt = true;
      }
    }
    hasCorruptStorage = corrupt;
    if (!results.length && corrupt) throw new Error("提示词预设文件已损坏，原文件已保留，没有自动覆盖。");
    if (results.length) {
      results.sort((a, b) => b.value.revision - a.value.revision);
      document = results[0].value;
      nextSlot = results[0].index === 0 ? 1 : 0;
    }
    return list();
  }

  function list() {
    return document.items.map((item) => ({ ...item }));
  }

  async function persist(items) {
    if (hasCorruptStorage) throw new Error("检测到损坏的预设文件，已停止写入以保留原文件。");
    const candidate = validateDocument({ version: SCHEMA_VERSION, revision: document.revision + 1, items });
    const folder = await localFileSystem.getDataFolder();
    const file = await folder.createFile(FILE_NAMES[nextSlot], { overwrite: true });
    const serialized = JSON.stringify(candidate, null, 2);
    await file.write(serialized, { format: formats.utf8 });
    validateDocument(JSON.parse(await file.read({ format: formats.utf8 })));
    document = candidate;
    nextSlot = nextSlot === 0 ? 1 : 0;
    return list();
  }

  function validateInput(name, prompt, exceptId = null) {
    const normalizedName = cleanName(name);
    const normalizedPrompt = cleanPrompt(prompt);
    if (!normalizedName) throw new Error("请输入预设名称。");
    if (!normalizedPrompt) throw new Error("提示词不能为空。");
    if (document.items.some((item) => item.id !== exceptId && item.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase())) {
      throw new Error("已经有同名预设，请换一个名称。");
    }
    return { name: normalizedName, prompt: normalizedPrompt };
  }

  async function create(name, prompt) {
    const input = validateInput(name, prompt);
    const id = `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await persist([...document.items, { id, ...input }]);
    return id;
  }

  async function update(id, name, prompt) {
    if (!document.items.some((item) => item.id === id)) throw new Error("请先选择要更新的预设。");
    const input = validateInput(name, prompt, id);
    await persist(document.items.map((item) => item.id === id ? { id, ...input } : item));
  }

  async function remove(id) {
    if (!document.items.some((item) => item.id === id)) throw new Error("请先选择要删除的预设。");
    await persist(document.items.filter((item) => item.id !== id));
  }

  return { load, list, create, update, remove };
}

module.exports = { createPresetStore, validateDocument };
