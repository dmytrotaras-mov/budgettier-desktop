// Bridge between the legacy "fetch /api/*" calls in React Query hooks and
// the Tauri Rust commands. Same call signatures the old Express backend used,
// but routed to invoke() under the hood.

import { invoke } from "@tauri-apps/api/core";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

function parseUrl(url: string): { seg: string[]; query: Record<string, string> } {
  const [pathPart, queryPart] = url.split("?");
  const seg = pathPart.replace(/^\//, "").split("/").filter(Boolean);
  const query: Record<string, string> = {};
  if (queryPart) {
    for (const kv of queryPart.split("&")) {
      const [k, v = ""] = kv.split("=");
      query[decodeURIComponent(k)] = decodeURIComponent(v);
    }
  }
  return { seg, query };
}

function emptyForKey(url: string): unknown {
  if (url.endsWith("/auth/user")) return null;
  return [];
}

/**
 * Route a legacy REST call to a Tauri command.
 * Throws Rust-side errors so React Query's onError fires.
 */
export async function callBackend(
  method: Method,
  url: string,
  body?: unknown,
): Promise<unknown> {
  const { seg, query } = parseUrl(url);
  // seg[0] = "api"
  const resource = seg[1];
  const a = seg[2]; // id, type, or sub-route
  const b = seg[3]; // sub-id

  switch (resource) {
    // ---- wallets ----
    case "wallets": {
      if (method === "GET" && !a) return invoke("get_wallets");
      if (method === "POST" && !a) return invoke("create_wallet", { input: body });
      if (method === "PUT" && a) return invoke("update_wallet", { id: a, input: body });
      if (method === "DELETE" && a) return invoke("delete_wallet", { id: a });
      break;
    }

    // ---- categories ----
    case "categories": {
      // GET /api/categories            -> all
      // GET /api/categories/:type      -> filtered (type === "income"|"expense")
      // POST/PUT/DELETE                -> by id
      if (method === "GET" && !a) return invoke("get_categories", { typeFilter: null });
      if (method === "GET" && a && (a === "income" || a === "expense"))
        return invoke("get_categories", { typeFilter: a });
      if (method === "POST" && !a) return invoke("create_category", { input: body });
      if (method === "PUT" && a) return invoke("update_category", { id: a, input: body });
      if (method === "DELETE" && a) return invoke("delete_category", { id: a });
      break;
    }

    // ---- settings (singleton) ----
    case "settings": {
      if (method === "GET") return invoke("get_settings");
      if (method === "PUT" || method === "PATCH")
        return invoke("update_settings", { input: body });
      break;
    }

    // ---- transactions ----
    case "transactions": {
      // GET /api/transactions
      // GET /api/transactions/:startDate/:endDate
      // POST /api/transactions
      // PUT/DELETE /api/transactions/:id
      if (method === "GET" && !a) return invoke("get_transactions", {});
      if (method === "GET" && a && b)
        return invoke("get_transactions", { startDate: a, endDate: b });
      if (method === "POST" && !a) return invoke("create_transaction", { input: body });
      if (method === "PUT" && a) return invoke("update_transaction", { id: a, input: body });
      if (method === "DELETE" && a) return invoke("delete_transaction", { id: a });
      break;
    }

    // ---- budget plans ----
    case "budget-plans": {
      if (method === "GET" && !a)
        return invoke("get_budget_plans", {
          period: query.period ?? null,
          month: query.month ?? null,
          year: query.year ?? null,
        });
      if (method === "POST" && !a) return invoke("create_budget_plan", { input: body });
      if (method === "PUT" && a) return invoke("update_budget_plan", { id: a, input: body });
      if (method === "DELETE" && a) return invoke("delete_budget_plan", { id: a });
      break;
    }

    // ---- budget allocations ----
    case "budget-allocations": {
      // /api/budget-allocations/current-month
      if (method === "GET" && a === "current-month")
        return invoke("get_current_month_allocations");
      // /api/budget-allocations/:budgetPlanId  (GET) — list per plan
      if (method === "GET" && a) return invoke("get_budget_allocations", { budgetPlanId: a });
      if (method === "POST" && !a)
        return invoke("create_budget_allocation", { input: body });
      if (method === "PUT" && a)
        return invoke("update_budget_allocation", { id: a, input: body });
      if (method === "DELETE" && a) return invoke("delete_budget_allocation", { id: a });
      break;
    }
  }

  // Not yet wired (budget-goals, library, export, etc.) — safe defaults.
  if (method === "GET") return emptyForKey(url);
  return null;
}
