import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

// ---------- Types & helpers ----------
type Vec3 = [number, number, number];
type Mode = "3pts" | "center2pts";
type DistMode = "step" | "total";

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3) => Math.sqrt(dot(a, a));
const unit = (a: Vec3): Vec3 => {
  const n = norm(a);
  return n < 1e-12 ? [0, 0, 0] : [a[0] / n, a[1] / n, a[2] / n];
};

function circleFrom3Points(p1: Vec3, p2: Vec3, p3: Vec3) {
  const v1 = sub(p2, p1);
  const v2 = sub(p3, p1);
  const n = cross(v1, v2);
  const nLen = norm(n);
  if (nLen < 1e-10) return null;
  const nrm = unit(n);
  const v1sq = dot(v1, v1);
  const v2sq = dot(v2, v2);
  const denom = 2 * dot(n, n);
  const alpha = (v2sq * dot(v1, sub(v1, v2))) / denom;
  const beta = (v1sq * dot(v2, sub(v2, v1))) / denom;
  const center = add(p1, add(scale(v1, alpha), scale(v2, beta)));
  const radius = norm(sub(p1, center));
  return { center, radius, normal: nrm };
}

function circleFromCenterAnd2(c: Vec3, r1: Vec3, r2: Vec3) {
  const v1 = sub(r1, c);
  const v2 = sub(r2, c);
  const n = cross(v1, v2);
  if (norm(n) < 1e-10) return null;
  return { center: c, radius: (norm(v1) + norm(v2)) / 2, normal: unit(n) };
}

const fmt = (n: number, d: number) =>
  Number.isFinite(n) ? n.toFixed(d) : "—";

// ---------- Small UI atoms ----------
function NumInput(props: {
  value: number;
  onChange: (n: number) => void;
  step?: number;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      className="eng-input"
      value={Number.isFinite(props.value) ? props.value : ""}
      step={props.step ?? "any"}
      placeholder={props.placeholder}
      onChange={(e) => props.onChange(parseFloat(e.target.value))}
    />
  );
}

function TextInput(props: {
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      className="eng-input"
      value={props.value}
      placeholder={props.placeholder}
      onChange={(e) => props.onChange(e.target.value)}
    />
  );
}

function Vec3Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Vec3;
  onChange: (v: Vec3) => void;
}) {
  return (
    <div>
      <label className="eng-label">{label} (X / Y / Z)</label>
      <div className="grid grid-cols-3 gap-1.5">
        {[0, 1, 2].map((i) => (
          <NumInput
            key={i}
            value={value[i]}
            onChange={(n) => {
              const nv = [...value] as Vec3;
              nv[i] = n;
              onChange(nv);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function Panel({
  title,
  right,
  children,
  collapsible,
  defaultOpen = true,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="eng-panel">
      <div className="eng-panel-header">
        <div className="flex items-center gap-2">
          {collapsible && (
            <button
              onClick={() => setOpen((v) => !v)}
              className="w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label={open ? "折叠" : "展开"}
            >
              <span className="text-[10px]">{open ? "▼" : "▶"}</span>
            </button>
          )}
          <h3 className="eng-panel-title">{title}</h3>
        </div>
        {right}
      </div>
      {open && <div className="p-3 space-y-2.5">{children}</div>}
    </section>
  );
}

// ---------- Main ----------
const STORAGE_KEY = "cst-circle-section-gen-v1";

interface State {
  domain: string;
  prefix: string;
  unit: string;
  decimals: number;
  bound: number;
  mode: Mode;
  C: Vec3;
  R1: Vec3;
  R2: Vec3;
  P1: Vec3;
  P2: Vec3;
  P3: Vec3;
  includeFirst: boolean;
  targetMode: Mode;
  C2: Vec3;
  Q1: Vec3;
  Q2: Vec3;
  Q3: Vec3;
  distance: number;
  count: number;
  distMode: DistMode;
  sixEnabled: boolean;
  sixDomains: string;
  sixNums: string;
  sixBase: number;
  sixAngle: number;
  sixDir: "cw" | "ccw";
  sixAxisOrigin: Vec3;
  sixAxisDir: Vec3;
  cfxTemplate: string;
}

const defaultState: State = {
  domain: "NOZZLE",
  prefix: "PLANE_",
  unit: "mm",
  decimals: 6,
  bound: 0.05,
  mode: "3pts",
  C: [0, 0, 0],
  R1: [1, 0, 0],
  R2: [0, 1, 0],
  P1: [1, 0, 0],
  P2: [0, 1, 0],
  P3: [-1, 0, 0],
  includeFirst: true,
  targetMode: "3pts",
  C2: [0, 0, 10],
  Q1: [1, 0, 10],
  Q2: [0, 1, 10],
  Q3: [-1, 0, 10],
  distance: 2,
  count: 6,
  distMode: "step",
  sixEnabled: false,
  sixDomains: "NOZZLE_1, NOZZLE_2, NOZZLE_3, NOZZLE_4, NOZZLE_5, NOZZLE_6",
  sixNums: "1,2,3,4,5,6",
  sixBase: 1,
  sixAngle: 60,
  sixDir: "ccw",
  sixAxisOrigin: [0, 0, 0],
  sixAxisDir: [0, 0, 1],
  cfxTemplate: `PLANE:{name}
  Apply Instancing Transform = Off
  Domain List = {domain}
  Bound Radius = {bound} [{unit}]
  Option = Point and Normal
  Point = {cx}, {cy}, {cz} [{unit}]
  Normal = {nx}, {ny}, {nz}
  Plane Bound = Circular
  Plane Type = Slice
END`,
};

const Index = () => {
  const [s, setS] = useState<State>(defaultState);
  const [tab, setTab] = useState<"PLANE" | "CSV" | "JSON">("PLANE");
  const [status, setStatus] = useState<string>("等待生成…");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const set = <K extends keyof State>(k: K, v: State[K]) =>
    setS((prev) => ({ ...prev, [k]: v }));

  // ---- Base circle ----
  const baseCircle = useMemo(() => {
    if (s.mode === "3pts") return circleFrom3Points(s.P1, s.P2, s.P3);
    return circleFromCenterAnd2(s.C, s.R1, s.R2);
  }, [s.mode, s.C, s.R1, s.R2, s.P1, s.P2, s.P3]);

  // ---- Target circle & direction ----
  const targetCenter: Vec3 | null = useMemo(() => {
    if (s.targetMode === "3pts") {
      const c = circleFrom3Points(s.Q1, s.Q2, s.Q3);
      return c ? c.center : null;
    }
    return s.C2;
  }, [s.targetMode, s.C2, s.Q1, s.Q2, s.Q3]);

  const moveDir: Vec3 = useMemo(() => {
    if (!baseCircle || !targetCenter) return [0, 0, 0];
    const d = sub(targetCenter, baseCircle.center);
    return norm(d) < 1e-10 ? baseCircle.normal : unit(d);
  }, [baseCircle, targetCenter]);

  // ---- Sections ----
  const sections = useMemo(() => {
    if (!baseCircle) return [];
    const n = Math.max(1, Math.floor(s.count));
    const arr: { name: string; center: Vec3; radius: number; normal: Vec3 }[] = [];
    const startIdx = s.includeFirst ? 0 : 1;
    const total = s.includeFirst ? n : n;
    for (let i = 0; i < total; i++) {
      const k = s.includeFirst ? i : i + 1;
      let dist = 0;
      if (s.distMode === "step") dist = k * s.distance;
      else {
        const denom = s.includeFirst ? Math.max(1, n - 1) : n;
        dist = (k * s.distance) / denom;
      }
      const c = add(baseCircle.center, scale(moveDir, dist));
      arr.push({
        name: `${s.prefix}${String(i + 1).padStart(2, "0")}`,
        center: c,
        radius: baseCircle.radius,
        normal: baseCircle.normal,
      });
      if (!s.includeFirst && i + 1 >= n) break;
      if (s.includeFirst && i + 1 >= n) break;
      void startIdx;
    }
    return arr;
  }, [baseCircle, moveDir, s.count, s.distance, s.distMode, s.includeFirst, s.prefix]);

  // ---- Output strings ----
  const planeText = useMemo(() => {
    if (!sections.length) return "# 无有效截面";
    return sections
      .map((sec) =>
        s.cfxTemplate
          .replaceAll("{name}", sec.name)
          .replaceAll("{domain}", s.domain)
          .replaceAll("{unit}", s.unit)
          .replaceAll("{bound}", fmt(s.bound, s.decimals))
          .replaceAll("{cx}", fmt(sec.center[0], s.decimals))
          .replaceAll("{cy}", fmt(sec.center[1], s.decimals))
          .replaceAll("{cz}", fmt(sec.center[2], s.decimals))
          .replaceAll("{nx}", fmt(sec.normal[0], s.decimals))
          .replaceAll("{ny}", fmt(sec.normal[1], s.decimals))
          .replaceAll("{nz}", fmt(sec.normal[2], s.decimals))
          .replaceAll("{r}", fmt(sec.radius, s.decimals))
      )
      .join("\n\n");
  }, [sections, s.cfxTemplate, s.domain, s.unit, s.bound, s.decimals]);

  const csvText = useMemo(() => {
    const head = "Name,Cx,Cy,Cz,Nx,Ny,Nz,Radius,Unit";
    const rows = sections.map(
      (sec) =>
        `${sec.name},${fmt(sec.center[0], s.decimals)},${fmt(sec.center[1], s.decimals)},${fmt(
          sec.center[2],
          s.decimals
        )},${fmt(sec.normal[0], s.decimals)},${fmt(sec.normal[1], s.decimals)},${fmt(
          sec.normal[2],
          s.decimals
        )},${fmt(sec.radius, s.decimals)},${s.unit}`
    );
    return [head, ...rows].join("\n");
  }, [sections, s.decimals, s.unit]);

  const jsonText = useMemo(
    () =>
      JSON.stringify(
        {
          domain: s.domain,
          unit: s.unit,
          decimals: s.decimals,
          bound: s.bound,
          direction: moveDir,
          sections,
        },
        null,
        2
      ),
    [sections, moveDir, s.domain, s.unit, s.decimals, s.bound]
  );

  const output = tab === "PLANE" ? planeText : tab === "CSV" ? csvText : jsonText;

  // ---- Preview canvas ----
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    cv.width = w * dpr;
    cv.height = h * dpr;
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // background grid
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    const gs = 20;
    for (let x = 0; x < w; x += gs) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += gs) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    if (!baseCircle || sections.length === 0) return;

    // project all sections onto 2D: use direction as X-axis, normal as Y-axis (ish)
    const xAxis = unit(moveDir);
    let yAxis = unit(cross(baseCircle.normal, xAxis));
    if (norm(yAxis) < 1e-6) yAxis = unit(cross([0, 0, 1], xAxis));
    const project = (p: Vec3) => {
      const rel = sub(p, baseCircle.center);
      return [dot(rel, xAxis), dot(rel, yAxis)];
    };

    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    const pts = sections.map((sec) => {
      const [px, py] = project(sec.center);
      minX = Math.min(minX, px - sec.radius);
      maxX = Math.max(maxX, px + sec.radius);
      minY = Math.min(minY, py - sec.radius);
      maxY = Math.max(maxY, py + sec.radius);
      return { x: px, y: py, r: sec.radius, name: sec.name };
    });

    const pad = 20;
    const sx = (w - pad * 2) / Math.max(1e-6, maxX - minX);
    const sy = (h - pad * 2) / Math.max(1e-6, maxY - minY);
    const sc = Math.min(sx, sy);
    const ox = pad - minX * sc;
    const oy = h - (pad - minY * sc);

    // move direction line
    ctx.strokeStyle = "#94a3b8";
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(pts[0].x * sc + ox, oy - pts[0].y * sc);
    ctx.lineTo(pts[pts.length - 1].x * sc + ox, oy - pts[pts.length - 1].y * sc);
    ctx.stroke();
    ctx.setLineDash([]);

    // circles as ellipses seen from side ~ draw as small circles + centerline
    pts.forEach((p, i) => {
      const cx = p.x * sc + ox;
      const cy = oy - p.y * sc;
      const rr = Math.max(4, p.r * sc);
      // ellipse to hint 3D
      ctx.strokeStyle = i === 0 ? "hsl(214,70%,32%)" : "hsl(200,80%,40%)";
      ctx.lineWidth = i === 0 ? 2 : 1.4;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rr * 0.25, rr, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "hsl(214,70%,32%)";
      ctx.beginPath();
      ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#475569";
      ctx.font = "10px ui-sans-serif";
      ctx.fillText(p.name, cx + 6, cy - rr - 2);
    });
  }, [sections, baseCircle, moveDir]);

  // ---- Actions ----
  const generate = () => {
    if (!baseCircle) {
      toast.error("三点共线或输入无效，无法确定圆");
      setStatus("生成失败：基准圆无效");
      return;
    }
    if (!Number.isFinite(s.distance) || s.count < 1) {
      toast.error("距离或截面个数无效");
      return;
    }
    setStatus(`已生成 ${sections.length} 个截面`);
    toast.success(`已生成 ${sections.length} 个截面`);
  };

  const copyText = async (t: string, label: string) => {
    try {
      await navigator.clipboard.writeText(t);
      toast.success(`${label} 已复制到剪贴板`);
    } catch {
      toast.error("复制失败");
    }
  };

  const download = (t: string, filename: string, mime: string) => {
    const blob = new Blob([t], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveLocal = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    toast.success("基础数据已保存到本地");
  };
  const loadLocal = () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return toast.error("本地无已保存数据");
    try {
      setS({ ...defaultState, ...JSON.parse(raw) });
      toast.success("已恢复本地数据");
    } catch {
      toast.error("数据解析失败");
    }
  };
  const loadDemo = () => {
    setS(defaultState);
    toast.success("已载入示例数据");
  };

  // ---- Layout ----
  return (
    <div className="h-screen w-full flex flex-col bg-background text-foreground overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
        <div>
          <h1 className="text-[15px] font-semibold text-primary tracking-tight">
            CST / CFX-Post 圆截面生成器
          </h1>
          <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
            输入喷针域名和圆截面定义点，自动计算圆心、半径、法向量，按两圆心方向批量生成截面，输出 CFX-Post PLANE 块 / CSV / JSON。
          </p>
        </div>
        <div className="hidden md:flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="px-2 py-0.5 rounded bg-secondary">Engineering Utility</span>
          <span>v1.0</span>
        </div>
      </header>

      {/* Main two-col layout */}
      <div className="flex-1 flex min-h-0 flex-col lg:flex-row">
        {/* LEFT PARAM COLUMN */}
        <aside className="lg:w-[400px] lg:min-w-[360px] lg:max-w-[440px] border-b lg:border-b-0 lg:border-r border-border bg-[hsl(var(--background))] flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto eng-scroll p-2.5 space-y-2.5">
            {/* Params */}
            <Panel title="参数">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="eng-label">喷针域名</label>
                  <TextInput value={s.domain} onChange={(v) => set("domain", v)} />
                </div>
                <div>
                  <label className="eng-label">截面命名前缀</label>
                  <TextInput value={s.prefix} onChange={(v) => set("prefix", v)} />
                </div>
                <div>
                  <label className="eng-label">单位标签</label>
                  <TextInput value={s.unit} onChange={(v) => set("unit", v)} />
                </div>
                <div>
                  <label className="eng-label">小数位数</label>
                  <NumInput value={s.decimals} onChange={(v) => set("decimals", v)} step={1} />
                </div>
                <div className="col-span-2">
                  <label className="eng-label">CFX Plane Bound Radius</label>
                  <NumInput value={s.bound} onChange={(v) => set("bound", v)} />
                </div>
              </div>
            </Panel>

            {/* Base circle */}
            <Panel
              title="基准圆定义"
              right={
                <div className="flex items-center gap-1 text-[11px]">
                  {(["3pts", "center2pts"] as Mode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => set("mode", m)}
                      className={`px-2 h-6 rounded-sm border ${
                        s.mode === m
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border bg-background hover:bg-secondary"
                      }`}
                    >
                      {m === "3pts" ? "三点" : "圆心+两点"}
                    </button>
                  ))}
                </div>
              }
            >
              {s.mode === "3pts" ? (
                <>
                  <Vec3Input label="P1" value={s.P1} onChange={(v) => set("P1", v)} />
                  <Vec3Input label="P2" value={s.P2} onChange={(v) => set("P2", v)} />
                  <Vec3Input label="P3" value={s.P3} onChange={(v) => set("P3", v)} />
                </>
              ) : (
                <>
                  <Vec3Input label="C 圆心" value={s.C} onChange={(v) => set("C", v)} />
                  <Vec3Input label="R1 圆周点" value={s.R1} onChange={(v) => set("R1", v)} />
                  <Vec3Input label="R2 圆周点" value={s.R2} onChange={(v) => set("R2", v)} />
                </>
              )}
            </Panel>

            {/* Batch */}
            <Panel title="沿方向批量生成">
              <div className="flex items-center gap-2 text-[12px]">
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={s.includeFirst}
                    onChange={(e) => set("includeFirst", e.target.checked)}
                  />
                  结果包含第一个圆
                </label>
              </div>
              <div className="flex items-center gap-1 text-[11px]">
                <span className="text-muted-foreground mr-1">目标定义:</span>
                {(["3pts", "center2pts"] as Mode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => set("targetMode", m)}
                    className={`px-2 h-6 rounded-sm border ${
                      s.targetMode === m
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border bg-background hover:bg-secondary"
                    }`}
                  >
                    {m === "3pts" ? "Q1/Q2/Q3" : "C2 圆心"}
                  </button>
                ))}
              </div>
              {s.targetMode === "3pts" ? (
                <>
                  <Vec3Input label="Q1" value={s.Q1} onChange={(v) => set("Q1", v)} />
                  <Vec3Input label="Q2" value={s.Q2} onChange={(v) => set("Q2", v)} />
                  <Vec3Input label="Q3" value={s.Q3} onChange={(v) => set("Q3", v)} />
                </>
              ) : (
                <Vec3Input label="C2 目标圆心" value={s.C2} onChange={(v) => set("C2", v)} />
              )}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="eng-label">距离</label>
                  <NumInput value={s.distance} onChange={(v) => set("distance", v)} />
                </div>
                <div>
                  <label className="eng-label">截面个数</label>
                  <NumInput value={s.count} onChange={(v) => set("count", v)} step={1} />
                </div>
                <div>
                  <label className="eng-label">距离模式</label>
                  <select
                    className="eng-input"
                    value={s.distMode}
                    onChange={(e) => set("distMode", e.target.value as DistMode)}
                  >
                    <option value="step">步长</option>
                    <option value="total">总距离</option>
                  </select>
                </div>
              </div>
            </Panel>

            {/* Six nozzle rotate (collapsed default) */}
            <Panel title="六喷嘴旋转复制" collapsible defaultOpen={false}>
              <label className="inline-flex items-center gap-1.5 text-[12px]">
                <input
                  type="checkbox"
                  checked={s.sixEnabled}
                  onChange={(e) => set("sixEnabled", e.target.checked)}
                />
                启用旋转复制
              </label>
              {s.sixEnabled && (
                <>
                  <div>
                    <label className="eng-label">目标域名列表</label>
                    <TextInput value={s.sixDomains} onChange={(v) => set("sixDomains", v)} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="eng-label">喷嘴编号列表</label>
                      <TextInput value={s.sixNums} onChange={(v) => set("sixNums", v)} />
                    </div>
                    <div>
                      <label className="eng-label">基准喷嘴编号</label>
                      <NumInput value={s.sixBase} onChange={(v) => set("sixBase", v)} step={1} />
                    </div>
                    <div>
                      <label className="eng-label">相邻角度 (°)</label>
                      <NumInput value={s.sixAngle} onChange={(v) => set("sixAngle", v)} />
                    </div>
                    <div>
                      <label className="eng-label">旋转方向</label>
                      <select
                        className="eng-input"
                        value={s.sixDir}
                        onChange={(e) => set("sixDir", e.target.value as "cw" | "ccw")}
                      >
                        <option value="ccw">逆时针</option>
                        <option value="cw">顺时针</option>
                      </select>
                    </div>
                  </div>
                  <Vec3Input label="轴心" value={s.sixAxisOrigin} onChange={(v) => set("sixAxisOrigin", v)} />
                  <Vec3Input label="轴向" value={s.sixAxisDir} onChange={(v) => set("sixAxisDir", v)} />
                </>
              )}
            </Panel>

            {/* CFX template (collapsed) */}
            <Panel title="CFX-Post / CST 状态块模板（高级）" collapsible defaultOpen={false}>
              <p className="text-[11px] text-muted-foreground">
                占位符: {"{name} {domain} {unit} {bound} {cx} {cy} {cz} {nx} {ny} {nz} {r}"}
              </p>
              <textarea
                className="eng-input h-40 font-mono text-[11px] py-1.5"
                value={s.cfxTemplate}
                onChange={(e) => set("cfxTemplate", e.target.value)}
              />
            </Panel>
          </div>

          {/* Sticky action bar */}
          <div className="border-t border-border bg-card p-2 flex flex-wrap gap-1.5">
            <button className="eng-btn-primary flex-1 min-w-[120px]" onClick={generate}>
              生成截面
            </button>
            <button className="eng-btn" onClick={saveLocal}>保存</button>
            <button className="eng-btn" onClick={loadLocal}>恢复</button>
            <button className="eng-btn" onClick={loadDemo}>示例</button>
          </div>
        </aside>

        {/* RIGHT WORKSPACE */}
        <main className="flex-1 flex flex-col min-h-0 min-w-0 bg-background">
          {/* Preview */}
          <section className="eng-panel m-2 mb-1 flex flex-col" style={{ height: 220 }}>
            <div className="eng-panel-header">
              <h3 className="eng-panel-title">截面预览</h3>
              <span className="text-[11px] text-muted-foreground">{status}</span>
            </div>
            <div className="flex-1 flex min-h-0">
              {/* Metrics 2x2 */}
              <div className="w-[260px] p-2 grid grid-cols-2 gap-1.5 border-r border-border">
                <div className="eng-metric">
                  <div className="text-[10px] text-muted-foreground">基准圆心</div>
                  <div className="font-mono text-[11px] text-foreground leading-tight">
                    {baseCircle
                      ? `${fmt(baseCircle.center[0], 3)}, ${fmt(baseCircle.center[1], 3)}, ${fmt(baseCircle.center[2], 3)}`
                      : "—"}
                  </div>
                </div>
                <div className="eng-metric">
                  <div className="text-[10px] text-muted-foreground">半径</div>
                  <div className="font-mono text-[12px] text-primary font-semibold">
                    {baseCircle ? fmt(baseCircle.radius, 4) : "—"} {s.unit}
                  </div>
                </div>
                <div className="eng-metric">
                  <div className="text-[10px] text-muted-foreground">法向量</div>
                  <div className="font-mono text-[11px] leading-tight">
                    {baseCircle
                      ? `${fmt(baseCircle.normal[0], 3)}, ${fmt(baseCircle.normal[1], 3)}, ${fmt(baseCircle.normal[2], 3)}`
                      : "—"}
                  </div>
                </div>
                <div className="eng-metric">
                  <div className="text-[10px] text-muted-foreground">移动方向</div>
                  <div className="font-mono text-[11px] leading-tight">
                    {`${fmt(moveDir[0], 3)}, ${fmt(moveDir[1], 3)}, ${fmt(moveDir[2], 3)}`}
                  </div>
                </div>
              </div>
              <div className="flex-1 min-w-0 p-1.5">
                <canvas ref={canvasRef} className="w-full h-full rounded-sm border border-border" />
              </div>
            </div>
          </section>

          {/* Output */}
          <section className="eng-panel m-2 mt-1 flex-1 flex flex-col min-h-0">
            <div className="eng-panel-header !py-0">
              <div className="flex items-center">
                {(["PLANE", "CSV", "JSON"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`eng-tab ${tab === t ? "eng-tab-active" : ""}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <button className="eng-btn-ghost" onClick={() => copyText(output, tab)}>
                  复制输出
                </button>
                <button className="eng-btn-ghost" onClick={() => copyText(csvText, "CSV")}>
                  复制 CSV
                </button>
                <button
                  className="eng-btn-ghost"
                  onClick={() => download(planeText, "sections.cst", "text/plain")}
                >
                  下载 .cst
                </button>
                <button
                  className="eng-btn-ghost"
                  onClick={() => download(csvText, "sections.csv", "text/csv")}
                >
                  下载 .csv
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 bg-[hsl(var(--code-bg))] rounded-b-md">
              <pre
                className="h-full w-full overflow-auto eng-scroll p-3 font-mono text-[12px] leading-relaxed text-[hsl(var(--code-fg))] whitespace-pre"
              >
                {output || "# 尚无输出"}
              </pre>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default Index;
