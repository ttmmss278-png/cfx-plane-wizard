import { defineMcp } from "@lovable.dev/mcp-js";
import circleFrom3PointsTool from "./tools/circle-from-3-points";
import circleFromCenterTool from "./tools/circle-from-center";
import generateSectionsTool from "./tools/generate-sections";

export default defineMcp({
  name: "cfx-circle-section-mcp",
  title: "CST / CFX-Post Circle Section Generator",
  version: "0.1.0",
  instructions:
    "Compute 3D circle geometry (center, radius, unit normal) from 3 points or from a center + 2 rim points, and batch-generate circular cross sections along a direction. Outputs CFX-Post PLANE blocks, CSV, and JSON so an assistant can prepare CFD post-processing inputs.",
  tools: [circleFrom3PointsTool, circleFromCenterTool, generateSectionsTool],
});
