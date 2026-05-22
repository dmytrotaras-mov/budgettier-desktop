import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Local-first single-user app — no users/sessions/auth tables.
// Decimal values stored as TEXT to preserve precision (SQLite has no decimal type).
// Timestamps stored as INTEGER unix epoch (ms), surfaced as JS Date.

export const categories = sqliteTable(
  "categories",
  {
    id: text("id")
      .primaryKey()
      .default(sql`(lower(hex(randomblob(16))))`),
    name: text("name").notNull(),
    type: text("type").notNull(), // 'income' | 'expense'
    color: text("color").default("#6B7280"),
    emoji: text("emoji"),
    section: text("section"),
  },
  (table) => [index("idx_categories_type").on(table.type)],
);

export const wallets = sqliteTable("wallets", {
  id: text("id")
    .primaryKey()
    .default(sql`(lower(hex(randomblob(16))))`),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'cash' | 'bank' | 'credit'
  balance: text("balance").notNull().default("0"),
});

export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id")
      .primaryKey()
      .default(sql`(lower(hex(randomblob(16))))`),
    type: text("type").notNull(), // 'income' | 'expense' | 'transfer'
    amount: text("amount").notNull(),
    description: text("description"),
    date: integer("date", { mode: "timestamp_ms" }).notNull(),
    categoryId: text("category_id").references(() => categories.id),
    walletId: text("wallet_id").references(() => wallets.id),
    fromWalletId: text("from_wallet_id").references(() => wallets.id),
    toWalletId: text("to_wallet_id").references(() => wallets.id),
    excludeFromBudget: integer("exclude_from_budget", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (table) => [
    index("idx_transactions_date").on(table.date),
    index("idx_transactions_category_id").on(table.categoryId),
    index("idx_transactions_wallet_id").on(table.walletId),
    index("idx_transactions_type").on(table.type),
  ],
);

export const settings = sqliteTable("settings", {
  id: text("id")
    .primaryKey()
    .default(sql`(lower(hex(randomblob(16))))`),
  currency: text("currency").notNull().default("USD"),
  budgetPeriod: text("budget_period").notNull().default("monthly"),
  dateFormat: text("date_format").notNull().default("MM/DD/YYYY"),
  budgetLimitWarnings: integer("budget_limit_warnings", { mode: "boolean" })
    .notNull()
    .default(true),
  monthlyReports: integer("monthly_reports", { mode: "boolean" })
    .notNull()
    .default(true),
  weeklySummaries: integer("weekly_summaries", { mode: "boolean" })
    .notNull()
    .default(false),
  defaultWalletId: text("default_wallet_id").references(() => wallets.id),
});

export const budgetGoals = sqliteTable(
  "budget_goals",
  {
    id: text("id")
      .primaryKey()
      .default(sql`(lower(hex(randomblob(16))))`),
    categoryId: text("category_id").references(() => categories.id),
    monthlyLimit: text("monthly_limit").notNull(),
    name: text("name").notNull(),
  },
  (table) => [index("idx_budget_goals_category_id").on(table.categoryId)],
);

export const budgetPlans = sqliteTable(
  "budget_plans",
  {
    id: text("id")
      .primaryKey()
      .default(sql`(lower(hex(randomblob(16))))`),
    name: text("name").notNull(),
    totalBudget: text("total_budget").notNull(),
    savingsAmount: text("savings_amount").notNull(),
    savingsPercentage: text("savings_percentage").notNull(),
    expenseBudget: text("expense_budget").notNull(),
    period: text("period").notNull().default("monthly"),
    month: text("month"), // YYYY-MM
    year: text("year"), // YYYY
    isActive: integer("is_active", { mode: "boolean" }).default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(
      sql`(unixepoch() * 1000)`,
    ),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(
      sql`(unixepoch() * 1000)`,
    ),
  },
  (table) => [
    index("idx_budget_plans_month").on(table.month),
    index("idx_budget_plans_year").on(table.year),
    index("idx_budget_plans_active").on(table.isActive),
  ],
);

export const budgetCategoryAllocations = sqliteTable(
  "budget_category_allocations",
  {
    id: text("id")
      .primaryKey()
      .default(sql`(lower(hex(randomblob(16))))`),
    budgetPlanId: text("budget_plan_id").references(() => budgetPlans.id),
    categoryId: text("category_id").references(() => categories.id),
    allocatedAmount: text("allocated_amount").notNull(),
  },
  (table) => [
    index("idx_budget_allocations_plan_id").on(table.budgetPlanId),
    index("idx_budget_allocations_category_id").on(table.categoryId),
  ],
);

// Insert schemas
export const insertCategorySchema = createInsertSchema(categories).omit({ id: true });
export const insertWalletSchema = createInsertSchema(wallets).omit({ id: true });
export const insertTransactionSchema = z
  .object({
    type: z.enum(["income", "expense", "transfer"]),
    amount: z.string(),
    description: z.string().optional(),
    date: z
      .string()
      .or(z.date())
      .transform((val) => (typeof val === "string" ? new Date(val) : val)),
    categoryId: z.string().optional(),
    walletId: z.string().optional(),
    fromWalletId: z.string().optional(),
    toWalletId: z.string().optional(),
    excludeFromBudget: z.boolean().optional().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.type === "income" || data.type === "expense") {
      if (!data.categoryId)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${data.type} transactions require a categoryId`,
          path: ["categoryId"],
        });
      if (!data.walletId)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${data.type} transactions require a walletId`,
          path: ["walletId"],
        });
    }
    if (data.type === "transfer") {
      if (!data.fromWalletId)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Transfer transactions require a fromWalletId",
          path: ["fromWalletId"],
        });
      if (!data.toWalletId)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Transfer transactions require a toWalletId",
          path: ["toWalletId"],
        });
    }
  });
export const insertSettingsSchema = createInsertSchema(settings).omit({ id: true });
export const insertBudgetGoalSchema = createInsertSchema(budgetGoals).omit({ id: true });
export const insertBudgetPlanSchema = createInsertSchema(budgetPlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertBudgetCategoryAllocationSchema = createInsertSchema(
  budgetCategoryAllocations,
).omit({ id: true });

// Types
export type Category = typeof categories.$inferSelect;
export type Wallet = typeof wallets.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type BudgetGoal = typeof budgetGoals.$inferSelect;
export type BudgetPlan = typeof budgetPlans.$inferSelect;
export type BudgetCategoryAllocation = typeof budgetCategoryAllocations.$inferSelect;

// Local stub User type — kept loose so legacy components that read `user.firstName`
// etc. still compile. There's no real user record in this app.
export type User = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  emailVerified: boolean;
  verificationToken: string | null;
  verificationTokenExpiry: Date | null;
  passwordResetToken: string | null;
  passwordResetExpiry: Date | null;
  password: string;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type InsertWallet = z.infer<typeof insertWalletSchema>;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type InsertBudgetGoal = z.infer<typeof insertBudgetGoalSchema>;
export type InsertBudgetPlan = z.infer<typeof insertBudgetPlanSchema>;
export type InsertBudgetCategoryAllocation = z.infer<
  typeof insertBudgetCategoryAllocationSchema
>;
