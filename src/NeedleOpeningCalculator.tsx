import { ArrowLeftRight, Download, LockKeyhole, LockKeyholeOpen, Plus, Ruler, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createNeedleOpeningRecord,
  openingPercentFromTravel,
  travelFromOpeningPercent,
} from "./needle-opening";
import type { NeedleOpeningRecord } from "./needle-opening";
import { exportNeedleOpeningExcel } from "./needle-opening-export";

type InputSide = "travel" | "opening";
const maximumStorageKey = "pelton-needle-maximum-v1";

function readStoredMaximum(): { value: string; locked: boolean } {
  try {
    const stored = JSON.parse(window.localStorage.getItem(maximumStorageKey) || "null");
    if (stored && typeof stored.value === "string" && typeof stored.locked === "boolean") {
      return stored;
    }
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
  return { value: "", locked: false };
}

function displayNumber(value: number): string {
  return Number(value.toPrecision(12)).toString();
}

function convert(
  maximumText: string,
  inputText: string,
  side: InputSide,
): string {
  if (!maximumText.trim() || !inputText.trim()) return "";
  try {
    const maximum = Number(maximumText);
    const input = Number(inputText);
    const result =
      side === "travel"
        ? openingPercentFromTravel(maximum, input)
        : travelFromOpeningPercent(maximum, input);
    return displayNumber(result);
  } catch {
    return "";
  }
}

export default function NeedleOpeningCalculator({
  onClose,
}: {
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const maximumRef = useRef<HTMLInputElement>(null);
  const travelRef = useRef<HTMLInputElement>(null);
  const openingRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const [storedMaximum, setStoredMaximum] = useState(readStoredMaximum);
  const maximumText = storedMaximum.value;
  const maximumLocked = storedMaximum.locked;
  const [travelText, setTravelText] = useState("");
  const [openingText, setOpeningText] = useState("");
  const [lastEdited, setLastEdited] = useState<InputSide>("travel");
  const [records, setRecords] = useState<Array<NeedleOpeningRecord & { id: number }>>([]);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    (maximumLocked ? travelRef : maximumRef).current?.focus();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(maximumStorageKey, JSON.stringify(storedMaximum));
    } catch {
      // Calculation still works when browser storage is blocked.
    }
  }, [storedMaximum]);

  const result = useMemo(() => {
    if (!maximumText.trim()) return { text: "先填写喷针最大移动距离。", valid: false };
    const maximum = Number(maximumText);
    if (!Number.isFinite(maximum) || maximum <= 0) {
      return { text: "最大移动距离必须大于 0 mm。", valid: false };
    }
    const sourceText = lastEdited === "travel" ? travelText : openingText;
    if (!sourceText.trim()) {
      return { text: "填写移动距离或开度，另一项会自动换算。", valid: false };
    }
    try {
      if (lastEdited === "travel") {
        openingPercentFromTravel(maximum, Number(sourceText));
      } else {
        travelFromOpeningPercent(maximum, Number(sourceText));
      }
    } catch (error) {
      return { text: (error as Error).message, valid: false };
    }
    return {
      text: `${travelText} mm 对应 ${openingText}% 开度（系数 ${displayNumber(Number(openingText) / 100)}）`,
      valid: true,
    };
  }, [maximumText, travelText, openingText, lastEdited]);

  const onMaximumChange = (value: string) => {
    if (maximumLocked) return;
    setStoredMaximum((previous) => ({ ...previous, value }));
    if (lastEdited === "travel") {
      setOpeningText(convert(value, travelText, "travel"));
    } else {
      setTravelText(convert(value, openingText, "opening"));
    }
  };

  const toggleMaximumLock = () => {
    if (!maximumLocked && (!Number.isFinite(Number(maximumText)) || Number(maximumText) <= 0)) return;
    setStoredMaximum((previous) => ({ ...previous, locked: !previous.locked }));
    if (maximumLocked) window.requestAnimationFrame(() => maximumRef.current?.focus());
  };

  const onTravelChange = (value: string) => {
    setLastEdited("travel");
    setTravelText(value);
    setOpeningText(convert(maximumText, value, "travel"));
  };

  const onOpeningChange = (value: string) => {
    setLastEdited("opening");
    setOpeningText(value);
    setTravelText(convert(maximumText, value, "opening"));
  };

  const addResult = () => {
    if (!result.valid) return;
    const value = Number(lastEdited === "travel" ? travelText : openingText);
    try {
      const record = createNeedleOpeningRecord(Number(maximumText), value, lastEdited);
      setRecords((previous) => [...previous, { ...record, id: nextId.current++ }]);
      setTravelText("");
      setOpeningText("");
      setExportMessage("");
      (lastEdited === "travel" ? travelRef : openingRef).current?.focus();
    } catch {
      // The live validation above already shows the relevant input error.
    }
  };

  const exportResults = async () => {
    if (records.length === 0 || exporting) return;
    setExporting(true);
    setExportMessage("");
    try {
      const saved = await exportNeedleOpeningExcel(records);
      setExportMessage(saved ? "Excel 文件已保存。" : "已取消保存，计算结果仍在此处。");
    } catch (error) {
      setExportMessage(`导出失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="needle-dialog"
      data-toolbox-modal
      aria-labelledby="needle-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="needle-dialog-content">
        <header className="needle-dialog-header">
          <span className="needle-dialog-icon" aria-hidden="true"><Ruler size={20} /></span>
          <div>
            <h2 id="needle-dialog-title">喷针开度计算</h2>
            <p>移动距离与开度双向换算，可汇总多组结果</p>
          </div>
          <button
            type="button"
            className="needle-dialog-close"
            aria-label="关闭喷针开度计算"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>

        <p className="needle-formula">开度 (%) =（1 − 移动距离 ÷ 最大移动距离）× 100</p>

        <div className="needle-maximum-row">
          <label className="needle-field" htmlFor="needle-maximum">
            <span>最大移动距离</span>
            <span className={`needle-input-wrap${maximumLocked ? " is-locked" : ""}`}>
              <input
                ref={maximumRef}
                id="needle-maximum"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="例如 80"
                value={maximumText}
                readOnly={maximumLocked}
                onChange={(event) => onMaximumChange(event.target.value)}
              />
              <span>mm</span>
            </span>
          </label>
          <button
            type="button"
            className={`needle-lock${maximumLocked ? " is-locked" : ""}`}
            disabled={!maximumLocked && (!Number.isFinite(Number(maximumText)) || Number(maximumText) <= 0)}
            aria-pressed={maximumLocked}
            onClick={toggleMaximumLock}
          >
            {maximumLocked ? <LockKeyhole size={15} aria-hidden="true" /> : <LockKeyholeOpen size={15} aria-hidden="true" />}
            {maximumLocked ? "解锁修改" : "锁定行程"}
          </button>
        </div>

        <div className="needle-conversion-row">
          <label className="needle-field" htmlFor="needle-travel">
            <span>移动距离</span>
            <span className="needle-input-wrap">
              <input
                ref={travelRef}
                id="needle-travel"
                type="number"
                inputMode="decimal"
                min="0"
                max={maximumText || undefined}
                step="any"
                placeholder="输入距离"
                value={travelText}
                onChange={(event) => onTravelChange(event.target.value)}
              />
              <span>mm</span>
            </span>
          </label>
          <ArrowLeftRight className="needle-swap-icon" size={20} aria-hidden="true" />
          <label className="needle-field" htmlFor="needle-opening">
            <span>喷针开度</span>
            <span className="needle-input-wrap">
              <input
                ref={openingRef}
                id="needle-opening"
                type="number"
                inputMode="decimal"
                min="0"
                max="100"
                step="any"
                placeholder="输入开度"
                value={openingText}
                onChange={(event) => onOpeningChange(event.target.value)}
              />
              <span>%</span>
            </span>
          </label>
        </div>

        <div className="needle-current-row">
          <div
            className={`needle-result${result.valid ? " is-valid" : ""}`}
            role="status"
            aria-live="polite"
          >
            {result.text}
          </div>
          <button type="button" className="needle-add" disabled={!result.valid} onClick={addResult}>
            <Plus size={16} aria-hidden="true" /> 添加结果
          </button>
        </div>
        <p className="needle-dialog-note">移动距离为 0 mm 时开度为 100%，达到最大移动距离时开度为 0%。可连续添加多组结果。</p>

        <section className="needle-records" aria-label="已添加的开度结果">
          <div className="needle-records-heading">
            <div>
              <h3>已添加结果 <span>{records.length}</span></h3>
              <p>多组结果同时查看，并可导出为 Excel。</p>
            </div>
            <button
              type="button"
              className="needle-export"
              disabled={records.length === 0 || exporting}
              onClick={exportResults}
            >
              <Download size={15} aria-hidden="true" />
              {exporting ? "正在导出…" : "导出 Excel"}
            </button>
          </div>
          {records.length === 0 ? (
            <div className="needle-empty">填写上方数据并点击“添加结果”，即可在这里比较多个开度。</div>
          ) : (
            <div className="needle-table-scroll">
              <table className="needle-table">
                <thead><tr>
                  <th scope="col">序号</th>
                  <th scope="col">最大移动距离</th>
                  <th scope="col">移动距离</th>
                  <th scope="col">喷针开度</th>
                  <th scope="col">开度系数</th>
                  <th scope="col">操作</th>
                </tr></thead>
                <tbody>
                  {records.map((record, index) => (
                    <tr key={record.id}>
                      <td>{index + 1}</td>
                      <td>{displayNumber(record.maximumMm)} mm</td>
                      <td>{displayNumber(record.travelMm)} mm</td>
                      <td className="needle-table-primary">{displayNumber(record.openingPercent)}%</td>
                      <td>{displayNumber(record.openingFactor)}</td>
                      <td><button
                        type="button"
                        className="needle-delete"
                        aria-label={`删除第 ${index + 1} 组结果`}
                        onClick={() => setRecords((previous) => previous.filter((item) => item.id !== record.id))}
                      ><Trash2 size={15} aria-hidden="true" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {exportMessage && <p className="needle-export-message" role="status">{exportMessage}</p>}
        </section>
      </div>
    </dialog>
  );
}
