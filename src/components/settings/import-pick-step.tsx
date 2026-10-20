// First step of the Wise import: a drop zone for the CSV (drag from Finder or
// click to choose) and the destination wallet as chips — every option visible,
// one click to pick.

import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { Check, FileSpreadsheet, FileUp } from "lucide-react";

export function ImportSteps({ current }: { current: 0 | 1 | 2 }) {
  const steps = ["Statement", "Review", "Done"];
  return (
    <div className="flex items-center gap-1.5 text-[12px]">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={label} className="flex items-center gap-1.5">
            {i > 0 && <span className={`w-4 h-px ${done || active ? "bg-gray-900" : "bg-gray-200"}`} />}
            <span
              className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-semibold ${
                active ? "bg-black text-white" : done ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-400"
              }`}
            >
              {done ? <Check size={11} strokeWidth={3} /> : i + 1}
            </span>
            <span className={active ? "font-medium text-gray-900" : "text-gray-400"}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

interface Props {
  filePath: string;
  onPickFile: () => void;
  onDropFile: (path: string) => void;
  wallets: { id: string; name: string }[];
  walletId: string;
  onWallet: (id: string) => void;
  busy: boolean;
}

export function ImportPickStep({ filePath, onPickFile, onDropFile, wallets, walletId, onWallet, busy }: Props) {
  const [dragging, setDragging] = useState(false);
  const fileName = filePath.split("/").pop();

  // Files dragged in from Finder arrive as native drag-drop events (the
  // webview doesn't expose real paths to HTML drop handlers).
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    let webview: ReturnType<typeof getCurrentWebview>;
    try {
      webview = getCurrentWebview();
    } catch {
      return; // Not running inside Tauri (browser preview): click-to-choose still works.
    }
    webview
      .onDragDropEvent((event) => {
        const p = event.payload;
        if (p.type === "enter" || p.type === "over") setDragging(true);
        else if (p.type === "leave") setDragging(false);
        else if (p.type === "drop") {
          setDragging(false);
          const csv = p.paths.find((path) => path.toLowerCase().endsWith(".csv"));
          if (csv) onDropFile(csv);
        }
      })
      .then((fn) => (cancelled ? fn() : (unlisten = fn)))
      .catch(() => {
        // Not running inside Tauri (e.g. a browser preview): click-to-choose still works.
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [onDropFile]);

  return (
    <div className="flex flex-col gap-5 pt-2">
      {filePath ? (
        <div className="flex items-center gap-3 rounded-2xl bg-gray-50 p-3 pl-3.5">
          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
            <FileSpreadsheet size={20} className="text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate" title={filePath}>{fileName}</div>
            <div className="text-xs text-emerald-700 flex items-center gap-1">
              <Check size={12} strokeWidth={3} /> Ready to review
            </div>
          </div>
          <button
            type="button"
            onClick={onPickFile}
            disabled={busy}
            className="h-9 px-4 rounded-full bg-[#F3F4F6] text-[13px] font-medium text-black hover:bg-black hover:text-white transition-colors flex-shrink-0"
          >
            Change
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onPickFile}
          disabled={busy}
          className={`group flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 transition-colors ${
            dragging ? "border-black bg-gray-100" : "border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100"
          }`}
        >
          <span
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
              dragging ? "bg-black text-white" : "bg-white text-black shadow-sm group-hover:bg-black group-hover:text-white"
            }`}
          >
            <FileUp size={22} />
          </span>
          <span className="text-sm font-medium text-gray-900">
            {dragging ? "Drop to add the statement" : "Drop your Wise statement here"}
          </span>
          <span className="text-xs text-gray-500">
            or <span className="font-medium text-gray-900 underline underline-offset-2">choose a CSV file</span>
          </span>
        </button>
      )}

      <div>
        <div className="text-sm font-medium text-gray-900">Import into</div>
        <div className="text-xs text-gray-500 mb-2.5">Card payments and direct debits go to this wallet</div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Import into">
          {wallets.map((w) => {
            const active = w.id === walletId;
            return (
              <button
                key={w.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onWallet(w.id)}
                className={`inline-flex items-center gap-1.5 h-9 rounded-full border text-[13px] font-medium transition-colors ${
                  active
                    ? "border-black bg-white text-black pl-2.5 pr-3.5 ring-1 ring-black"
                    : "border-gray-200 bg-white text-gray-600 px-3.5 hover:border-gray-400 hover:text-black"
                }`}
              >
                {active && (
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-black text-white">
                    <Check size={10} strokeWidth={3.5} />
                  </span>
                )}
                {w.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
