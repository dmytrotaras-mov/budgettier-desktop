// Default section emojis - matching category-groups.tsx
export const defaultSectionEmojis: Record<string, string> = {
  // Expense sections
  "expense_housing_utilities": "🏠",
  "expense_food_drinks": "🍽️",
  "expense_transportation": "🚗",
  "expense_health_wellness": "🏥",
  "expense_entertainment": "🎬",
  "expense_shopping": "🛍️",
  "expense_finance": "💳",
  "expense_education_other": "📚",
  // Income sections
  "income_primary": "💰",
  "income_other": "💵",
};

// Default section names for mapping
export const defaultSectionNames: Record<string, string> = {
  "expense_housing_utilities": "Housing & Utilities",
  "expense_food_drinks": "Food & Drinks",
  "expense_transportation": "Transportation",
  "expense_health_wellness": "Health & Wellness",
  "expense_entertainment": "Entertainment",
  "expense_shopping": "Shopping",
  "expense_finance": "Finance",
  "expense_education_other": "Education & Other",
  "income_primary": "Primary Income",
  "income_other": "Other Income",
};

// Built-in category → section membership. Single source of truth shared by
// Settings (category-groups.tsx) and the Overview breakdown.
export const defaultSectionCategories: Record<string, string[]> = {
  "expense_housing_utilities": ["Rent/Mortgage", "Electricity", "Water", "Gas/Heating", "Internet/Phone"],
  "expense_food_drinks": ["Groceries", "Restaurants/Cafes", "Food Delivery"],
  "expense_transportation": ["Public Transport", "Fuel/Gas", "Taxi/Ride Sharing", "Car Maintenance"],
  "expense_health_wellness": ["Health Insurance", "Doctor/Dentist", "Medicine", "Gym/Fitness"],
  "expense_entertainment": ["Subscriptions", "Hobbies", "Travel", "Events/Cinema"],
  "expense_shopping": ["Clothes/Shoes", "Home Goods"],
  "expense_finance": ["Loans/Credit", "Savings/Investments", "Insurance"],
  "expense_education_other": ["Education", "Gifts/Charity", "Miscellaneous"],
  "income_primary": ["Salary", "Freelance", "Business"],
  "income_other": ["Investments", "Rental Income", "Other Income"],
};

// Label Settings uses for categories that belong to no section.
export const UNGROUPED_SECTION_NAME = "Custom Categories";

function readStorageJson(key: string): Record<string, any> {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// Resolve which section a category belongs to, in the same priority order
// Settings uses to display it:
//   1. section saved on the category in the database
//   2. manual assignment stored in localStorage (category name → section id)
//   3. built-in membership by category name
//   4. otherwise "Custom Categories"
// Default sections honor user renames (sectionOverrides).
export function resolveCategorySection(
  category: { name?: string | null; section?: string | null } | undefined,
  type: "income" | "expense",
): string {
  const overrides = readStorageJson(`sectionOverrides_${type}`);
  const defaultName = (id: string) => overrides[id] || defaultSectionNames[id];

  if (!category) return UNGROUPED_SECTION_NAME;

  if (category.section) {
    const id = getSectionIdByName(category.section, type);
    return id ? defaultName(id) : category.section;
  }

  const name = category.name || "";
  const assignedId = readStorageJson(`categoryAssignments_${type}`)[name];
  if (assignedId) {
    if (defaultSectionNames[assignedId]) return defaultName(assignedId);
    const custom = readStorageJson(`customSections_${type}`)[assignedId];
    if (custom?.name) return custom.name;
  }

  const memberId = Object.keys(defaultSectionCategories).find(
    (id) => id.startsWith(type) && defaultSectionCategories[id].includes(name),
  );
  if (memberId) return defaultName(memberId);

  return UNGROUPED_SECTION_NAME;
}

// Get section ID by name (for reverse lookup)
export function getSectionIdByName(sectionName: string, type: "income" | "expense"): string | null {
  const entry = Object.entries(defaultSectionNames).find(([_, name]) => name === sectionName);
  return entry ? entry[0] : null;
}

// Get section emoji from localStorage or defaults
export function getSectionEmojiFromStorage(
  sectionName: string,
  type: "income" | "expense" = "expense"
): string {
  // Try to find the section ID by name
  const sectionId = getSectionIdByName(sectionName, type);

  if (sectionId) {
    // Check for emoji override in localStorage
    const storedEmojiOverrides = localStorage.getItem(`sectionEmojiOverrides_${type}`);
    if (storedEmojiOverrides) {
      const emojiOverrides = JSON.parse(storedEmojiOverrides);
      if (emojiOverrides[sectionId]) {
        return emojiOverrides[sectionId];
      }
    }

    // Return default emoji for this section
    return defaultSectionEmojis[sectionId] || "📂";
  }

  // Check custom sections
  const storedCustomSections = localStorage.getItem(`customSections_${type}`);
  if (storedCustomSections) {
    const customSections = JSON.parse(storedCustomSections);
    const customSection = Object.values<any>(customSections).find((s: any) => s.name === sectionName);
    if (customSection) {
      return customSection.emoji || "📂";
    }
  }

  // Fallback
  return "📂";
}
