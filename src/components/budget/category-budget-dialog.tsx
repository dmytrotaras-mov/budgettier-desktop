// A budget category's card: how the month went (spent of limit, bar in the
// status colour), the transactions behind the number, and the limit to edit.
// Answers "what did I spend this on?" before "change the limit".

import { useState } from "react";
import { format } from "date-fns";
import { TrendingDown } from "lucide-react";
import { DialogShell, Field, pill, textInput } from "@/components/settings/dialog-shell";
import { EntityIcon } from "@/components/ui/entity-icon";
import { NEGATIVE } from "@/lib/colors";
import { displayMerchantName } from "@/lib/merchantName";
import { budgetStatusColor } from "./budget-status-list";

interface Props {
  name: string;
  emoji: string;
  color?: string;
  limit: number;
  /** This month's transactions in the category, newest first. */
  transactions: any[];
  money: (n: number) => string;
  onSave: (limit: number) => void;
  onRemove: () => void;
  onOpenTransaction: (tx: any) => void;
  onClose: () => void;
}

export function CategoryBudgetDialog({ name, emoji, color, limit, transactions, money, onSave, onRemove, onOpenTransaction, onClose }: Props) {
  const [value, setValue] = useState(String(limit));
  const [confirmRemove, setConfirmRemove] = useState(false);
  const counted = transactions.filter((t) => !t.excludeFromBudget);
  const spent = counted.reduce((s, t) => s + parseFloat(t.amount), 0);
  const parsed = parseFloat(value.replace(/\s/g, "").replace(",", "."));
  const valid = !Number.isNaN(parsed) && parsed > 0;
  const diff = limit - spent;
  // Nothing changed → one clear "Done"; a new limit → Cancel and Save.
  const changed = valid && Math.abs(parsed - limit) >= 0.005;
  const barColor = budgetStatusColor({ spent, budget: limit });

  return (
    <DialogShell
      title={name}
      onClose={onClose}
      onSave={() => (changed ? onSave(parsed) : onClose())}
      saveLabel={changed ? "Save" : "Done"}
      canSave={valid}
      hideCancel={!changed}
      deleteSlot={
        confirmRemove ? (
          <button type="button" onClick={onRemove} className={`${pill} bg-red-600 text-white hover:bg-red-700`}>
            Remove {name}
          </button>
        ) : (
          <button type="button" onClick={() => setConfirmRemove(true)} className={`${pill} text-red-600 hover:bg-red-50`}>
            Remove from budget
          </button>
        )
      }
    >
      {/* How the month went */}
      <div className="flex items-center gap-3 -mt-1">
        <EntityIcon emoji={emoji} color={color} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2 tabular-nums">
            <span className="text-sm text-gray-500">
              <span className="text-[17px] font-semibold text-gray-900">{money(spent)}</span> of {money(limit)}
            </span>
            <span className="text-sm font-semibold" style={{ color: diff < 0 ? NEGATIVE : "#111827" }}>
              {diff < 0 ? `${money(-diff)} over` : `${money(diff)} left`}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-gray-100">
            <div className="h-full rounded-full" style={{ width: `${Math.min(limit > 0 ? spent / limit : 0, 1) * 100}%`, backgroundColor: barColor }} />
          </div>
        </div>
      </div>

      <Field label="Monthly limit">
        <div className="relative max-w-[200px]">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">€</span>
          <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} className={`${textInput} pl-7 tabular-nums`} />
        </div>
      </Field>

      <Field label={`This month · ${transactions.length} ${transactions.length === 1 ? "transaction" : "transactions"}`}>
        {transactions.length === 0 ? (
          <p className="text-sm text-gray-400">Nothing spent here yet this month.</p>
        ) : (
          // Same rows as the Transactions list: icon tile, merchant, date, amount.
          <div className="max-h-64 overflow-y-auto -mx-2 space-y-1">
            {transactions.map((t) => (
              <div
                key={t.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpenTransaction(t)}
                onKeyDown={(e) => e.key === "Enter" && onOpenTransaction(t)}
                className="flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                title="Open transaction"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <EntityIcon emoji={emoji} color={color} size={36} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{displayMerchantName(t.description) || name}</p>
                    <p className="text-xs text-gray-600">
                      {format(new Date(t.date), "d MMM")}
                      {t.excludeFromBudget && <span className="ml-1.5 rounded bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-600">Excluded</span>}
                    </p>
                  </div>
                </div>
                <p className="flex flex-shrink-0 items-center text-sm font-semibold text-black tabular-nums">
                  -{money(parseFloat(t.amount))}
                  <TrendingDown className="ml-1 h-3 w-3" />
                </p>
              </div>
            ))}
          </div>
        )}
      </Field>
    </DialogShell>
  );
}
