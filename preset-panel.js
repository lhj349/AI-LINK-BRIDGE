function createPresetPanel(options) {
  const { store, elements, notify, confirmDelete } = options;
  let busy = false;

  function showView(name) {
    const generation = name === "generation";
    elements.generationView.hidden = !generation;
    elements.libraryView.hidden = generation;
    elements.generationTab.classList.toggle("is-selected", generation);
    elements.libraryTab.classList.toggle("is-selected", !generation);
    elements.generationTab.setAttribute("aria-selected", String(generation));
    elements.libraryTab.setAttribute("aria-selected", String(!generation));
  }

  function selected() {
    return store.list().find((item) => item.id === elements.select.value) || null;
  }

  function render(selectedId = "") {
    const items = store.list();
    elements.select.innerHTML = "";
    if (!items.length) {
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "暂无已保存的提示词";
      elements.select.appendChild(empty);
    }
    items.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.name;
      elements.select.appendChild(option);
    });
    elements.select.value = items.some((item) => item.id === selectedId) ? selectedId : "";
    syncSelection();
  }

  function syncSelection() {
    const item = selected();
    elements.name.value = item ? item.name : "";
    elements.libraryPrompt.value = item ? item.prompt : "";
    elements.use.disabled = !item || busy;
    elements.update.disabled = !item || busy;
    elements.remove.disabled = !item || busy;
  }

  function setBusy(value) {
    busy = value;
    [elements.select, elements.name, elements.libraryPrompt, elements.save, elements.use, elements.update, elements.remove, elements.newPreset].forEach((element) => { element.disabled = value; });
    if (!value) syncSelection();
  }

  async function mutate(action) {
    setBusy(true);
    try { await action(); } finally { setBusy(false); }
  }

  async function init() {
    showView("generation");
    elements.generationTab.addEventListener("click", () => showView("generation"));
    elements.libraryTab.addEventListener("click", () => showView("library"));
    elements.openLibrary.addEventListener("click", () => showView("library"));
    elements.select.addEventListener("change", syncSelection);
    elements.newPreset.addEventListener("click", () => {
      elements.select.value = "";
      elements.name.value = "";
      elements.libraryPrompt.value = "";
      syncSelection();
    });
    elements.use.addEventListener("click", () => {
      const item = selected();
      if (!item) return notify("请先选择一个提示词预设。", true);
      elements.prompt.value = item.prompt;
      notify(`已填入预设「${item.name}」。`);
      showView("generation");
    });
    elements.save.addEventListener("click", async () => {
      try {
        await mutate(async () => {
          const id = await store.create(elements.name.value, elements.libraryPrompt.value);
          render(id);
          notify("提示词预设已保存。");
        });
      } catch (error) { notify(error.message || String(error), true); }
    });
    elements.update.addEventListener("click", async () => {
      const item = selected();
      try {
        await mutate(async () => {
          await store.update(item && item.id, elements.name.value, elements.libraryPrompt.value);
          render(item.id);
          notify(`预设「${elements.name.value.trim()}」已更新。`);
        });
      } catch (error) { notify(error.message || String(error), true); }
    });
    elements.remove.addEventListener("click", async () => {
      const item = selected();
      if (!item || !confirmDelete(`确定删除预设「${item.name}」吗？`)) return;
      try {
        await mutate(async () => {
          await store.remove(item.id);
          render();
          notify(`预设「${item.name}」已删除。`);
        });
      } catch (error) { notify(error.message || String(error), true); }
    });
    await store.load();
    render();
  }

  return { init, render };
}

module.exports = { createPresetPanel };
