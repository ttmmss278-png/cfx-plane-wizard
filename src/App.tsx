import {
  Activity,
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
  Download,
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
    runtimeLabel: "浏览器 / 可选本地服务",
    entry: "modules/post-exporter/index.html?v=2.4.1",
    help: "modules/post-exporter/使用说明.html?v=2.4.1",
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
    entry: "modules/case-queue/index.html?v=2.1.0",
    help: "modules/case-queue/使用说明.html?v=2.1.0",
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
    entry: "modules/section-normalizer/index.html?v=2.1.3",
    help: "modules/section-normalizer/使用说明.html?v=2.1.0",
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
    entry: "modules/plane-wizard/index.html?v=1.0.2",
    help: "modules/plane-wizard/使用说明.html?v=1.0.1",
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
    entry: "modules/def-converter/index.html?v=3.1.0",
    help: "modules/def-converter/使用说明.txt?v=3.1.0",
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
      "集中管理 CEL 表达式、CCL 对象与 CST 资料，并通过私有 GitHub 数据仓库跨设备同步公式数据。",
    category: "数据管理",
    runtime: "browser",
    runtimeLabel: "浏览器 / 可选云同步",
    entry: "modules/cfx-post-library/app.html?v=1.15.2",
    help: "modules/cfx-post-library/使用说明.html?v=1.0.0",
    icon: Command,
    tone: "blue",
    features: ["CEL / CCL", "多级目录", "GitHub 同步"],
  },
  {
    id: "mesh-independence",
    sequence: "07",
    title: "网格无关性验证",
    shortTitle: "网格无关性",
    description: "基于三组粗、中、细网格结果进行网格收敛检查，并为后续 GCI / Richardson 外推与网格选取提供统一工作区。",
    category: "数值验证",
    runtime: "browser",
    runtimeLabel: "纯浏览器",
    entry: "modules/mesh-independence/index.html?v=1.9.2",
    help: "modules/mesh-independence/使用说明.html?v=1.0.1",
    icon: Boxes,
    tone: "violet",
    features: ["GCI / Richardson", "演示数据生成", "网格推荐"],
  },
  {
    id: "jet-quality-evaluator",
    sequence: "08",
    title: "射流质量分级评价与智能优选",
    shortTitle: "射流智评",
    description: "面向多截面、多指标射流数据进行统一两级 TOPSIS 排名，并提供相对、基准与固定标准辅助评分。",
    category: "数值验证",
    runtime: "browser",
    runtimeLabel: "纯浏览器",
    entry: "modules/jet-quality-evaluator/index.html?v=2.1.3",
    help: "modules/jet-quality-evaluator/使用说明.html?v=1.0.1",
    icon: Activity,
    tone: "cyan",
    features: ["两级 TOPSIS", "喷嘴优选", "Excel 数据"],
  },
];

const moduleById = new Map(modules.map((module) => [module.id, module]));
const moduleCategories = [
  "全部",
  ...Array.from(new Set(modules.map((module) => module.category))),
];
const LOCAL_NETWORK_MODULES = new Set(["post-exporter", "def-converter"]);
const LOCAL_SERVICE_PACKAGE_PATH =
  "downloads/Pelton-Toolbox-Local-Service-Windows.zip?v=2.4.0";

function readLocalValue(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalValue(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private browsing or an enterprise policy can disable storage. The
    // toolbox remains usable for the current session in that case.
  }
}

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

type SidebarPreference = "collapsed" | "expanded" | null;

const SIDEBAR_PREFERENCE_KEY = "pelton-toolbox-sidebar-preference-v2";
// Keep the integer 1180 px boundary inside compact mode as well. Browsers can
// report fractional CSS viewport widths, so the small epsilon avoids a one-pixel
// expanded-sidebar flash around the responsive breakpoint.
const NARROW_DESKTOP_QUERY = "(min-width: 781px) and (max-width: 1180.98px)";

function readSidebarPreference(): SidebarPreference {
  const explicit = readLocalValue(SIDEBAR_PREFERENCE_KEY);
  if (explicit === "collapsed" || explicit === "expanded") return explicit;

  // Preserve an explicitly collapsed legacy navigation. Legacy "expanded"
  // was also written as a default on every load, so it cannot safely be
  // treated as a deliberate override of the new responsive compact mode.
  return readLocalValue("pelton-toolbox-sidebar") === "collapsed"
    ? "collapsed"
    : null;
}

function isNarrowDesktopViewport() {
  return window.matchMedia(NARROW_DESKTOP_QUERY).matches;
}

function isLoadedFrameDocument(frame: HTMLIFrameElement) {
  try {
    return frame.contentWindow?.location.href !== "about:blank";
  } catch {
    return true;
  }
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
      link.href = moduleUrl("embedded-modules.css?v=3.5");
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

    if (
      ![
        "cfx-post-library",
        "mesh-independence",
        "jet-quality-evaluator",
      ].includes(module.id)
    ) {
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
    () => readLocalValue("pelton-toolbox-last") || "",
  );
  const [sidebarPreference, setSidebarPreference] =
    useState<SidebarPreference>(readSidebarPreference);
  const [narrowDesktop, setNarrowDesktop] = useState(
    isNarrowDesktopViewport,
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [frameVersion, setFrameVersion] = useState(0);
  const [frameDirty, setFrameDirty] = useState(false);
  const [skinId, setSkinId] = useState<SkinId>(readStoredSkin);
  const [skinMenuOpen, setSkinMenuOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const frameShellRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const skinMenuRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef(activeId);
  const frameDirtyRef = useRef(false);

  const activeModule = activeId ? moduleById.get(activeId) ?? null : null;
  const ActiveIcon = activeModule?.icon ?? Boxes;
  const sidebarCollapsed =
    sidebarPreference === "collapsed" ||
    (sidebarPreference !== "expanded" && narrowDesktop);

  const updateFrameDirty = useCallback((dirty: boolean) => {
    frameDirtyRef.current = dirty;
    setFrameDirty(dirty);
  }, []);

  const confirmDiscardChanges = useCallback(() => {
    if (!frameDirtyRef.current) return true;
    const confirmed = window.confirm(
      "当前模块有未保存的修改，继续操作将丢失这些修改。确定继续吗？",
    );
    if (confirmed) updateFrameDirty(false);
    return confirmed;
  }, [updateFrameDirty]);

  useEffect(() => {
    const onHashChange = () => {
      const nextId = routeFromHash();
      const routeChanged = nextId !== activeIdRef.current;

      if (routeChanged && !confirmDiscardChanges()) {
        window.history.replaceState(
          null,
          "",
          activeIdRef.current ? `#/tool/${activeIdRef.current}` : "#/",
        );
        return;
      }

      activeIdRef.current = nextId;
      setActiveId(nextId);
      if (routeChanged) setShowHelp(false);
      setMobileNavOpen(false);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [confirmDiscardChanges]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (activeModule) {
          if (!confirmDiscardChanges()) return;
          window.location.hash = "#/";
          requestAnimationFrame(() => searchRef.current?.focus());
        } else {
          searchRef.current?.focus();
        }
      }
      if (event.key === "Escape") {
        setMobileNavOpen(false);
        if (showHelp && confirmDiscardChanges()) setShowHelp(false);
        setSkinMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeModule, confirmDiscardChanges, showHelp]);

  useEffect(() => {
    const media = window.matchMedia(NARROW_DESKTOP_QUERY);
    const syncViewport = () => setNarrowDesktop(media.matches);
    syncViewport();
    media.addEventListener("change", syncViewport);
    return () => media.removeEventListener("change", syncViewport);
  }, []);

  useEffect(() => {
    if (!sidebarPreference) return;
    writeLocalValue(SIDEBAR_PREFERENCE_KEY, sidebarPreference);
    writeLocalValue("pelton-toolbox-sidebar", sidebarPreference);
  }, [sidebarPreference]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== frameRef.current?.contentWindow) return;
      if (
        !event.data ||
        event.data.type !== "pelton-toolbox-dirty" ||
        typeof event.data.dirty !== "boolean"
      ) {
        return;
      }
      updateFrameDirty(event.data.dirty);
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [updateFrameDirty]);

  useEffect(() => {
    if (!frameDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [frameDirty]);

  useEffect(() => {
    updateFrameDirty(false);
  }, [activeId, frameVersion, showHelp, updateFrameDirty]);

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
    if (activeId && activeId !== id && !confirmDiscardChanges()) return;
    writeLocalValue("pelton-toolbox-last", id);
    setLastUsedId(id);
    window.location.hash = `#/tool/${id}`;
  };

  const goHome = () => {
    if (activeModule && !confirmDiscardChanges()) return;
    window.location.hash = "#/";
  };

  const toggleSidebar = () => {
    setSidebarPreference(sidebarCollapsed ? "expanded" : "collapsed");
  };

  const toggleHelp = () => {
    if (!confirmDiscardChanges()) return;
    setShowHelp((value) => !value);
  };

  const refreshFrame = () => {
    if (!confirmDiscardChanges()) return;
    setFrameVersion((value) => value + 1);
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
            aria-label="工具总览"
            aria-current={!activeModule ? "page" : undefined}
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
                  aria-label={module.title}
                  aria-current={
                    activeModule?.id === module.id ? "page" : undefined
                  }
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
            aria-expanded={!sidebarCollapsed}
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
                aria-label="切换界面皮肤"
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
                    <span className="shortcut" aria-label="快捷键 Ctrl K">
                      Ctrl K
                    </span>
                  </label>
                </div>

                <div className="category-filter" aria-label="模块分类筛选">
                  {moduleCategories.map((category) => (
                    <button
                      key={category}
                      className={categoryFilter === category ? "active" : ""}
                      onClick={() => setCategoryFilter(category)}
                      aria-pressed={categoryFilter === category}
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
                        className={`tool-card module-${module.id} tone-${module.tone}`}
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
            <div
              className={`module-commandbar ${
                LOCAL_NETWORK_MODULES.has(activeModule.id)
                  ? "has-local-service-strip"
                  : ""
              }`}
            >
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
                {activeModule.help && (
                  <button
                    className={`toolbar-button ${showHelp ? "active" : ""}`}
                    onClick={toggleHelp}
                    aria-label={showHelp ? "返回工具" : "打开使用说明"}
                    aria-pressed={showHelp}
                  >
                    <BookOpen size={16} />
                    <span>{showHelp ? "返回工具" : "使用说明"}</span>
                  </button>
                )}
                <button
                  className="toolbar-button"
                  onClick={refreshFrame}
                  aria-label="刷新当前模块"
                >
                  <RefreshCcw size={16} />
                  <span>刷新</span>
                </button>
                <button
                  className="toolbar-button"
                  aria-label="在新窗口独立打开"
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
                <button
                  className="toolbar-button"
                  onClick={requestFullscreen}
                  aria-label="全屏显示当前模块"
                >
                  <Maximize2 size={16} />
                  <span>全屏</span>
                </button>
              </div>
            </div>

            {LOCAL_NETWORK_MODULES.has(activeModule.id) && (
              <div
                key={`local-service-${activeModule.id}`}
                className="local-service-notice compact-notice merged-notice"
              >
                <span className="notice-icon">
                  <HardDrive size={16} />
                </span>
                <div className="local-service-copy">
                  <strong>
                    {activeModule.id === "post-exporter"
                      ? "完整路径导入（可选）"
                      : "转换需要本地服务"}
                  </strong>
                  <span>
                    {activeModule.id === "post-exporter"
                      ? "不连接也能普通导入；换电脑首次使用：下载并完整解压后，双击“安装并启动本地服务.bat”。"
                      : "换电脑首次使用：下载并完整解压后，双击“安装并启动本地服务.bat”。"}
                  </span>
                  <span
                    id="pelton-local-connection-notice"
                    className="local-service-status"
                    data-persistent="true"
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    {activeModule.id === "post-exporter"
                      ? "当前为普通导入模式 · 连接后可自动识别完整路径"
                      : "尚未连接 · 安装后点击“启动本地服务”"}
                  </span>
                </div>
                <div className="local-service-actions">
                  <a
                    className="toolbar-button local-package-download"
                    href={moduleUrl(LOCAL_SERVICE_PACKAGE_PATH)}
                    download="Pelton-Toolbox-Local-Service-Windows.zip"
                    aria-label="下载 Windows 本地服务安装包（ZIP）"
                    title="批量导出与批量转 DEF 共用此安装包"
                  >
                    <Download size={16} />
                    <span>下载服务包</span>
                  </a>
                  <button
                    className="local-launch-button"
                    type="button"
                    onClick={launchLocalService}
                    aria-label="启动本地服务"
                  >
                    <Power size={16} />
                    <span>启动本地服务</span>
                  </button>
                </div>
              </div>
            )}

            <div className="frame-shell" ref={frameShellRef}>
              <iframe
                ref={frameRef}
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
                  if (!isLoadedFrameDocument(event.currentTarget)) return;
                  updateFrameDirty(false);
                  if (!showHelp) {
                    prepareEmbeddedFrame(event.currentTarget, activeModule);
                  }
                }}
                loading="eager"
                allow={
                  LOCAL_NETWORK_MODULES.has(activeModule.id)
                    ? "clipboard-read; clipboard-write; fullscreen; local-network-access; local-network; loopback-network"
                    : "clipboard-read; clipboard-write; fullscreen"
                }
              />
            </div>
          </section>

        )}
      </main>
    </div>
  );
}

export default App;
