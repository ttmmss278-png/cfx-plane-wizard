(() => {
  const EDITORS_CLASS = "jet-manual-editors";
  let updateQueued = false;
  let syncing = false;

  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

  async function waitForElement(selector, attempts = 12) {
    for (let index = 0; index < attempts; index += 1) {
      const element = document.querySelector(selector);
      if (element) return element;
      await nextFrame();
    }
    return null;
  }

  function selectedMethod(selector) {
    const active = selector?.querySelector("button.active");
    return active?.textContent?.replace(/\s+/g, "").includes("自主赋权") ?? false;
  }

  function readIndicatorItems() {
    return Array.from(document.querySelectorAll(".indicator-table tbody tr")).map((row, index) => {
      const cells = row.querySelectorAll("td");
      return {
        index,
        name: cells[0]?.querySelector("strong")?.textContent?.trim() || `指标 ${index + 1}`,
        weight: Number(cells[4]?.textContent?.trim()) || 0,
      };
    });
  }

  function readSectionItems() {
    return Array.from(document.querySelectorAll(".section-item")).map((item, index) => {
      const meta = item.querySelector("small")?.textContent || "";
      const match = meta.match(/权重\s*([+-]?(?:\d+\.?\d*|\.\d+))/);
      return {
        index,
        name: item.querySelector("strong")?.textContent?.trim() || `截面 ${index + 1}`,
        weight: Number(match?.[1]) || 0,
      };
    });
  }

  function markLegacyFields() {
    document.querySelectorAll(".section-item small").forEach((element) => {
      const match = element.textContent?.match(/^(.*?)\s*·\s*权重\s*[+-]?(?:\d+\.?\d*|\.\d+)\s*$/);
      if (!match) return;
      element.classList.add("jet-clean-section-meta");
      element.dataset.cleanLabel = match[1].trim();
    });

    document.querySelectorAll(".modal-body label").forEach((label) => {
      const title = label.querySelector(":scope > span")?.textContent?.trim();
      if (title === "一级权重" || title === "二级权重") {
        label.classList.add("jet-legacy-weight-field");
      }
    });
  }

  function setReactInputValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function editButton(kind, index) {
    if (kind === "level1") {
      return document.querySelectorAll(".indicator-table tbody tr")[index]
        ?.querySelector(".row-actions button");
    }
    return document.querySelectorAll(".section-item")[index]
      ?.querySelector(".row-actions button");
  }

  async function applyWeight(kind, index, rawValue, editor) {
    const value = Number(rawValue);
    if (syncing || !Number.isFinite(value) || value < 0) {
      scheduleUpdate();
      return;
    }

    const button = editButton(kind, index);
    if (!(button instanceof HTMLButtonElement)) return;
    syncing = true;
    editor.classList.add("is-syncing");
    document.body.classList.add("jet-weight-syncing");

    try {
      button.click();
      const modal = await waitForElement(".modal");
      if (!modal) throw new Error("未找到权重编辑窗口");
      markLegacyFields();
      const targetLabel = Array.from(modal.querySelectorAll(".modal-body label")).find((label) => {
        const text = label.querySelector(":scope > span")?.textContent?.trim();
        return text === (kind === "level1" ? "一级权重" : "二级权重");
      });
      const input = targetLabel?.querySelector("input");
      if (!(input instanceof HTMLInputElement)) throw new Error("未找到权重输入框");
      setReactInputValue(input, value);
      await nextFrame();
      const save = Array.from(modal.querySelectorAll(".modal-actions button")).find((candidate) =>
        candidate.textContent?.includes("保存设置"),
      );
      if (!(save instanceof HTMLButtonElement)) throw new Error("未找到保存按钮");
      save.click();
      await nextFrame();
      await nextFrame();
    } catch (error) {
      console.error("权重更新失败", error);
      document.querySelector(".modal .modal-actions button")?.click();
    } finally {
      syncing = false;
      document.body.classList.remove("jet-weight-syncing");
      editor.classList.remove("is-syncing");
      scheduleUpdate();
    }
  }

  function createEditor(kind, title, subtitle, items) {
    const editor = document.createElement("section");
    editor.className = "jet-manual-editor";
    editor.dataset.kind = kind;

    const heading = document.createElement("header");
    const copy = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = title;
    const description = document.createElement("span");
    description.textContent = subtitle;
    copy.append(name, description);
    const state = document.createElement("em");
    state.textContent = "计算时自动归一化";
    heading.append(copy, state);

    const total = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
    const grid = document.createElement("div");
    grid.className = "jet-weight-input-grid";
    items.forEach((item) => {
      const label = document.createElement("label");
      const labelTop = document.createElement("span");
      const itemName = document.createElement("b");
      itemName.textContent = item.name;
      const ratio = document.createElement("small");
      ratio.textContent = total > 0 ? `${((item.weight / total) * 100).toFixed(1)}%` : "0.0%";
      labelTop.append(itemName, ratio);
      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.step = "0.1";
      input.value = String(item.weight);
      input.setAttribute("aria-label", `${item.name}权重`);
      input.addEventListener("change", () => applyWeight(kind, item.index, input.value, editor));
      label.append(labelTop, input);
      grid.append(label);
    });

    const footer = document.createElement("footer");
    const totalLabel = document.createElement("span");
    totalLabel.textContent = `原始权重合计：${Number(total.toFixed(4))}`;
    const hint = document.createElement("span");
    hint.textContent = total > 0 ? "修改后自动重算评价结果" : "至少需要一个权重大于 0";
    if (total <= 0) hint.className = "warning";
    footer.append(totalLabel, hint);
    editor.append(heading, grid, footer);
    return editor;
  }

  function updateEditors() {
    updateQueued = false;
    markLegacyFields();
    if (syncing) return;
    const card = document.querySelector(".weights-card");
    const panels = card?.querySelector(".weight-panels");
    if (!card || !panels) return;
    const selectors = panels.querySelectorAll(".weight-selector");
    const level1Manual = selectedMethod(selectors[0]);
    const level2Manual = selectedMethod(selectors[1]);
    const level1Items = level1Manual ? readIndicatorItems() : [];
    const level2Items = level2Manual ? readSectionItems() : [];
    const signature = JSON.stringify({ level1Manual, level2Manual, level1Items, level2Items });
    const existing = card.querySelector(`.${EDITORS_CLASS}`);
    if (existing?.dataset.signature === signature) return;
    existing?.remove();
    if (!level1Manual && !level2Manual) return;

    const container = document.createElement("div");
    container.className = EDITORS_CLASS;
    container.dataset.signature = signature;
    if (level1Manual) {
      container.append(createEditor(
        "level1",
        "一级指标权重",
        "控制每个截面内各评价指标的重要程度",
        level1Items,
      ));
    }
    if (level2Manual) {
      container.append(createEditor(
        "level2",
        "二级截面权重",
        "控制各评价截面对喷嘴综合得分的影响",
        level2Items,
      ));
    }
    container.classList.toggle("single", container.childElementCount === 1);
    panels.insertAdjacentElement("afterend", container);
  }

  function scheduleUpdate() {
    if (updateQueued) return;
    updateQueued = true;
    requestAnimationFrame(updateEditors);
  }

  function start() {
    scheduleUpdate();
    const observer = new MutationObserver(scheduleUpdate);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class"],
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
