import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

const vec3 = z.array(z.number()).length(3).describe("[X, Y, Z] coordinates");

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
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
  name: "circle_from_center_and_2_points",
  title: "Circle from center + 2 rim points",
  description:
    "Compute the circle (center, radius = mean of the two distances, unit normal) from a center point and two points on the rim.",
  inputSchema: {
    center: vec3,
    r1: vec3,
    r2: vec3,
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ center, r1, r2 }) => {
    const C = center as V, R1 = r1 as V, R2 = r2 as V;
    const v1 = sub(R1, C);
    const v2 = sub(R2, C);
    const n = cross(v1, v2);
    if (norm(n) < 1e-10) {
      return {
        content: [{ type: "text", text: "Rim vectors are collinear; normal is undefined." }],
        isError: true,
      };
    }
    const result = { center: C, radius: (norm(v1) + norm(v2)) / 2, normal: unit(n) };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  },
});
