import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

const vec3 = z.array(z.number()).length(3).describe("[X, Y, Z] coordinates");

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: V, s: number): V => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: V) => Math.sqrt(dot(a, a));
const unit = (a: V): V => {
  const n = norm(a);
  return n < 1e-12 ? [0, 0, 0] : [a[0] / n, a[1] / n, a[2] / n];
};

export default defineTool({
  name: "circle_from_3_points",
  title: "Circle from 3 points",
  description:
    "Compute the circle (center, radius, unit normal) that passes through three 3D points. Returns null-like error if the points are collinear.",
  inputSchema: {
    p1: vec3,
    p2: vec3,
    p3: vec3,
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ p1, p2, p3 }) => {
    const P1 = p1 as V, P2 = p2 as V, P3 = p3 as V;
    const v1 = sub(P2, P1);
    const v2 = sub(P3, P1);
    const n = cross(v1, v2);
    if (norm(n) < 1e-10) {
      return {
        content: [{ type: "text", text: "Points are collinear; circle is undefined." }],
        isError: true,
      };
    }
    const nrm = unit(n);
    const v1sq = dot(v1, v1);
    const v2sq = dot(v2, v2);
    const denom = 2 * dot(n, n);
    const alpha = (v2sq * dot(v1, sub(v1, v2))) / denom;
    const beta = (v1sq * dot(v2, sub(v2, v1))) / denom;
    const center = add(P1, add(scale(v1, alpha), scale(v2, beta)));
    const radius = norm(sub(P1, center));
    const result = { center, radius, normal: nrm };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  },
});
