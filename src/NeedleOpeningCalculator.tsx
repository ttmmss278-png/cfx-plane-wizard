import { ArrowLeftRight, Ruler, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  openingPercentFromTravel,
  travelFromOpeningPercent,
} from "./needle-opening";

type InputSide = "travel" | "opening";

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
  const [maximumText, setMaximumText] = useState("");
  const [travelText, setTravelText] = useState("");
  const [openingText, setOpeningText] = useState("");
  const [lastEdited, setLastEdited] = useState<InputSide>("travel");

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    maximumRef.current?.focus();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

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
    setMaximumText(value);
    if (lastEdited === "travel") {
      setOpeningText(convert(value, travelText, "travel"));
    } else {
      setTravelText(convert(value, openingText, "opening"));
    }
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
            <p>最大行程与喷针移动距离双向换算</p>
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

        <p className="needle-formula">
          开度系数 = 1 −（最大移动距离 − 移动距离）÷ 最大移动距离；开度 (%) = 系数 × 100
        </p>

        <label className="needle-field" htmlFor="needle-maximum">
          <span>最大移动距离</span>
          <span className="needle-input-wrap">
            <input
              ref={maximumRef}
              id="needle-maximum"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              placeholder="例如 80"
              value={maximumText}
              onChange={(event) => onMaximumChange(event.target.value)}
            />
            <span>mm</span>
          </span>
        </label>

        <div className="needle-conversion-row">
          <label className="needle-field" htmlFor="needle-travel">
            <span>移动距离</span>
            <span className="needle-input-wrap">
              <input
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

        <div
          className={`needle-result${result.valid ? " is-valid" : ""}`}
          role="status"
          aria-live="polite"
        >
          {result.text}
        </div>
        <p className="needle-dialog-note">0% 对应 0 mm，100% 对应最大移动距离。输入任意一侧即可换算。</p>
      </div>
    </dialog>
  );
}
