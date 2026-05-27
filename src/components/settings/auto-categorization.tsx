// Auto-categorization rules — list, add, delete.
//
// When you type "Rewe" in a new transaction's description, the rules table
// is checked: if a pattern matches (case-insensitive substring), the matching
// category is auto-filled. Saves clicks on every recurring merchant.

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2 } from "lucide-react";
import type { Category } from "@shared/schema";

interface Rule {
  id: string;
  pattern: string;
  categoryId: string;
  categoryName: string | null;
}

export default function AutoCategorizationSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newPattern, setNewPattern] = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");

  const { data: rules = [], isLoading } = useQuery<Rule[]>({
    queryKey: ["/api/category-rules"],
  });
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const createRule = useMutation({
    mutationFn: async (input: { pattern: string; categoryId: string }) => {
      const res = await apiRequest("POST", "/api/category-rules", input);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/category-rules"] });
      setNewPattern("");
      setNewCategoryId("");
      toast({ title: "Rule added" });
    },
    onError: (e: any) =>
      toast({
        title: "Failed to add rule",
        description: String(e?.message || e),
        variant: "destructive",
      }),
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/category-rules/${id}`);
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/category-rules"] });
      toast({ title: "Rule deleted" });
    },
  });

  const handleAdd = () => {
    if (!newPattern.trim() || !newCategoryId) {
      toast({
        title: "Pattern and category required",
        variant: "destructive",
      });
      return;
    }
    createRule.mutate({ pattern: newPattern.trim(), categoryId: newCategoryId });
  };

  const expenseCategories = categories.filter((c: any) => c.type === "expense");
  const incomeCategories = categories.filter((c: any) => c.type === "income");

  return (
    <div
      className="bg-white"
      style={{ width: "100%", borderRadius: 20, padding: 20 }}
    >
      <h2
        style={{
          fontFamily: "Inter",
          fontSize: 20,
          fontWeight: 500,
          color: "#000",
          marginBottom: 4,
        }}
      >
        Auto-categorization
      </h2>
      <p
        style={{
          fontFamily: "Inter",
          fontSize: 13,
          color: "#6B7280",
          marginBottom: 20,
        }}
      >
        When you type a transaction description, Budgettier suggests a category
        if any pattern below matches. Matching is case-insensitive and uses
        substring search (so "rewe" matches "Rewe Markt Gmbh-Zw Berlin").
      </p>

      {/* Add new rule */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 20,
          alignItems: "stretch",
        }}
      >
        <Input
          placeholder="Pattern (e.g. Rewe)"
          value={newPattern}
          onChange={(e) => setNewPattern(e.target.value)}
          style={{ flex: 1 }}
        />
        <Select value={newCategoryId} onValueChange={setNewCategoryId}>
          <SelectTrigger style={{ flex: 1 }}>
            <SelectValue placeholder="Pick a category" />
          </SelectTrigger>
          <SelectContent>
            {expenseCategories.length > 0 && (
              <>
                <div
                  style={{
                    padding: "4px 8px",
                    fontSize: 11,
                    color: "#9CA3AF",
                  }}
                >
                  Expense
                </div>
                {expenseCategories.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.emoji} {c.name}
                  </SelectItem>
                ))}
              </>
            )}
            {incomeCategories.length > 0 && (
              <>
                <div
                  style={{
                    padding: "4px 8px",
                    fontSize: 11,
                    color: "#9CA3AF",
                    marginTop: 4,
                  }}
                >
                  Income
                </div>
                {incomeCategories.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.emoji} {c.name}
                  </SelectItem>
                ))}
              </>
            )}
          </SelectContent>
        </Select>
        <Button onClick={handleAdd} disabled={createRule.isPending}>
          <Plus className="w-4 h-4 mr-1" /> Add
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <p style={{ color: "#9CA3AF" }}>Loading rules…</p>
      ) : rules.length === 0 ? (
        <p style={{ color: "#9CA3AF" }}>
          No rules yet. Add one above, or just categorize transactions
          manually — patterns build up over time.
        </p>
      ) : (
        <div style={{ borderTop: "1px solid #F3F4F6" }}>
          {rules.map((r) => (
            <div
              key={r.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 0",
                borderBottom: "1px solid #F3F4F6",
              }}
            >
              <div style={{ flex: 1, fontFamily: "Inter", fontSize: 14 }}>
                <span style={{ fontWeight: 500 }}>{r.pattern}</span>
              </div>
              <div
                style={{
                  flex: 1,
                  fontFamily: "Inter",
                  fontSize: 14,
                  color: "#6B7280",
                }}
              >
                → {r.categoryName ?? "(category deleted)"}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (confirm(`Delete rule "${r.pattern}"?`)) {
                    deleteRule.mutate(r.id);
                  }
                }}
              >
                <Trash2 className="w-4 h-4 text-gray-500" />
              </Button>
            </div>
          ))}
          <p
            style={{
              fontFamily: "Inter",
              fontSize: 11,
              color: "#9CA3AF",
              marginTop: 12,
            }}
          >
            {rules.length} rule{rules.length === 1 ? "" : "s"}
          </p>
        </div>
      )}
    </div>
  );
}
