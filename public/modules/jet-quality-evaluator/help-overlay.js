(() => {
  const DIALOG_ID = "jet-quality-help-dialog";
  let lastFocusedElement = null;

  const modes = [
    {
      index: "01",
      title: "相对评价",
      tag: "同批排序",
      summary: "用本批数据的最大值和最小值归一化，只比较当前这批喷嘴的相对优劣。",
      usage: "适合：同一次试验中选出更好的喷嘴。",
    },
    {
      index: "02",
      title: "基准喷嘴评价",
      tag: "对标优良样本",
      summary: "把选定喷嘴作为优良基准，判断其他喷嘴与该基准的接近程度。",
      usage: "适合：已有公认优良喷嘴，需要进行对标改进。",
    },
    {
      index: "03",
      title: "固定标准评价",
      tag: "统一尺度",
      summary: "按预先设定的优良值和最差值计算绝对得分，不受当前批次数据范围影响。",
      usage: "适合：跨批次、跨机组或跨方案进行统一比较。",
    },
  ];

  function closeHelp() {
    document.getElementById(DIALOG_ID)?.remove();
    document.body.classList.remove("jet-help-open");
    if (lastFocusedElement instanceof HTMLElement) lastFocusedElement.focus();
  }

  function createModeCard(mode) {
    const article = document.createElement("article");
    article.className = "jet-help-mode";
    const heading = document.createElement("div");
    heading.className = "jet-help-mode-heading";
    const index = document.createElement("span");
    index.className = "jet-help-index";
    index.textContent = mode.index;
    const copy = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = mode.title;
    const tag = document.createElement("span");
    tag.className = "jet-help-tag";
    tag.textContent = mode.tag;
    copy.append(title, tag);
    heading.append(index, copy);
    const summary = document.createElement("p");
    summary.textContent = mode.summary;
    const usage = document.createElement("strong");
    usage.textContent = mode.usage;
    article.append(heading, summary, usage);
    return article;
  }

  function openHelp() {
    if (document.getElementById(DIALOG_ID)) return;
    lastFocusedElement = document.activeElement;
    const backdrop = document.createElement("div");
    backdrop.id = DIALOG_ID;
    backdrop.className = "jet-help-backdrop";
    backdrop.addEventListener("mousedown", (event) => {
      if (event.target === backdrop) closeHelp();
    });

    const dialog = document.createElement("section");
    dialog.className = "jet-help-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "jet-help-title");

    const header = document.createElement("header");
    header.className = "jet-help-header";
    const headerCopy = document.createElement("div");
    const kicker = document.createElement("span");
    kicker.textContent = "METHOD GUIDE";
    const title = document.createElement("h2");
    title.id = "jet-help-title";
    title.textContent = "三种评价方法怎么选？";
    const intro = document.createElement("p");
    intro.textContent = "三种方法的计算流程相同，区别只在于归一化时采用的比较基准。";
    headerCopy.append(kicker, title, intro);
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "jet-help-close";
    closeButton.setAttribute("aria-label", "关闭帮助");
    closeButton.textContent = "×";
    closeButton.addEventListener("click", closeHelp);
    header.append(headerCopy, closeButton);

    const modeGrid = document.createElement("div");
    modeGrid.className = "jet-help-grid";
    modes.forEach((mode) => modeGrid.append(createModeCard(mode)));
    const rule = document.createElement("div");
    rule.className = "jet-help-rule";
    const ruleLabel = document.createElement("span");
    ruleLabel.textContent = "快速选择";
    const ruleText = document.createElement("p");
    ruleText.textContent = "只比较本批 → 相对评价；已有优秀样本 → 基准喷嘴评价；需要跨批统一尺度 → 固定标准评价。";
    rule.append(ruleLabel, ruleText);
    dialog.append(header, modeGrid, rule);
    backdrop.append(dialog);
    document.body.append(backdrop);
    document.body.classList.add("jet-help-open");
    closeButton.focus();
  }

  function decorateHelpButton() {
    const existing = document.querySelector(".file-actions [data-jet-help-button='true']");
    if (existing) return true;
    const actions = document.querySelector(".file-actions > div:last-child");
    if (!actions) return false;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button ghost jet-help-trigger";
    button.dataset.jetHelpButton = "true";
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-controls", DIALOG_ID);
    const icon = document.createElement("span");
    icon.className = "jet-help-trigger-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "?";
    button.append(icon, document.createTextNode("帮助"));
    actions.prepend(button);
    return true;
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("button") : null;
    if (!(target instanceof HTMLButtonElement) || target.dataset.jetHelpButton !== "true") return;
    event.preventDefault();
    event.stopPropagation();
    openHelp();
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeHelp();
  });

  function start() {
    if (decorateHelpButton()) return;
    const observer = new MutationObserver(() => {
      if (decorateHelpButton()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
