// The Settings dialog frame: title, fields, and a footer with an optional
// delete action on the left, Cancel and the one black primary on the right.
// A destructive step turns the primary red. Title and footer stay put; the
// fields scroll when the dialog is taller than the window.

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const pill = "h-9 px-4 rounded-full text-[13px] font-medium transition-colors";

export function DialogShell({
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
      <DialogContent className="sm:!max-w-[480px] rounded-[20px] md:!flex md:flex-col md:overflow-hidden" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4 flex-1 min-h-0"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave) onSave();
          }}
        >
          <div className="flex flex-col gap-4 min-h-0 overflow-y-auto -mx-2 px-2 pb-1">{children}</div>
          <DialogFooter className="flex-shrink-0 flex-row items-center gap-2 border-t border-gray-100 -mx-6 px-6 pt-4">
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

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-sm font-medium text-gray-900">{label}</div>
      {hint && <div className="text-xs text-gray-500">{hint}</div>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

export const textInput = "w-full h-10 rounded-xl bg-gray-100 px-3 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-black/10";
