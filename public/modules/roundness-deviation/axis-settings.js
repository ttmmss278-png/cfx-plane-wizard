export function axisDraftError(axis) {
  const keys = ["ax", "ay", "az", "bx", "by", "bz"];
  if (keys.some(key => axis?.[key] === undefined || String(axis[key]).trim() === "" || !Number.isFinite(Number(axis[key])))) {
    return "请填写 A、B 两点的全部六个有效坐标。";
  }
  const values = keys.map(key => Number(axis[key]));
  if (Math.hypot(values[3] - values[0], values[4] - values[1], values[5] - values[2]) <= 1e-12) {
    return "A、B 两点不能重合，请检查坐标。";
  }
  return "";
}
