import type { NeedleOpeningRecord } from "./needle-opening";

type WritableFile = {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
};

type SaveFileHandle = {
  createWritable(): Promise<WritableFile>;
};

type SavePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<SaveFileHandle>;
};

export async function exportNeedleOpeningExcel(
  records: NeedleOpeningRecord[],
): Promise<boolean> {
  if (records.length === 0) throw new Error("请先添加至少一条计算结果。");

  // Load the spreadsheet library only when exporting, keeping the homepage light.
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.aoa_to_sheet([
    ["序号", "最大移动距离 (mm)", "移动距离 (mm)", "喷针开度 (%)", "开度系数"],
    ...records.map((record, index) => [
      index + 1,
      record.maximumMm,
      record.travelMm,
      record.openingPercent,
      record.openingFactor,
    ]),
  ]);
  sheet["!cols"] = [{ wch: 8 }, { wch: 22 }, { wch: 20 }, { wch: 18 }, { wch: 16 }];
  sheet["!autofilter"] = { ref: `A1:E${records.length + 1}` };
  for (let row = 2; row <= records.length + 1; row += 1) {
    for (const column of ["B", "C", "D", "E"]) {
      sheet[`${column}${row}`].z = "0.##########";
    }
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "喷针开度");
  const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const today = new Date();
  const date = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
  const filename = `喷针开度计算_${date}.xlsx`;

  const picker = (window as SavePickerWindow).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({
        suggestedName: filename,
        types: [{
          description: "Excel 工作簿",
          accept: {
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
          },
        }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return false;
      throw error;
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
