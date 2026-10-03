/* Shared geometry and naming for PLANE, CSV and JSON exports. */
(function (root) {
  "use strict";
  const vectorValid = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
  const add = (a, b) => a.map((n, i) => n + b[i]);
  const subtract = (a, b) => a.map((n, i) => n - b[i]);
  const scale = (a, s) => a.map((n) => n * s);
  const dot = (a, b) => a.reduce((n, x, i) => n + x * b[i], 0);
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const length = (v) => Math.hypot(...v);
  const normalize = (v) => scale(v, 1 / length(v));
  const list = (value) => String(value ?? "").split(/[,，;；\n]+/).map((v) => v.trim()).filter(Boolean);
  function rotate(v, axis, radians) {
    // Rodrigues rotation; positive angles follow the right hand rule around axis.
    const c = Math.cos(radians), s = Math.sin(radians);
    return add(add(scale(v, c), scale(cross(axis, v), s)), scale(axis, dot(axis, v) * (1-c)));
  }
  function generate(config, circle, direction) {
    try {
      if (!circle) return {sections: [], error: "基准圆无效，请检查定义点。"};
      if (!vectorValid(circle.center) || !vectorValid(circle.normal) || !Number.isFinite(circle.radius) || circle.radius <= 0 || length(circle.normal) === 0) throw new Error("基准圆坐标、半径或法向无效。");
      if (!vectorValid(direction) || length(direction) === 0) throw new Error("移动方向无效，请检查目标圆定义。");
      if (!Number.isInteger(config.count) || config.count < 1 || config.count > 10000 || !Number.isFinite(config.distance)) throw new Error("截面个数应为 1～10000 的整数，距离必须有效。");
      if (!String(config.prefix).trim()) throw new Error("请填写截面命名前缀。");
      const domain = String(config.domain ?? "").trim();
      if (!domain) throw new Error("请填写基准喷针域名，例如 B1。");
      const numbered = config.nozzleNaming === true;
      const base = Number(config.sixBase);
      if ((numbered || config.sixEnabled) && (!Number.isInteger(base) || base < 1)) throw new Error("基准喷嘴编号应为正整数。");
      let targets = [{domain, nozzle: base, angle: 0}];
      let origin = [0, 0, 0], axis = [0, 0, 1];
      if (config.sixEnabled) {
        const domains = list(config.sixDomains), rawNums = list(config.sixNums), nums = rawNums.map(Number);
        if (domains.length !== 6 || nums.length !== 6) throw new Error("六喷嘴复制需要 6 个目标域名和 6 个喷嘴编号，按位置一一对应。");
        if (new Set(domains).size !== 6 || new Set(nums).size !== 6 || nums.some((n) => !Number.isInteger(n) || n < 1)) throw new Error("目标域名和喷嘴编号不能重复，编号必须为正整数。");
        const baseIndex = nums.indexOf(base);
        if (baseIndex < 0 || domains[baseIndex] !== domain) throw new Error("基准喷针域名必须与基准喷嘴编号对应的目标域名一致。");
        if (!Number.isFinite(config.sixAngle) || config.sixAngle <= 0 || config.sixAngle >= 360) throw new Error("相邻角度应大于 0 且小于 360°。");
        if (!vectorValid(config.sixAxisOrigin) || !vectorValid(config.sixAxisDir) || length(config.sixAxisDir) === 0) throw new Error("旋转轴心必须有效，轴向不能为零。");
        origin = config.sixAxisOrigin;
        axis = normalize(config.sixAxisDir);
        const sign = config.sixDir === "cw" ? -1 : 1;
        targets = domains.map((name, i) => ({domain: name, nozzle: nums[i], angle: sign * (i - baseIndex) * config.sixAngle * Math.PI / 180}));
      }
      const sections = [];
      targets.forEach((target) => {
        for (let i = 0; i < config.count; i++) {
          const step = config.includeFirst ? i : i + 1;
          const denominator = config.includeFirst ? Math.max(1, config.count - 1) : config.count;
          const distance = step * config.distance / (config.distMode === "total" ? denominator : 1);
          const center = add(circle.center, scale(direction, distance));
          const suffix = String(numbered ? i * 5 : i + 1).padStart(2, "0");
          // Number labels count output rows; they never change physical spacing.
          const name = numbered ? `${config.prefix}${target.nozzle} ${suffix}`
            : config.sixEnabled ? `${config.prefix}${target.nozzle}_${suffix}` : `${config.prefix}${suffix}`;
          sections.push({name, domain: target.domain, nozzle: target.nozzle, section: i + 1,
            rotationDegrees: target.angle * 180 / Math.PI,
            center: target.angle === 0 ? center : add(origin, rotate(subtract(center, origin), axis, target.angle)),
            radius: circle.radius,
            normal: target.angle === 0 ? circle.normal.slice() : rotate(circle.normal, axis, target.angle)});
        }
      });
      return {sections, error: ""};
    } catch (error) {
      return {sections: [], error: error.message};
    }
  }
  root.PlaneSectionGeneration = Object.freeze({generate});
})(globalThis);
