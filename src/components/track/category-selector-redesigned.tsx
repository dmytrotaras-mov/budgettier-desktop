import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { Search, ChevronDown, Tag } from "lucide-react";
import type { Category } from "@shared/schema";
import { useSections, visibleSections, isHiddenCategory, UNGROUPED_SECTION_NAME } from "@/lib/sectionUtils";

// Category emojis mapping
const categoryEmojis = {
  // Housing & Utilities
  "Rent/Mortgage": "🏠",
  "Electricity": "⚡",
  "Water": "💧",
  "Gas/Heating": "🔥",
  "Internet/Phone": "📶",
  "Home Maintenance": "🔨",
  "Property Tax": "🏠",
  "Home Insurance": "🏠",
  
  // Food & Drinks
  "Groceries": "🛒",
  "Restaurants/Cafes": "☕",
  "Food Delivery": "🛍️",
  "Coffee/Snacks": "☕",
  
  // Transportation
  "Public Transport": "🚌",
  "Fuel/Gas": "⛽",
  "Taxi/Ride Sharing": "🚗",
  "Car Maintenance": "🔧",
  "Car Insurance": "🚗",
  "Parking": "🅿️",
  
  // Health & Wellness
  "Health Insurance": "🏥",
  "Doctor/Dentist": "👩‍⚕️",
  "Medicine": "💊",
  "Gym/Fitness": "💪",
  "Mental Health": "🧠",
  
  // Entertainment & Leisure
  "Subscriptions": "📺",
  "Hobbies": "🎨",
  "Travel": "✈️",
  "Events/Cinema": "🎬",
  "Books/Media": "📚",
  
  // Shopping
  "Clothes/Shoes": "👕",
  "Home Goods": "🏠",
  "Electronics": "💻",
  "Personal Care": "🧴",
  
  // Finance & Obligations
  "Loans/Credit": "💳",
  "Savings/Investments": "📈",
  "Insurance": "🛡️",
  "Bank Fees": "🏦",
  
  // Other
  "Education": "📖",
  "Gifts/Charity": "🎁",
  "Miscellaneous": "📋",
  
  // Income
  "Salary": "💰",
  "Freelance": "💼",
  "Business": "🏢",
  "Investments": "📊",
  "Rental Income": "🏠",
  "Other Income": "💵",
};

interface CategorySelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  type: "expense" | "income";
  disabled?: boolean;
}

export default function CategorySelector({ value, onValueChange, type, disabled }: CategorySelectorProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories", type],
  });
  const { data: allSections = [] } = useSections();
  // Recently used categories, derived from transaction history.
  const { data: recentCategoryIds = [] } = useQuery<string[]>({
    queryKey: [`/api/recent-categories/${type}`],
  });

  const selectedCategory = categories.find(c => c.id === value);

  const getCategoryEmoji = (category: Category) => {
    // Use the category's emoji from database first, fallback to hardcoded mapping for legacy categories
    return category.emoji || categoryEmojis[category.name as keyof typeof categoryEmojis] || "📋";
  };

  // Groups = visible sections of this type (database order), then
  // "Custom Categories" for categories without a section. Internal categories
  // in hidden sections (e.g. Opening Balance) are never offered.
  const dynamicGroups = useMemo(() => {
    const typeCategories = categories.filter(
      (cat) => cat.type === type && !isHiddenCategory(cat, allSections),
    );
    const sections = visibleSections(allSections, type);
    const groups = sections.map((section) => ({
      id: section.id,
      name: section.name,
      categories: typeCategories.filter((cat) => cat.section === section.name).map((cat) => cat.name),
    }));
    const sectionNames = new Set(sections.map((s) => s.name));
    const ungrouped = typeCategories.filter((cat) => !cat.section || !sectionNames.has(cat.section));
    if (ungrouped.length > 0) {
      groups.push({
        id: "custom_categories",
        name: UNGROUPED_SECTION_NAME,
        categories: ungrouped.map((cat) => cat.name),
      });
    }
    return groups;
  }, [categories, allSections, type]);

  // Recent picks, limited to categories that are still selectable here.
  const recentCategories = useMemo(() => {
    const selectable = new Set(
      categories
        .filter((cat) => cat.type === type && !isHiddenCategory(cat, allSections))
        .map((cat) => cat.id),
    );
    return recentCategoryIds.filter((id) => selectable.has(id));
  }, [recentCategoryIds, categories, allSections, type]);

  // Filter categories based on search term
  const filteredGroups = useMemo(() => {
    if (!searchTerm) return dynamicGroups;
    
    return dynamicGroups.map(group => ({
      ...group,
      categories: group.categories.filter(categoryName =>
        categoryName.toLowerCase().includes(searchTerm.toLowerCase())
      )
    })).filter(group => group.categories.length > 0);
  }, [dynamicGroups, searchTerm]);

  const handleCategorySelect = (categoryId: string) => {
    onValueChange(categoryId);

    handleClose();
  };

  const [isClosing, setIsClosing] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
      setSearchTerm("");
    }, 300);
  };

  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        className="w-full h-14 md:h-12 justify-start text-left font-normal bg-gray-50 hover:bg-gray-100 rounded-xl transition-all px-3 gap-3"
        onClick={() => setIsOpen(!isOpen)}
        data-testid="button-category-select"
      >
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            {selectedCategory ? (
              <>
                <span className="text-xl">{getCategoryEmoji(selectedCategory)}</span>
                <span className="text-base font-normal text-gray-700">{selectedCategory.name}</span>
              </>
            ) : (
              <>
                <Tag className="h-5 w-5 text-gray-700" />
                <span className="text-base font-normal text-gray-700">Select {type} category</span>
              </>
            )}
          </div>
          <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </Button>

      {isOpen && (
        <>
          {/* Mobile & Tablet: Bottom Sheet */}
          <div
            className="lg:hidden fixed z-[100] bg-transparent"
            style={{
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              marginTop: 'calc(-1 * env(safe-area-inset-top))',
              paddingTop: 'env(safe-area-inset-top)',
              width: '100vw',
              height: '100vh',
              backgroundColor: 'transparent'
            }}
            data-prevent-dialog-swipe
          >
            {/* Backdrop overlay */}
            <div
              className="absolute bg-black/50 backdrop-blur-sm md:backdrop-blur-none"
              style={{
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                marginTop: 'calc(-1 * env(safe-area-inset-top))',
                paddingTop: 'env(safe-area-inset-top)',
                width: '100vw',
                height: '100vh'
              }}
              onClick={handleClose}
            />

            {/* Bottom Sheet */}
            <div
              className={`fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl flex flex-col overflow-hidden ${
                isClosing ? 'animate-slide-down' : 'animate-slide-up'
              }`}
              style={{
                height: 'auto',
                maxHeight: '65vh',
                paddingBottom: 'max(env(safe-area-inset-bottom), 80px)'
              }}
            >
              {/* Draggable top zone: Handle bar + Search */}
              <div
                className="flex-shrink-0 bg-white rounded-t-3xl"
                onTouchStart={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
              >
                {/* Handle bar */}
                <div className="flex justify-center pt-3 pb-2">
                  <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
                </div>

                {/* Search */}
                <div className="px-4 pb-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <Input
                      placeholder="Search categories..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 h-12 text-base bg-gray-50 border-0 rounded-xl focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none placeholder:text-gray-700 text-gray-700"
                      data-testid="input-category-search"
                    />
                  </div>
                </div>
              </div>

              {/* Scrollable zone: Categories list */}
              <div
                className="px-4 pb-4 overflow-y-auto flex-1 bg-white"
                style={{ maxHeight: 'calc(65vh - 140px)' }}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
              >
                {/* Recent categories section - only show if not searching and has recent categories */}
                {!searchTerm && recentCategories.length > 0 && (
                  <div className="mb-5">
                    <h3 className="font-medium text-gray-900 mb-3 text-base tracking-wide">
                      Recent
                    </h3>
                    <div className="space-y-2">
                      {recentCategories.map((categoryId) => {
                        const category = categories.find(c => c.id === categoryId);
                        if (!category) return null;

                        const isSelected = category.id === value;

                        return (
                          <button
                            type="button"
                            key={category.id}
                            onClick={() => handleCategorySelect(category.id)}
                            className={`w-full p-4 rounded-xl bg-gray-50 text-left transition-all flex items-center gap-3 ${
                              isSelected
                                ? "ring-2 ring-gray-900"
                                : "hover:bg-gray-100"
                            }`}
                          >
                            <span className="text-xl">{getCategoryEmoji(category)}</span>
                            <span className="text-base font-medium text-gray-900">{category.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {filteredGroups.map((group) => (
                  <div key={group.id} className="mb-5 last:mb-0">
                    <h3 className="font-medium text-gray-900 mb-3 text-base tracking-wide">
                      {group.name}
                    </h3>
                    <div className="space-y-2">
                      {group.categories.map((categoryName) => {
                        const category = categories.find(c => c.name === categoryName);
                        if (!category) return null;

                        const isSelected = category.id === value;

                        return (
                          <button
                            type="button"
                            key={category.id}
                            onClick={() => handleCategorySelect(category.id)}
                            className={`w-full p-4 rounded-xl bg-gray-50 text-left transition-all flex items-center gap-3 ${
                              isSelected
                                ? "ring-2 ring-gray-900"
                                : "hover:bg-gray-100"
                            }`}
                            data-testid={`button-category-${category.id}`}
                          >
                            <span className="text-xl">{getCategoryEmoji(category)}</span>
                            <span className="text-base font-medium text-gray-900">{categoryName}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {searchTerm && filteredGroups.every(g => g.categories.length === 0) && (
                  <div className="text-center py-8 text-gray-500">
                    No categories found
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Desktop: Enhanced Dropdown */}
          <div className="hidden lg:block absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-lg border border-gray-200 z-50 max-h-[450px] overflow-hidden">
            {/* Search */}
            <div className="p-3 border-b border-gray-200">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search categories..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-9 text-sm bg-gray-50 border-0 focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none"
                />
              </div>
            </div>

            {/* Category List */}
            <div className="overflow-y-auto max-h-[390px] p-3">
              {/* Recent categories section */}
              {!searchTerm && recentCategories.length > 0 && (
                <div className="mb-4">
                  <h3 className="font-medium text-gray-900 mb-2 text-sm tracking-wide px-1">
                    Recent
                  </h3>
                  <div className="space-y-1">
                    {recentCategories.map((categoryId) => {
                      const category = categories.find(c => c.id === categoryId);
                      if (!category) return null;

                      const isSelected = category.id === value;

                      return (
                        <button
                          type="button"
                          key={category.id}
                          onClick={() => handleCategorySelect(category.id)}
                          className={`w-full px-3 py-2 rounded-lg bg-gray-50 text-left transition-all flex items-center gap-2 ${
                            isSelected
                              ? "ring-2 ring-gray-900"
                              : "hover:bg-gray-100"
                          }`}
                        >
                          <span className="text-base">{getCategoryEmoji(category)}</span>
                          <span className="text-sm font-medium text-gray-900">{category.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {filteredGroups.length === 0 ? (
                <div className="p-4 text-center text-sm text-gray-500">
                  No categories found
                </div>
              ) : (
                filteredGroups.map((group) => (
                  <div key={group.id} className="mb-4 last:mb-0">
                    <h3 className="font-medium text-gray-900 mb-2 text-sm tracking-wide px-1">
                      {group.name}
                    </h3>
                    <div className="space-y-1">
                      {group.categories.map((categoryName) => {
                        const category = categories.find(c => c.name === categoryName);
                        if (!category) return null;

                        const isSelected = category.id === value;

                        return (
                          <button
                            type="button"
                            key={category.id}
                            onClick={() => handleCategorySelect(category.id)}
                            className={`w-full px-3 py-2 rounded-lg bg-gray-50 text-left transition-all flex items-center gap-2 ${
                              isSelected
                                ? "ring-2 ring-gray-900"
                                : "hover:bg-gray-100"
                            }`}
                          >
                            <span className="text-base">{getCategoryEmoji(category)}</span>
                            <span className="text-sm font-medium text-gray-900">{categoryName}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Backdrop for desktop dropdown */}
          <div
            className="hidden lg:block fixed inset-0 z-40"
            onClick={handleClose}
          />
        </>
      )}
    </div>
  );
}