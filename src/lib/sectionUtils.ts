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
