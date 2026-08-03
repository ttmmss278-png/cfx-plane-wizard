import {
  ArrowLeft,
  BookOpen,
  Boxes,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDotDashed,
  Clock3,
  Cloud,
  Command,
  ExternalLink,
  FileCog,
  Globe2,
  HardDrive,
  House,
  ImageDown,
  Laptop2,
  Maximize2,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Palette,
  PlaySquare,
  Power,
  RefreshCcw,
  ScanLine,
  Search,
  ShieldCheck,
  Waves,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  applySkin,
  readStoredSkin,
  skinOptions,
  type SkinId,
} from "./skins";

type ToolModule = {
  id: string;
  sequence: string;
  title: string;
  shortTitle: string;
  description: string;
  category: string;
  runtime: "browser" | "local";
  runtimeLabel: string;
  entry: string;
  help?: string;
  icon: LucideIcon;
  tone: "blue" | "cyan" | "violet" | "orange" | "green";
  features: string[];
};

const modules: ToolModule[] = [
  {
    id: "post-exporter",
    sequence: "01",
    title: "CFX-Post 批量导出",
    shortTitle: "批量导出",
    description: "生成批量图片、表格与 POSTcommand 命令，统一管理导出参数。",
    category: "后处理",
    runtime: "browser",
    runtimeLabel: "纯浏览器",
    entry: "modules/post-exporter/index.html",
    help: "modules/post-exporter/使用说明.html",
    icon: ImageDown,
    tone: "blue",
    features: ["图片与表格", "命令模板", "批量输出"],
  },
  {
    id: "case-queue",
    sequence: "02",
    title: "CFX 连跑 BAT 生成器",
    shortTitle: "连跑算例",
    description: "整理求解器、工作目录与算例队列，生成可执行的批处理脚本。",
    category: "求解自动化",
    runtime: "browser",
    runtimeLabel: "纯浏览器",
    entry: "modules/case-queue/index.html",
    help: "modules/case-queue/使用说明.html",
    icon: PlaySquare,
    tone: "cyan",
    features: ["算例队列", "运行参数", "BAT 生成"],
  },
  {
    id: "section-normalizer",
    sequence: "03",
    title: "截面二维归一化投影",
    shortTitle: "截面归一化",
    description: "将三维截面或线坐标投影到二维平面，并完成归一化、预览与导出。",
    category: "几何处理",
    runtime: "browser",
    runtimeLabel: "纯浏览器",
    entry: "modules/section-normalizer/index.html",
    help: "modules/section-normalizer/使用说明.html",
    icon: ScanLine,
    tone: "violet",
    features: ["三维投影", "坐标归一化", "预览导出"],
  },
  {
    id: "plane-wizard",
    sequence: "04",
    title: "CFX-Post 圆截面生成器",
    shortTitle: "圆截面生成",
    description: "依据圆心、圆周点与方向参数，批量生成连续圆截面数据。",
    category: "后处理",
    runtime: "browser",
    runtimeLabel: "纯浏览器",
    entry: "modules/plane-wizard/index.html",
    icon: CircleDotDashed,
    tone: "orange",
    features: ["圆截面计算", "连续截面", "多格式导出"],
  },
  {
    id: "def-converter",
    sequence: "05",
    title: "CFX 批量转 DEF",
    shortTitle: "批量转 DEF",
    description: "调用本机 CFX-Pre 将多个 CFX 工程批量转换为 DEF 文件。",
    category: "前处理",
    runtime: "local",
    runtimeLabel: "需本地服务",
    entry: "modules/def-converter/index.html",
    help: "modules/def-converter/使用说明.txt",
    icon: FileCog,
    tone: "green",
    features: ["CFX-Pre", "批量转换", "进度日志"],
  },
  {
    id: "cfx-post-library",
    sequence: "06",
    title: "CFX-Post 公式与命令库",
    shortTitle: "公式命令库",
    description:
      "集中管理 CEL 表达式、CCL 对象、文件夹与加载包，并通过私有 GitHub 数据仓库跨设备同步。",
    category: "数据管理",
    runtime: "browser",
    runtimeLabel: "纯浏览器",
    entry: "modules/cfx-post-library/app.html?v=1.6.1",
    icon: Command,
    tone: "blue",
    features: ["CEL / CCL", "文件夹管理", "GitHub 同步"],
  },
];

const moduleById = new Map(modules.map((module) => [module.id, module]));
const moduleCategories = [
  "全部",
  ...Array.from(new Set(modules.map((module) => module.category))),
];

function moduleUrl(path: string) {
  return new URL(path, document.baseURI).href;
}

function moduleFrameUrl(path: string) {
  const url = new URL(path, document.baseURI);
  url.searchParams.set("embedded", "1");
  return url.href;
}

function routeFromHash() {
  const match = window.location.hash.match(/^#\/tool\/([^/?]+)/);
  return match && moduleById.has(match[1]) ? match[1] : null;
}

function RuntimeBadge({ module }: { module: ToolModule }) {
  const LocalIcon = module.runtime === "local" ? Laptop2 : Globe2;
  return (
    <span className={`runtime-badge ${module.runtime}`}>
      <LocalIcon size={13} aria-hidden="true" />
      {module.runtimeLabel}
    </span>
  );
}

function prepareEmbeddedFrame(frame: HTMLIFrameElement, module: ToolModule) {
  try {
    const doc = frame.contentDocument;
    if (!doc?.head || !doc.body) return;

    doc.documentElement.dataset.peltonEmbedded = "true";
    doc.body.classList.add("toolbox-embedded", `toolbox-module-${module.id}`);

    if (!doc.getElementById("pelton-embedded-layout")) {
      const link = doc.createElement("link");
      link.id = "pelton-embedded-layout";
      link.rel = "stylesheet";
      link.href = moduleUrl("embedded-modules.css?v=3.0");
      doc.head.appendChild(link);
    }

    if (
      module.id === "plane-wizard" &&
      !doc.getElementById("plane-layout-optimization")
    ) {
      const link = doc.createElement("link");
      link.id = "plane-layout-optimization";
      link.rel = "stylesheet";
      link.href = moduleUrl(
        "modules/plane-wizard/layout-optimization.css?v=1.1",
      );
      doc.head.appendChild(link);
    }

    if (module.id !== "cfx-post-library") {
      const title = doc.querySelector("h1") as HTMLElement | null;
      if (title) {
        title.classList.add("toolbox-inner-title");
        let node = title.parentElement;
        const viewportWidth = doc.documentElement.clientWidth || frame.clientWidth;
        while (node && node !== doc.body) {
          const rect = node.getBoundingClientRect();
          if (
            rect.height >= 72 &&
            rect.width >= Math.min(520, viewportWidth * 0.45)
          ) {
            node.classList.add("toolbox-inner-hero");
            break;
          }
          node = node.parentElement;
        }
      }
    }
  } catch {
    // All production modules are same-origin. The original module remains usable if access is blocked.
  }
}

function App() {
  const [activeId, setActiveId] = useState<string | null>(routeFromHash);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("全部");
  const [lastUsedId, setLastUsedId] = useState(
    () => localStorage.getItem("pelton-toolbox-last") || "",
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("pelton-toolbox-sidebar") === "collapsed",
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [frameVersion, setFrameVersion] = useState(0);
  const [skinId, setSkinId] = useState<SkinId>(readStoredSkin);
  const [skinMenuOpen, setSkinMenuOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const frameShellRef = useRef<HTMLDivElement>(null);
  const skinMenuRef = useRef<HTMLDivElement>(null);

  const activeModule = activeId ? moduleById.get(activeId) ?? null : null;
  const ActiveIcon = activeModule?.icon ?? Boxes;

  useEffect(() => {
    const onHashChange = () => {
      setActiveId(routeFromHash());
      setShowHelp(false);
      setMobileNavOpen(false);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (activeModule) {
          window.location.hash = "#/";
          requestAnimationFrame(() => searchRef.current?.focus());
        } else {
          searchRef.current?.focus();
        }
      }
      if (event.key === "Escape") {
        setMobileNavOpen(false);
        setShowHelp(false);
        setSkinMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeModule]);

  useEffect(() => {
    localStorage.setItem(
      "pelton-toolbox-sidebar",
      sidebarCollapsed ? "collapsed" : "expanded",
    );
  }, [sidebarCollapsed]);

  useEffect(() => {
    applySkin(skinId);
    window.dispatchEvent(
      new CustomEvent("pelton-skin-change", { detail: { skinId } }),
    );
  }, [skinId]);

  useEffect(() => {
    if (!skinMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!skinMenuRef.current?.contains(event.target as Node)) {
        setSkinMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [skinMenuOpen]);

  const filteredModules = useMemo(() => {
    const query = search.trim().toLowerCase();
    return modules.filter((module) => {
      const matchesCategory =
        categoryFilter === "全部" || module.category === categoryFilter;
      if (!matchesCategory) return false;
      if (!query) return true;
      return [
        module.title,
        module.shortTitle,
        module.description,
        module.category,
        module.runtimeLabel,
        ...module.features,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [search, categoryFilter]);

  const openModule = (id: string) => {
    const module = moduleById.get(id);
    if (!module) return;
    localStorage.setItem("pelton-toolbox-last", id);
    setLastUsedId(id);
    window.location.hash = `#/tool/${id}`;
  };

  const goHome = () => {
    window.location.hash = "#/";
  };

  const toggleSidebar = () => {
    setSidebarCollapsed((value) => !value);
  };

  const requestFullscreen = async () => {
    if (!frameShellRef.current) return;
    try {
      await frameShellRef.current.requestFullscreen();
    } catch {
      // Browsers can reject fullscreen requests outside a direct user gesture.
    }
  };

  const launchLocalService = () => {
    window.location.href = "pelton-toolbox://start";
  };

  const currentFramePath = activeModule
    ? showHelp && activeModule.help
      ? activeModule.help
      : activeModule.entry
    : "";

  const lastUsedModule = moduleById.get(lastUsedId) ?? modules[3];
  const githubSyncSummary = (() => {
    try {
      const cfg = JSON.parse(
        localStorage.getItem("cfxpost_github_sync_config_v1") || "{}",
      );
      if (cfg.lastSyncAt) {
        return `已同步 · ${new Date(cfg.lastSyncAt).toLocaleString("zh-CN", {
          hour12: false,
        })}`;
      }
      return cfg.autoSync ? "自动同步已启用" : "尚未配置";
    } catch {
      return "尚未配置";
    }
  })();

  return (
    <div
      className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}
    >
      {mobileNavOpen && (
        <button
          className="nav-backdrop"
          aria-label="关闭导航"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside className={`sidebar ${mobileNavOpen ? "mobile-open" : ""}`}>
        <div className="brand-row">
          <button className="brand" onClick={goHome} aria-label="返回工具箱首页">
            <span className="brand-mark">
              <Waves size={22} strokeWidth={2.2} />
            </span>
            <span className="brand-copy">
              <strong>Pelton Workspace</strong>
              <small>水轮机工程工具箱</small>
            </span>
          </button>
          <button
            className="mobile-close icon-button"
            onClick={() => setMobileNavOpen(false)}
            aria-label="关闭导航"
          >
            <X size={19} />
          </button>
        </div>

        <nav className="primary-nav" aria-label="主导航">
          <button
            className={`nav-item ${!activeModule ? "active" : ""}`}
            onClick={goHome}
          >
            <span className="nav-icon">
              <House size={18} />
            </span>
            <span className="nav-label">工具总览</span>
          </button>
        </nav>

        <div className="nav-section">
          <div className="nav-section-title">
            <span>功能模块</span>
            <span className="count-chip">{modules.length}</span>
          </div>
          <nav className="module-nav" aria-label="工具模块">
            {modules.map((module) => {
              const Icon = module.icon;
              return (
                <button
                  key={module.id}
                  className={`nav-item module-link ${
                    activeModule?.id === module.id ? "active" : ""
                  }`}
                  onClick={() => openModule(module.id)}
                  title={sidebarCollapsed ? module.title : undefined}
                >
                  <span className={`nav-icon tone-${module.tone}`}>
                    <Icon size={18} />
                  </span>
                  <span className="nav-label">
                    <span>{module.shortTitle}</span>
                    <small>{module.category}</small>
                  </span>
                  {module.runtime === "local" && (
                    <span className="local-dot" title="需本地服务" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="sidebar-footer">
          <div className="environment-card">
            <span className="environment-icon">
              <ShieldCheck size={17} />
            </span>
            <span className="environment-copy">
              <strong>本地优先</strong>
              <small>输入文件不会上传</small>
            </span>
          </div>
          <button
            className="collapse-button"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen size={18} />
            ) : (
              <PanelLeftClose size={18} />
            )}
            <span>{sidebarCollapsed ? "展开导航" : "收起导航"}</span>
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="mobile-menu icon-button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="打开导航"
            >
              <Menu size={20} />
            </button>
            <div className="breadcrumb">
              <span>工程工具箱</span>
              {activeModule && (
                <>
                  <ChevronRight size={14} />
                  <strong>{activeModule.shortTitle}</strong>
                </>
              )}
            </div>
          </div>
          <div className="topbar-tools">
            <div className="skin-switcher" ref={skinMenuRef}>
              <button
                className={`skin-trigger ${skinMenuOpen ? "active" : ""}`}
                type="button"
                aria-haspopup="menu"
                aria-expanded={skinMenuOpen}
                onClick={() => setSkinMenuOpen((value) => !value)}
              >
                <Palette size={16} />
                <span>皮肤</span>
                <ChevronDown size={14} />
              </button>
              {skinMenuOpen && (
                <div className="skin-menu" role="menu" aria-label="界面皮肤">
                  <div className="skin-menu-heading">
                    <strong>切换界面皮肤</strong>
                    <span>模块界面将同步更新</span>
                  </div>
                  <div className="skin-option-list">
                    {skinOptions.map((skin) => (
                      <button
                        key={skin.id}
                        className={skinId === skin.id ? "selected" : ""}
                        type="button"
                        role="menuitemradio"
                        aria-checked={skinId === skin.id}
                        onClick={() => {
                          setSkinId(skin.id);
                          setSkinMenuOpen(false);
                        }}
                      >
                        <span className={`skin-swatch swatch-${skin.id}`} />
                        <span className="skin-option-copy">
                          <strong>{skin.name}</strong>
                          <small>{skin.description}</small>
                        </span>
                        <span className="skin-check">
                          {skinId === skin.id && <Check size={15} />}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="topbar-status">
              <span className="status-indicator" />
              <span>本地工作区</span>
            </div>
          </div>
        </header>

        {!activeModule ? (
          <div className="home-view">
            <section className="hero-panel">
              <div className="hero-copy">
                <div className="eyebrow">
                  <Boxes size={15} />
                  ENGINEERING TOOLKIT
                </div>
                <h1>冲击式水轮机工程工具箱</h1>
                <p>
                  将常用的 CFX 前后处理、批量求解与几何数据工具集中到一个工作台，
                  保留原有功能，减少在多个网页之间反复查找和切换。
                </p>
                <div className="hero-meta">
                  <span>
                    <strong>{modules.length}</strong> 个功能模块
                  </span>
                  <span>
                    <strong>
                      {modules.filter((module) => module.runtime === "browser").length}
                    </strong>{" "}
                    个纯浏览器工具
                  </span>
                  <span>
                    <strong>
                      {modules.filter((module) => module.runtime === "local").length}
                    </strong>{" "}
                    个本地服务工具
                  </span>
                  <span>
                    <strong>1</strong> 个 GitHub 云端数据库
                  </span>
                </div>
              </div>
              <div className="hero-visual" aria-hidden="true">
                <div className="visual-ring ring-one" />
                <div className="visual-ring ring-two" />
                <div className="visual-center">
                  <Waves size={34} />
                </div>
                <div className="coordinate-mark mark-x">X</div>
                <div className="coordinate-mark mark-y">Y</div>
                <div className="coordinate-mark mark-z">Z</div>
              </div>
            </section>

            <section className="quick-workspace status-strip" aria-label="快捷工作区">
              <button
                className="quick-card"
                onClick={() => openModule(lastUsedModule.id)}
              >
                <span className="quick-icon tone-cyan">
                  <Clock3 size={18} />
                </span>
                <span className="quick-copy">
                  <small>最近使用</small>
                  <strong>{lastUsedModule.shortTitle}</strong>
                  <span>{lastUsedModule.category}</span>
                </span>
              </button>
              <button
                className="quick-card"
                onClick={() => openModule("cfx-post-library")}
              >
                <span className="quick-icon tone-blue">
                  <Command size={18} />
                </span>
                <span className="quick-copy">
                  <small>常用数据工具</small>
                  <strong>公式与命令库</strong>
                  <span>CEL / CCL 集中管理</span>
                </span>
              </button>
              <button
                className="quick-card"
                onClick={() => openModule("cfx-post-library")}
              >
                <span className="quick-icon tone-green">
                  <Cloud size={18} />
                </span>
                <span className="quick-copy">
                  <small>GitHub 数据</small>
                  <strong>{githubSyncSummary}</strong>
                  <span>私有仓库同步状态</span>
                </span>
              </button>
              <button
                className="quick-card"
                onClick={() => openModule("def-converter")}
              >
                <span className="quick-icon tone-orange">
                  <HardDrive size={18} />
                </span>
                <span className="quick-copy">
                  <small>本地服务</small>
                  <strong>按需启动</strong>
                  <span>CFX 批量转 DEF</span>
                </span>
              </button>
            </section>

            <section className="tool-section">
              <div className="workbench-toolbar">
                <div className="section-heading">
                  <div>
                    <span className="section-kicker">WORKBENCH</span>
                    <h2>选择一个工程模块</h2>
                  </div>
                  <label className="search-box">
                    <Search size={18} />
                    <input
                      ref={searchRef}
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="搜索工具、功能或类别"
                      aria-label="搜索工具"
                    />
                    <span className="shortcut">
                      <Command size={12} /> K
                    </span>
                  </label>
                </div>

                <div className="category-filter" aria-label="模块分类筛选">
                  {moduleCategories.map((category) => (
                    <button
                      key={category}
                      className={categoryFilter === category ? "active" : ""}
                      onClick={() => setCategoryFilter(category)}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </div>


              {filteredModules.length ? (
                <div className="tool-grid">
                  {filteredModules.map((module) => {
                    const Icon = module.icon;
                    return (
                      <article
                        key={module.id}
                        className={`tool-card tone-${module.tone}`}
                      >
                        <button
                          className="card-hit-area"
                          onClick={() => openModule(module.id)}
                          aria-label={`打开${module.title}`}
                        />
                        <div className="card-topline">
                          <span className="sequence">{module.sequence}</span>
                          <RuntimeBadge module={module} />
                        </div>
                        <div className="card-icon">
                          <Icon size={29} strokeWidth={1.8} />
                        </div>
                        <div className="card-body">
                          <span className="category">{module.category}</span>
                          <h3>{module.title}</h3>
                          <p title={module.description}>{module.description}</p>
                        </div>
                        <div className="feature-row">
                          {module.features.map((feature) => (
                            <span key={feature}>{feature}</span>
                          ))}
                        </div>
                        <div className="card-action">
                          <span>进入工具</span>
                          <span className="action-arrow">
                            <ArrowLeft size={16} />
                          </span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state">
                  <Search size={24} />
                  <h3>没有匹配的工具</h3>
                  <p>请调整分类，或尝试搜索“CFX”“截面”“导出”“批量”。</p>
                  <button
                    onClick={() => {
                      setSearch("");
                      setCategoryFilter("全部");
                    }}
                  >
                    清除筛选
                  </button>
                </div>
              )}
            </section>
          </div>
        ) : (
          <section className="workspace-view workspace-view-v3">
            <div className="module-commandbar">
              <div className="module-identity">
                <button
                  className="back-button"
                  onClick={goHome}
                  aria-label="返回工具总览"
                >
                  <ArrowLeft size={18} />
                </button>
                <span className={`workspace-icon tone-${activeModule.tone}`}>
                  <ActiveIcon size={19} />
                </span>
                <div className="module-identity-copy">
                  <div className="workspace-title-row">
                    <h1>
                      {showHelp
                        ? `${activeModule.title} · 使用说明`
                        : activeModule.title}
                    </h1>
                    <RuntimeBadge module={activeModule} />
                    <span className="module-chip">{activeModule.category}</span>
                    <span className="module-chip live">
                      <span className="live-dot" />
                      {showHelp ? "说明文档" : "模块已加载"}
                    </span>
                  </div>
                  <p>{activeModule.description}</p>
                </div>
              </div>
              <div className="workspace-actions">
                {activeModule.runtime === "local" && (
                  <button
                    className="local-launch-button"
                    type="button"
                    onClick={launchLocalService}
                  >
                    <Power size={16} />
                    <span>启动本地服务</span>
                  </button>
                )}
                {activeModule.help && (
                  <button
                    className={`toolbar-button ${showHelp ? "active" : ""}`}
                    onClick={() => setShowHelp((value) => !value)}
                  >
                    <BookOpen size={16} />
                    <span>{showHelp ? "返回工具" : "使用说明"}</span>
                  </button>
                )}
                <button
                  className="toolbar-button"
                  onClick={() => setFrameVersion((value) => value + 1)}
                >
                  <RefreshCcw size={16} />
                  <span>刷新</span>
                </button>
                <button
                  className="toolbar-button"
                  onClick={() =>
                    window.open(
                      moduleUrl(currentFramePath),
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                >
                  <ExternalLink size={16} />
                  <span>独立打开</span>
                </button>
                <button className="toolbar-button" onClick={requestFullscreen}>
                  <Maximize2 size={16} />
                  <span>全屏</span>
                </button>
              </div>
            </div>

            {activeModule.runtime === "local" && (
              <div className="local-service-notice compact-notice merged-notice">
                <span className="notice-icon">
                  <HardDrive size={16} />
                </span>
                <div className="local-service-copy">
                  <strong>此模块需要本机服务</strong>
                  <span>
                    首次使用请运行 <code>安装网页启动器.bat</code>；转换期间保持
                    PowerShell 窗口开启。
                  </span>
                </div>
              </div>
            )}

            <div className="frame-shell" ref={frameShellRef}>
              <iframe
                key={`${activeModule.id}-${showHelp}-${frameVersion}`}
                title={
                  showHelp ? `${activeModule.title}使用说明` : activeModule.title
                }
                src={
                  showHelp
                    ? moduleUrl(currentFramePath)
                    : moduleFrameUrl(currentFramePath)
                }
                onLoad={(event) => {
                  if (!showHelp) {
                    prepareEmbeddedFrame(event.currentTarget, activeModule);
                  }
                }}
                loading="eager"
                allow="clipboard-read; clipboard-write; fullscreen"
              />
            </div>
          </section>

        )}
      </main>
    </div>
  );
}

export default App;
