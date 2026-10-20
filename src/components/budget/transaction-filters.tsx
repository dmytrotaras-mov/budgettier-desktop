// Filter bar for the transaction list: search, type and category as pill
// chips that are always visible. An active filter turns black and gets an ×.

import { forwardRef, useMemo, useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronDown, Search, X } from "lucide-react";
import type { Category } from "@shared/schema";
import { useSections, visibleSections, resolveCategorySection, isHiddenCategory, UNGROUPED_SECTION_NAME } from "@/lib/sectionUtils";

export type TypeFilter = "all" | "expense" | "income" | "transfer";

const TYPE_LABELS: Record<TypeFilter, string> = {
  all: "All types",
  expense: "Expenses",
  income: "Income",
  transfer: "Transfers",
};

type ChipProps = {
  active: boolean;
  label: ReactNode;
  onClear: () => void;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

// forwardRef: Radix PopoverTrigger (asChild) positions the popover from it.
const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip({ active, label, onClear, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      {...props}
      className={`inline-flex flex-none items-center gap-1.5 h-9 rounded-full pl-3.5 text-[13px] font-medium whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 ${
        active ? "bg-black text-white pr-2" : "bg-gray-100 text-gray-900 hover:bg-gray-200 pr-3"
      }`}
    >
      {label}
      {active ? (
        <span
          role="button"
          aria-label="Clear filter"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          className="inline-flex items-center justify-center w-5 h-5 rounded-full hover:bg-white/20"
        >
          <X size={13} />
        </span>
      ) : (
        <ChevronDown size={14} className="text-gray-500" />
      )}
    </button>
  );
});

export function TransactionFilters({
  search,
  onSearch,
  type,
  onType,
  categoryId,
  onCategory,
  categories,
}: {
  search: string;
  onSearch: (v: string) => void;
  type: TypeFilter;
  onType: (v: TypeFilter) => void;
  categoryId: string;
  onCategory: (v: string) => void;
  categories: Category[];
}) {
  const [typeOpen, setTypeOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const { data: allSections = [] } = useSections();
  const selected = categories.find((c) => c.id === categoryId);

  // Categories grouped by section, in Settings order; expense first.
  const groups = useMemo(() => {
    const out: { heading: string; items: Category[] }[] = [];
    for (const flow of ["expense", "income"] as const) {
      if (type !== "all" && type !== flow) continue;
      const order = visibleSections(allSections, flow).map((s) => s.name);
      const bySection: Record<string, Category[]> = {};
      for (const c of categories) {
        if (c.type !== flow || isHiddenCategory(c, allSections)) continue;
        (bySection[resolveCategorySection(c)] ??= []).push(c);
      }
      const rank = (s: string) => (s === UNGROUPED_SECTION_NAME ? 1000 : order.indexOf(s) === -1 ? 500 : order.indexOf(s));
      Object.keys(bySection)
        .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
        .forEach((section) =>
          out.push({
            heading: flow === "income" ? `${section} · income` : section,
            items: bySection[section].sort((a, b) => a.name.localeCompare(b.name)),
          }),
        );
    }
    return out;
  }, [categories, allSections, type]);

  return (
    <div className="flex items-center gap-2 min-w-0">
      {/* Search */}
      <div className="relative flex-1 min-w-[120px]">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search"
          className="w-full h-9 rounded-full bg-gray-100 pl-9 pr-8 text-[13px] text-gray-900 placeholder:text-gray-500 outline-none focus:bg-white focus:ring-2 focus:ring-black/10 transition-colors"
        />
        {search && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onSearch("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 inline-flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-200"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Type */}
      <Popover open={typeOpen} onOpenChange={setTypeOpen}>
        <PopoverTrigger asChild>
          <Chip active={type !== "all"} label={type === "all" ? "Type" : TYPE_LABELS[type]} onClear={() => onType("all")} />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-44 p-1 rounded-xl">
          {(Object.keys(TYPE_LABELS) as TypeFilter[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                onType(t);
                setTypeOpen(false);
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm hover:bg-gray-100"
            >
              {TYPE_LABELS[t]}
              {type === t && <Check size={15} />}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      {/* Category */}
      <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
        <PopoverTrigger asChild>
          <Chip
            active={!!selected}
            label={selected ? <span className="max-w-[140px] truncate">{selected.emoji} {selected.name}</span> : "Category"}
            onClear={() => onCategory("all")}
          />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-0 rounded-xl overflow-hidden">
          <Command>
            <CommandInput placeholder="Find a category" />
            <CommandList className="max-h-72">
              <CommandEmpty>No matching category</CommandEmpty>
              {groups.map((g) => (
                <CommandGroup key={g.heading} heading={g.heading}>
                  {g.items.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={`${c.name} ${g.heading}`}
                      onSelect={() => {
                        onCategory(c.id);
                        setCategoryOpen(false);
                      }}
                      className="flex items-center gap-2"
                    >
                      <span className="w-5 text-center">{c.emoji}</span>
                      <span className="flex-1 truncate">{c.name}</span>
                      {categoryId === c.id && <Check size={15} />}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
