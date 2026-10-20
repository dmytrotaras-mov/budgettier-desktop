// Settings → Categories: groups as cards in their own color, categories as
// chips tinted with it, search across everything, and one dialog each for
// editing a group (name, icon, color) and a category (name, icon, group).
// Deleting asks where things go: a category's transactions move to another
// category, a group's categories move to another group.

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiCall } from "@/lib/queryClient";
import { PillTabs } from "@/components/overview/category-breakdown";
import {
  GROUP_FALLBACK_COLOR,
  GROUP_PALETTE,
  SECTIONS_QUERY_KEY,
  UNGROUPED_SECTION_NAME,
  isHiddenCategory,
  tint,
  useSections,
  visibleSections,
  type Section,
} from "@/lib/sectionUtils";
import { ColorPicker, EmojiPicker } from "./pickers";

type Flow = "expense" | "income";

interface Category {
  id: string;
  name: string;
  type: Flow;
  emoji: string | null;
  section: string | null;
}

const pill = "h-9 px-4 rounded-full text-[13px] font-medium transition-colors";
const grayPill = `${pill} bg-[#F3F4F6] text-black hover:bg-black hover:text-white`;

export default function CategoryManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [flow, setFlow] = useState<Flow>("expense");
  const [query, setQuery] = useState("");
  const [groupDialog, setGroupDialog] = useState<Partial<Section> | null>(null);
  const [categoryDialog, setCategoryDialog] = useState<Partial<Category> | null>(null);

  const { data: categories = [] } = useQuery<Category[]>({ queryKey: ["/api/categories"] });
  const { data: allSections = [] } = useSections();
  const { data: transactions = [] } = useQuery<any[]>({ queryKey: ["/api/transactions"], staleTime: 60000 });

  const sections = visibleSections(allSections, flow);
  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of transactions) if (t.categoryId && !t.isOpening) m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + 1);
    return m;
  }, [transactions]);

  const flowCategories = categories.filter((c) => c.type === flow && !isHiddenCategory(c, allSections));
  const q = query.trim().toLowerCase();
  const matches = (c: Category) => !q || c.name.toLowerCase().includes(q);

  const groups = [
    ...sections.map((s) => ({
      section: s as Section | null,
      name: s.name,
      emoji: s.emoji || "📂",
      color: s.color || GROUP_FALLBACK_COLOR,
      items: flowCategories.filter((c) => c.section === s.name),
    })),
  ];
  const known = new Set(sections.map((s) => s.name));
  const ungrouped = flowCategories.filter((c) => !c.section || !known.has(c.section));
  if (ungrouped.length) groups.push({ section: null, name: UNGROUPED_SECTION_NAME, emoji: "🗂️", color: GROUP_FALLBACK_COLOR, items: ungrouped });

  const visibleGroups = groups
    .map((g) => ({ ...g, shown: g.items.filter(matches), nameMatch: !!q && g.name.toLowerCase().includes(q) }))
    .filter((g) => !q || g.shown.length || g.nameMatch);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: SECTIONS_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
  };
  const fail = (title: string) => (err: any) => toast({ title, description: String(err?.message || err), variant: "destructive" });

  const nextColor = () => GROUP_PALETTE.find((c) => !sections.some((s) => s.color?.toLowerCase() === c)) ?? GROUP_FALLBACK_COLOR;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="bg-white rounded-[20px] px-5 py-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="mr-auto">
            <h2 className="text-[20px] font-medium leading-tight" style={{ fontFamily: "Inter" }}>Categories</h2>
            <div className="text-xs text-gray-500 mt-0.5">
              {sections.length} {sections.length === 1 ? "group" : "groups"} · {flowCategories.length} categories
            </div>
          </div>
          <PillTabs tabs={[["expense", "Expense"], ["income", "Income"]]} value={flow} onChange={setFlow} size="sm" />
        </div>
        <div className="flex items-center gap-2 mt-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search categories"
              className="w-full h-9 rounded-full bg-gray-100 pl-9 pr-3 text-[13px] outline-none focus:bg-white focus:ring-2 focus:ring-black/10"
            />
          </div>
          <button type="button" className={`${grayPill} inline-flex items-center gap-1.5`} onClick={() => setGroupDialog({ type: flow, color: nextColor(), emoji: "📂" })}>
            <Plus size={15} /> New group
          </button>
        </div>
      </div>

      {visibleGroups.length === 0 && (
        <div className="bg-white rounded-[20px] px-5 py-10 text-center text-sm text-gray-400">No categories match “{query}”.</div>
      )}

      {/* Groups */}
      {visibleGroups.map((g) => (
        <div key={g.name} className="group/card bg-white rounded-[20px] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{ backgroundColor: tint(g.color, 0.85) }}>
              {g.emoji}
            </span>
            <div className="min-w-0 mr-auto">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: g.color }} />
                <span className="text-[15px] font-medium text-gray-900 truncate">{g.name}</span>
              </div>
              <div className="text-xs text-gray-500">
                {g.items.length} {g.items.length === 1 ? "category" : "categories"}
              </div>
            </div>
            {g.section && (
              <button
                type="button"
                title="Edit group"
                aria-label={`Edit ${g.name}`}
                onClick={() => setGroupDialog(g.section!)}
                className="w-9 h-9 rounded-full bg-[#F3F4F6] text-black hover:bg-black hover:text-white flex items-center justify-center transition-colors"
              >
                <Pencil size={15} />
              </button>
            )}
            <button
              type="button"
              className={`${grayPill} inline-flex items-center gap-1.5`}
              onClick={() => setCategoryDialog({ type: flow, emoji: "📋", section: g.section ? g.name : null })}
            >
              <Plus size={15} /> Category
            </button>
          </div>

          {g.shown.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3.5">
              {g.shown.map((c) => {
                const uses = usage.get(c.id) ?? 0;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategoryDialog(c)}
                    className="inline-flex items-center gap-1.5 h-9 pl-2.5 pr-3 rounded-full text-[13px] font-medium text-gray-900 transition-all hover:brightness-95 hover:shadow-sm"
                    style={{ backgroundColor: tint(g.color, 0.9) }}
                    title={uses ? `${uses} transactions` : "Not used yet"}
                  >
                    <span className="text-base leading-none">{c.emoji || "📋"}</span>
                    {c.name.trim()}
                    {uses > 0 && <span className="text-[11px] text-gray-500 tabular-nums">{uses}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {groupDialog && (
        <GroupDialog
          initial={groupDialog}
          onClose={() => setGroupDialog(null)}
          onSave={async (draft) => {
            try {
              if (draft.id) await apiCall("PUT", `/api/sections/${draft.id}`, { name: draft.name, emoji: draft.emoji, color: draft.color });
              else await apiCall("POST", "/api/sections", { type: flow, name: draft.name, emoji: draft.emoji, color: draft.color });
              refresh();
              setGroupDialog(null);
              toast({ title: draft.id ? "Group saved" : "Group added" });
            } catch (err) {
              fail("Couldn't save group")(err);
            }
          }}
          groups={sections}
          categories={groupDialog.name ? flowCategories.filter((c) => c.section === groupDialog.name) : []}
          onDelete={async (id, moveTo) => {
            try {
              const res: { movedCategories: number; movedTo: string | null } = await apiCall("DELETE", `/api/sections/${id}`, { moveTo });
              refresh();
              setGroupDialog(null);
              toast({
                title: "Group deleted",
                description: res.movedCategories
                  ? `${res.movedCategories} ${res.movedCategories === 1 ? "category" : "categories"} moved to ${res.movedTo ?? "No group"}`
                  : undefined,
              });
            } catch (err) {
              fail("Couldn't delete group")(err);
            }
          }}
        />
      )}

      {categoryDialog && (
        <CategoryDialog
          initial={categoryDialog}
          groups={sections}
          categories={flowCategories}
          usage={usage}
          onClose={() => setCategoryDialog(null)}
          onSave={async (draft) => {
            const body = { name: draft.name, type: flow, emoji: draft.emoji, section: draft.section || null };
            try {
              if (draft.id) await apiCall("PUT", `/api/categories/${draft.id}`, body);
              else await apiCall("POST", "/api/categories", body);
              refresh();
              setCategoryDialog(null);
              toast({ title: draft.id ? "Category saved" : "Category added" });
            } catch (err) {
              fail("Couldn't save category")(err);
            }
          }}
          onDelete={async (id, replacement) => {
            try {
              const res: { movedTransactions: number; movedRules: number; movedLimits: number } = await apiCall("DELETE", `/api/categories/${id}`, {
                replacementId: replacement?.id ?? null,
              });
              refresh();
              queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
              queryClient.invalidateQueries({ queryKey: ["/api/category-rules"] });
              queryClient.invalidateQueries({ queryKey: ["budget-month"] });
              setCategoryDialog(null);
              const extras = [res.movedRules && `${res.movedRules} ${res.movedRules === 1 ? "rule" : "rules"}`, res.movedLimits && "budget limit"].filter(Boolean);
              toast({
                title: "Category deleted",
                description: replacement && res.movedTransactions
                  ? `${res.movedTransactions} transactions${extras.length ? ` and ${extras.join(", ")}` : ""} moved to ${replacement.name.trim()}`
                  : undefined,
              });
            } catch (err) {
              fail("Couldn't delete category")(err);
            }
          }}
        />
      )}
    </div>
  );
}

function DialogShell({
  title,
  children,
  onClose,
  onSave,
  saveLabel,
  canSave,
  deleteSlot,
  danger,
  onCancel,
  cancelLabel = "Cancel",
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onSave: () => void;
  saveLabel: string;
  canSave: boolean;
  deleteSlot?: React.ReactNode;
  /** Destructive step: the primary button turns red. */
  danger?: boolean;
  onCancel?: () => void;
  cancelLabel?: string;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:!max-w-[480px] rounded-[20px]" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave) onSave();
          }}
        >
          {children}
          <DialogFooter className="flex-row items-center gap-2 border-t border-gray-100 -mx-6 px-6 pt-4 mt-1">
            <div className="mr-auto">{deleteSlot}</div>
            <button type="button" onClick={onCancel ?? onClose} className={`${pill} text-gray-600 hover:bg-gray-100 hover:text-black`}>
              {cancelLabel}
            </button>
            <button
              type="submit"
              disabled={!canSave}
              className={`${pill} text-white disabled:bg-gray-100 disabled:text-gray-400 ${danger ? "bg-red-600 hover:bg-red-700" : "bg-black hover:bg-gray-800"}`}
            >
              {saveLabel}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-sm font-medium text-gray-900">{label}</div>
      {hint && <div className="text-xs text-gray-500">{hint}</div>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

const textInput = "w-full h-10 rounded-xl bg-gray-100 px-3 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-black/10";

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`${pill} inline-flex items-center gap-1.5 text-red-600 hover:bg-red-50`}>
      <Trash2 size={14} /> Delete
    </button>
  );
}

/** One line under the title of a delete step: what happens, in plain words. */
function DeleteSummary({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-600 -mt-1">{children}</p>;
}

/** "From → To" strip so it's obvious what moves where. */
function MoveStrip({ from, to }: { from: React.ReactNode; to: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-gray-50 px-3 py-2.5 text-[13px]">
      <span className="min-w-0 truncate text-gray-500 line-through decoration-gray-300">{from}</span>
      <ArrowRight size={14} className="flex-shrink-0 text-gray-400" />
      <span className="min-w-0 truncate font-medium text-gray-900">{to}</span>
    </div>
  );
}

function GroupDialog({
  initial,
  groups,
  categories,
  onClose,
  onSave,
  onDelete,
}: {
  initial: Partial<Section>;
  groups: Section[];
  categories: Category[];
  onClose: () => void;
  onSave: (draft: { id?: string; name: string; emoji: string; color: string }) => void;
  onDelete: (id: string, moveTo: string | null) => void;
}) {
  const [name, setName] = useState(initial.name ?? "");
  const [emoji, setEmoji] = useState(initial.emoji ?? "📂");
  const [color, setColor] = useState(initial.color ?? GROUP_FALLBACK_COLOR);
  const [deleting, setDeleting] = useState(false);
  const [moveTo, setMoveTo] = useState<string | null>(null);

  if (deleting) {
    const others = groups.filter((g) => g.id !== initial.id);
    const target = others.find((g) => g.id === moveTo);
    const n = categories.length;
    return (
      <DialogShell
        title={`Delete “${initial.name}”?`}
        onClose={onClose}
        onCancel={() => setDeleting(false)}
        cancelLabel="Back"
        danger
        onSave={() => onDelete(initial.id!, moveTo)}
        saveLabel={n ? `Delete and move ${n}` : "Delete group"}
        canSave
      >
        {n === 0 ? (
          <DeleteSummary>This group is empty. Nothing else changes.</DeleteSummary>
        ) : (
          <>
            <DeleteSummary>
              Its {n} {n === 1 ? "category stays" : "categories stay"} with all transactions — choose which group {n === 1 ? "it moves" : "they move"} to.
            </DeleteSummary>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <span key={c.id} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[12px] text-gray-700" style={{ backgroundColor: tint(initial.color ?? GROUP_FALLBACK_COLOR, 0.9) }}>
                  {c.emoji || "📋"} {c.name.trim()}
                </span>
              ))}
            </div>
            <Field label="Move to">
              <GroupChips
                options={[...others.map((g) => ({ key: g.id as string | null, label: g.name, color: g.color || GROUP_FALLBACK_COLOR })), { key: null, label: "No group", color: GROUP_FALLBACK_COLOR }]}
                value={moveTo}
                onChange={setMoveTo}
              />
            </Field>
            <MoveStrip from={initial.name} to={target?.name ?? "No group"} />
          </>
        )}
      </DialogShell>
    );
  }

  return (
    <DialogShell
      title={initial.id ? "Edit group" : "New group"}
      onClose={onClose}
      onSave={() => onSave({ id: initial.id, name: name.trim(), emoji, color })}
      saveLabel={initial.id ? "Save" : "Add group"}
      canSave={!!name.trim()}
      deleteSlot={initial.id ? <DeleteButton onClick={() => setDeleting(true)} /> : undefined}
    >
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Groceries & home" className={textInput} />
      </Field>
      <Field label="Color" hint="Used for this group and its categories everywhere">
        <ColorPicker value={color} onChange={setColor} />
      </Field>
      <Field label="Icon">
        <EmojiPicker value={emoji} onChange={setEmoji} tint={tint(color, 0.85)} />
      </Field>
    </DialogShell>
  );
}

/** Radio chips for picking a group (dot in the group's color). */
function GroupChips<K extends string | null>({
  options,
  value,
  onChange,
}: {
  options: { key: K; label: string; color: string }[];
  value: K;
  onChange: (key: K) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {options.map((g) => {
        const active = value === g.key;
        return (
          <button
            key={g.label}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(g.key)}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-medium border transition-colors ${
              active ? "border-black ring-1 ring-black text-black" : "border-gray-200 text-gray-600 hover:border-gray-400"
            }`}
            style={{ backgroundColor: active ? tint(g.color, 0.88) : "#fff" }}
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: g.color }} />
            {g.label}
          </button>
        );
      })}
    </div>
  );
}

/** Best guess for where a deleted category's transactions should go: the
 *  most-used category in the same group, else a catch-all, else the most used. */
function suggestReplacement(cat: Partial<Category>, categories: Category[], usage: Map<string, number>): Category | undefined {
  const others = categories.filter((c) => c.id !== cat.id);
  const byUse = (list: Category[]) => [...list].sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0))[0];
  const sameGroup = cat.section ? others.filter((c) => c.section === cat.section) : [];
  return (
    byUse(sameGroup) ??
    others.find((c) => /^(misc|other)/i.test(c.name.trim())) ??
    byUse(others)
  );
}

function CategoryDialog({
  initial,
  groups,
  categories,
  usage,
  onClose,
  onSave,
  onDelete,
}: {
  initial: Partial<Category>;
  groups: Section[];
  categories: Category[];
  usage: Map<string, number>;
  onClose: () => void;
  onSave: (draft: { id?: string; name: string; emoji: string; section: string | null }) => void;
  onDelete: (id: string, replacement: Category | null) => void;
}) {
  const [name, setName] = useState(initial.name?.trim() ?? "");
  const [emoji, setEmoji] = useState(initial.emoji ?? "📋");
  const [section, setSection] = useState<string | null>(initial.section ?? null);
  const [deleting, setDeleting] = useState(false);
  const [replacementId, setReplacementId] = useState<string | null>(null);
  const groupColor = groups.find((g) => g.name === section)?.color ?? GROUP_FALLBACK_COLOR;
  const uses = initial.id ? usage.get(initial.id) ?? 0 : 0;

  if (deleting) {
    const replacement = categories.find((c) => c.id === replacementId) ?? null;
    return (
      <DialogShell
        title={`Delete “${initial.name?.trim()}”?`}
        onClose={onClose}
        onCancel={() => setDeleting(false)}
        cancelLabel="Back"
        danger
        onSave={() => onDelete(initial.id!, uses ? replacement : null)}
        saveLabel={uses ? `Delete and move ${uses}` : "Delete category"}
        canSave={!uses || !!replacement}
      >
        {uses === 0 ? (
          <DeleteSummary>No transactions use it. Any rules and budget limits for it are removed too.</DeleteSummary>
        ) : (
          <>
            <DeleteSummary>
              {uses} {uses === 1 ? "transaction uses" : "transactions use"} it. Choose a category to move {uses === 1 ? "it" : "them"} to — its rules and budget limits move along.
            </DeleteSummary>
            <CategoryPicker
              groups={groups}
              categories={categories.filter((c) => c.id !== initial.id)}
              usage={usage}
              value={replacementId}
              onChange={setReplacementId}
            />
            <MoveStrip
              from={`${initial.emoji || "📋"} ${initial.name?.trim()}`}
              to={replacement ? `${replacement.emoji || "📋"} ${replacement.name.trim()}` : <span className="font-normal text-gray-400">Pick a category</span>}
            />
          </>
        )}
      </DialogShell>
    );
  }

  return (
    <DialogShell
      title={initial.id ? "Edit category" : "New category"}
      onClose={onClose}
      onSave={() => onSave({ id: initial.id, name: name.trim(), emoji, section })}
      saveLabel={initial.id ? "Save" : "Add category"}
      canSave={!!name.trim()}
      deleteSlot={
        initial.id ? (
          <DeleteButton
            onClick={() => {
              setReplacementId(suggestReplacement(initial, categories, usage)?.id ?? null);
              setDeleting(true);
            }}
          />
        ) : undefined
      }
    >
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Coffee" className={textInput} />
      </Field>
      <Field label="Group">
        <GroupChips
          options={[...groups.map((g) => ({ key: g.name as string | null, label: g.name, color: g.color || GROUP_FALLBACK_COLOR })), { key: null, label: "No group", color: GROUP_FALLBACK_COLOR }]}
          value={section}
          onChange={setSection}
        />
      </Field>
      <Field label="Icon">
        <EmojiPicker value={emoji} onChange={setEmoji} tint={tint(groupColor, 0.88)} />
      </Field>
    </DialogShell>
  );
}

/** Searchable list of categories, grouped and tinted like the main screen. */
function CategoryPicker({
  groups,
  categories,
  usage,
  value,
  onChange,
}: {
  groups: Section[];
  categories: Category[];
  usage: Map<string, number>;
  value: string | null;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const q = query.trim().toLowerCase();
  const known = new Set(groups.map((g) => g.name));

  // Start with the suggested category in view, just below its group heading.
  useLayoutEffect(() => {
    const list = listRef.current;
    const chip = list?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (list && chip) list.scrollTop = chip.offsetTop - 64; // the list is the offsetParent
  }, []);
  const blocks = [
    ...groups.map((g) => ({ name: g.name, color: g.color || GROUP_FALLBACK_COLOR, items: categories.filter((c) => c.section === g.name) })),
    { name: "No group", color: GROUP_FALLBACK_COLOR, items: categories.filter((c) => !c.section || !known.has(c.section)) },
  ]
    .map((b) => ({ ...b, items: b.items.filter((c) => !q || c.name.toLowerCase().includes(q) || b.name.toLowerCase().includes(q)) }))
    .filter((b) => b.items.length);

  return (
    <div className="rounded-2xl border border-gray-200 overflow-hidden">
      <div className="p-3 border-b border-gray-100">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search categories"
            className="w-full h-9 rounded-full bg-gray-100 pl-8 pr-3 text-[13px] outline-none focus:bg-white focus:ring-2 focus:ring-black/10"
          />
        </div>
      </div>
      <div
        ref={listRef}
        className="relative max-h-60 overflow-y-auto px-3 pb-3"
        role="radiogroup"
        aria-label="Move to category"
        style={{ WebkitMaskImage: "linear-gradient(to bottom, #000 calc(100% - 18px), transparent)", maskImage: "linear-gradient(to bottom, #000 calc(100% - 18px), transparent)" }}
      >
        {blocks.length === 0 && <p className="text-xs text-gray-400 py-6 text-center">No categories match “{query}”.</p>}
        {blocks.map((b) => (
          <div key={b.name}>
            <div className="sticky top-0 z-[1] bg-white flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 px-1 pt-3 pb-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: b.color }} />
              {b.name}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {b.items.map((c) => {
                const active = c.id === value;
                const n = usage.get(c.id) ?? 0;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onChange(c.id)}
                    className={`inline-flex items-center gap-1.5 h-8 pl-2 pr-2.5 rounded-full text-[12px] font-medium transition-all ${
                      active ? "ring-2 ring-black text-black" : "text-gray-800 hover:brightness-95"
                    }`}
                    style={{ backgroundColor: tint(b.color, active ? 0.8 : 0.9) }}
                  >
                    {active ? <Check size={13} strokeWidth={3} /> : <span className="text-[14px] leading-none">{c.emoji || "📋"}</span>}
                    {c.name.trim()}
                    {n > 0 && <span className="text-[10px] text-gray-500 tabular-nums">{n}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
