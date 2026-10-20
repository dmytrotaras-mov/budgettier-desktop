// Shared building blocks for the Settings tabs: a white card with an optional
// header, and label/control rows separated by hairlines.

import type { ReactNode } from "react";

export function SettingsCard({
  title,
  description,
  action,
  danger,
  children,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className="bg-white"
      style={{ width: "100%", borderRadius: 20, border: danger ? "1px solid #FECACA" : undefined }}
    >
      {title && (
        <div
          className="flex items-start justify-between gap-4"
          style={{ padding: "15px 20px", borderBottom: "1px solid #F3F4F6" }}
        >
          <div>
            <h2 style={{ fontFamily: "Inter", fontSize: 20, fontWeight: 500, color: danger ? "#DC2626" : "#000" }}>
              {title}
            </h2>
            {description && (
              <p style={{ fontFamily: "Inter", fontSize: 13, color: "#6B7280", marginTop: 2 }}>{description}</p>
            )}
          </div>
          {action}
        </div>
      )}
      <div style={{ padding: "4px 20px" }}>{children}</div>
    </div>
  );
}

export function SettingsRow({
  label,
  hint,
  children,
  onClick,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center justify-between gap-4 border-b border-gray-100 last:border-b-0 ${
        onClick ? "cursor-pointer hover:bg-gray-50 -mx-5 px-5 transition-colors" : ""
      }`}
      style={{ minHeight: 56, paddingTop: 10, paddingBottom: 10 }}
    >
      <div className="min-w-0">
        <div style={{ fontFamily: "Inter", fontSize: 14, fontWeight: 500, color: "#000" }}>{label}</div>
        {hint && <div style={{ fontFamily: "Inter", fontSize: 12, color: "#6B7280", marginTop: 2 }}>{hint}</div>}
      </div>
      {children && <div className="flex items-center gap-2 flex-shrink-0">{children}</div>}
    </div>
  );
}
