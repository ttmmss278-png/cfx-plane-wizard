function validateMaximum(maximumMm: number): void {
  if (!Number.isFinite(maximumMm) || maximumMm <= 0) {
    throw new RangeError("最大移动距离必须大于 0 mm。");
  }
}

export function openingPercentFromTravel(
  maximumMm: number,
  travelMm: number,
): number {
  validateMaximum(maximumMm);
  if (!Number.isFinite(travelMm) || travelMm < 0 || travelMm > maximumMm) {
    throw new RangeError("移动距离必须在 0 到最大移动距离之间。");
  }
  // Equivalent to (1 - travelMm / maximumMm) * 100; full travel is 0% opening.
  return ((maximumMm - travelMm) * 100) / maximumMm;
}

export function travelFromOpeningPercent(
  maximumMm: number,
  openingPercent: number,
): number {
  validateMaximum(maximumMm);
  if (
    !Number.isFinite(openingPercent) ||
    openingPercent < 0 ||
    openingPercent > 100
  ) {
    throw new RangeError("开度必须在 0% 到 100% 之间。");
  }
  return (maximumMm * (100 - openingPercent)) / 100;
}

export type NeedleOpeningRecord = {
  maximumMm: number;
  travelMm: number;
  openingPercent: number;
  openingFactor: number;
};

export function createNeedleOpeningRecord(
  maximumMm: number,
  value: number,
  source: "travel" | "opening",
): NeedleOpeningRecord {
  const travelMm =
    source === "travel" ? value : travelFromOpeningPercent(maximumMm, value);
  const openingPercent =
    source === "travel" ? openingPercentFromTravel(maximumMm, value) : value;
  return {
    maximumMm,
    travelMm,
    openingPercent,
    openingFactor: openingPercent / 100,
  };
}
