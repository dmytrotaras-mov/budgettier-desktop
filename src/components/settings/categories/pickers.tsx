// Icon and color pickers for groups and categories.
//
// EmojiPicker: a searchable grid of curated emoji, plus a field that accepts
// any emoji — on a Mac, ⌃⌘Space opens the system Character Viewer there.
// ColorPicker: sixteen swatches (the first eight are the validated palette)
// and a custom color.

import { useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Search } from "lucide-react";
import { EMOJI_GROUPS, firstGrapheme, type EmojiGroup } from "@/lib/emoji-catalog";
import { GROUP_PALETTE, GROUP_EXTRA_COLORS } from "@/lib/sectionUtils";

export function EmojiPicker({
  value,
  onChange,
  tint,
  placeholder = "📂",
  extraGroups = [],
  onReset,
  resetLabel = "Default",
}: {
  value: string;
  onChange: (emoji: string) => void;
  tint?: string;
  /** Shown in the preview tile when no emoji is chosen. */
  placeholder?: ReactNode;
  /** Groups shown before the standard catalog (e.g. money emojis for wallets). */
  extraGroups?: EmojiGroup[];
  /** Offers a way back to "no emoji" (e.g. the wallet type's icon). */
  onReset?: () => void;
  resetLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const anyRef = useRef<HTMLInputElement>(null);

  const groups = useMemo(() => {
    const all = [...extraGroups, ...EMOJI_GROUPS];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.map((g) => ({ ...g, items: g.items.filter(([e, k]) => k.includes(q) || e === q) })).filter((g) => g.items.length);
  }, [query]);

  return (
    <div className="rounded-2xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-3 p-3 border-b border-gray-100">
        <span
          className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
          style={{ backgroundColor: tint ?? "#F3F4F6" }}
        >
          {value || placeholder}
        </span>
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search icons — coffee, rent, gym…"
            className="w-full h-9 rounded-full bg-gray-100 pl-8 pr-3 text-[13px] outline-none focus:bg-white focus:ring-2 focus:ring-black/10"
          />
        </div>
        {onReset && value && (
          <button
            type="button"
            onClick={onReset}
            className="h-9 px-3 rounded-full text-[12px] font-medium text-gray-600 hover:bg-gray-100 hover:text-black whitespace-nowrap"
          >
            {resetLabel}
          </button>
        )}
      </div>

      <div
        className="max-h-56 overflow-y-auto px-3 pb-2"
        style={{
          // Soft fade at the bottom edge so a section never looks cut off.
          WebkitMaskImage: "linear-gradient(to bottom, #000 calc(100% - 18px), transparent)",
          maskImage: "linear-gradient(to bottom, #000 calc(100% - 18px), transparent)",
        }}
      >
        {groups.length === 0 ? (
          <p className="text-xs text-gray-400 py-6 text-center">No match — use “Any emoji” below.</p>
        ) : (
          groups.map((g) => (
            <div key={g.name} className="mb-2">
              <div className="sticky top-0 z-[1] bg-white text-[10px] font-semibold uppercase tracking-wide text-gray-400 px-1 pt-2 pb-1">{g.name}</div>
              <div className="grid grid-cols-10 gap-0.5">
                {g.items.map(([emoji, keywords]) => (
                  <button
                    key={emoji + keywords}
                    type="button"
                    title={keywords}
                    onClick={() => onChange(emoji)}
                    className={`h-8 rounded-lg text-[19px] flex items-center justify-center transition-colors ${
                      value === emoji ? "bg-black/10 ring-1 ring-black/20" : "hover:bg-gray-100"
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="px-3 py-2.5 border-t border-gray-100">
        <div className="relative">
          <input
            ref={anyRef}
            onChange={(e) => {
              const emoji = firstGrapheme(e.target.value);
              if (emoji) onChange(emoji);
              e.target.value = "";
            }}
            placeholder="Or paste any emoji…"
            aria-label="Any emoji"
            className="w-full h-9 rounded-full bg-gray-100 pl-3.5 pr-28 text-[13px] outline-none focus:bg-white focus:ring-2 focus:ring-black/10"
          />
          <button
            type="button"
            onClick={() => anyRef.current?.focus()}
            title="Click, then press Control-Command-Space to open all emoji"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 px-2 rounded-full bg-white border border-gray-200 text-[11px] text-gray-500 hover:text-black whitespace-nowrap"
          >
            All emoji ⌃⌘Space
          </button>
        </div>
      </div>
    </div>
  );
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const isCustom = !!value && ![...GROUP_PALETTE, ...GROUP_EXTRA_COLORS].some((c) => c.toLowerCase() === value.toLowerCase());
  const swatch = (c: string) => {
    const selected = value?.toLowerCase() === c.toLowerCase();
    return (
      <button
        key={c}
        type="button"
        role="radio"
        aria-checked={selected}
        title={c}
        onClick={() => onChange(c)}
        className="w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-110"
        style={{ backgroundColor: c, boxShadow: selected ? `0 0 0 2px #fff, 0 0 0 4px ${c}` : undefined }}
      >
        {selected && <Check size={14} className="text-white" strokeWidth={3} />}
      </button>
    );
  };
  return (
    <div role="radiogroup" aria-label="Color" className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">{GROUP_PALETTE.map(swatch)}</div>
      <div className="flex flex-wrap items-center gap-2">
        {GROUP_EXTRA_COLORS.map(swatch)}
        <label
          className="relative w-7 h-7 rounded-full cursor-pointer flex items-center justify-center transition-transform hover:scale-110"
          title="Custom color"
          style={{
            background: isCustom ? value : "conic-gradient(#ef4444, #f59e0b, #22c55e, #06b6d4, #6366f1, #d946ef, #ef4444)",
            boxShadow: isCustom ? `0 0 0 2px #fff, 0 0 0 4px ${value}` : undefined,
          }}
        >
          {isCustom && <Check size={14} className="text-white" strokeWidth={3} />}
          <input
            type="color"
            value={value || "#64748b"}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer"
            aria-label="Custom color"
          />
        </label>
      </div>
    </div>
  );
}
