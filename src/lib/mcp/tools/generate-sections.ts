import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

const vec3 = z.array(z.number()).length(3).describe("[X, Y, Z]");

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: V, s: number): V => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V) => Math.sqrt(dot(a, a));
const unit = (a: V): V => {
  const n = norm(a);
  return n < 1e-12 ? [0, 0, 0] : [a[0] / n, a[1] / n, a[2] / n];
};

const PLANE_TPL = `LIBRARY:
  PLANE: {name}
    Apply Instancing Transform = On
    Bound Radius = {bound} [{unit}]
    Domain List = {domain}
    Option = Point and Normal
    Plane Bounds = Circular
    Plane Type = Slice
    Point = {cx} [{unit}], {cy} [{unit}], {cz} [{unit}]
    Normal = {nx}, {ny}, {nz}
  END
END`;

export default defineTool({
  name: "generate_sections",
  title: "Generate circular sections along a direction",
  description:
    "Given a base circle center C1 and a target circle center C2, generate N circular sections stepping from C1 toward C2 (or by fixed step). Returns CFX-Post PLANE blocks, a CSV table, and a JSON array.",
  inputSchema: {
    c1: vec3.describe("Base circle center"),
    c2: vec3.describe("Target circle center (defines direction)"),
    normal: vec3.describe("Unit normal of the base circle"),
    radius: z.number().positive().describe("Radius applied to every generated section"),
    count: z.number().int().min(1).max(500).describe("Number of sections to generate"),
    include_first: z.boolean().default(true).describe("Include the base circle (C1) as the first section"),
    dist_mode: z.enum(["step", "total"]).default("total")
      .describe("'total' = spread N points from C1 to C2; 'step' = each section separated by `step` along the C1→C2 direction"),
    step: z.number().default(0).describe("Step distance in units (used when dist_mode='step')"),
    prefix: z.string().default("SEC").describe("Section name prefix"),
    domain: z.string().default("Nozzle").describe("CFX domain name"),
    unit: z.string().default("mm").describe("CFX unit label, e.g. mm or m"),
    bound: z.number().default(50).describe("CFX Plane Bound Radius (in `unit`)"),
    decimals: z.number().int().min(0).max(10).default(6),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (args) => {
    const C1 = args.c1 as V;
    const C2 = args.c2 as V;
    const N = args.normal as V;
    const dir = sub(C2, C1);
    const dist = norm(dir);
    if (dist < 1e-10) {
      return { content: [{ type: "text", text: "C1 and C2 are identical; direction undefined." }], isError: true };
    }
    const u = unit(dir);
    const startIdx = args.include_first ? 0 : 1;
    const centers: V[] = [];
    if (args.dist_mode === "total") {
      const denom = args.include_first ? Math.max(args.count - 1, 1) : args.count;
      for (let i = startIdx; i < (args.include_first ? args.count : args.count + 1); i++) {
        const t = i / denom;
        centers.push(add(C1, scale(u, t * dist)));
        if (centers.length >= args.count) break;
      }
    } else {
      for (let i = 0; i < args.count + (args.include_first ? 0 : 1); i++) {
        if (!args.include_first && i === 0) continue;
        centers.push(add(C1, scale(u, i * args.step)));
        if (centers.length >= args.count) break;
      }
    }

    const d = args.decimals;
    const f = (n: number) => n.toFixed(d);
    const sections = centers.map((c, i) => ({
      name: `${args.prefix}_${String(i + 1).padStart(2, "0")}`,
      center: c,
      normal: N,
      radius: args.radius,
    }));

    const plane = sections
      .map((s) =>
        PLANE_TPL.replace(/\{(name|domain|unit|bound|cx|cy|cz|nx|ny|nz|r)\}/g, (_, k) => {
          const map: Record<string, string> = {
            name: s.name,
            domain: args.domain,
            unit: args.unit,
            bound: String(args.bound),
            cx: f(s.center[0]),
            cy: f(s.center[1]),
            cz: f(s.center[2]),
            nx: f(s.normal[0]),
            ny: f(s.normal[1]),
            nz: f(s.normal[2]),
            r: f(s.radius),
          };
          return map[k] ?? "";
        }),
      )
      .join("\n\n");

    const csv =
      "name,cx,cy,cz,nx,ny,nz,radius\n" +
      sections.map((s) => [s.name, ...s.center, ...s.normal, s.radius].map((v) => (typeof v === "number" ? f(v) : v)).join(",")).join("\n");

    const summary = `Generated ${sections.length} section(s) along [${f(u[0])}, ${f(u[1])}, ${f(u[2])}] over ${f(dist)} ${args.unit}.`;

    return {
      content: [
        { type: "text", text: summary },
        { type: "text", text: "PLANE:\n" + plane },
        { type: "text", text: "CSV:\n" + csv },
      ],
      structuredContent: { count: sections.length, sections, plane, csv },
    };
  },
});
