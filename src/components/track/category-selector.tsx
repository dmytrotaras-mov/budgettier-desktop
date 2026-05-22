import { useState, useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { 
  Home, 
  Utensils, 
  Car, 
  ShoppingCart, 
  Gamepad2, 
  Heart, 
  GraduationCap, 
  DollarSign,
  Wallet,
  Building2,
  TrendingUp,
  Gift,
  MoreHorizontal,
  Search
} from "lucide-react";
import type { Category } from "@shared/schema";

const categoryIcons = {
  // Housing & Utilities
  "Rent/Mortgage": Home,
  "Electricity": Home,
  "Water": Home,
  "Gas/Heating": Home,
  "Internet/Phone": Home,
  "Home Maintenance": Home,
  "Property Tax": Home,
  "Home Insurance": Home,
  
  // Food & Drinks
  "Groceries": ShoppingCart,
  "Restaurants/Cafes": Utensils,
  "Food Delivery": Utensils,
  "Coffee/Snacks": Utensils,
  
  // Transportation
  "Public Transport": Car,
  "Fuel/Gas": Car,
  "Taxi/Ride Sharing": Car,
  "Car Maintenance": Car,
  "Car Insurance": Car,
  "Parking": Car,
  
  // Health & Wellness
  "Health Insurance": Heart,
  "Doctor/Dentist": Heart,
  "Medicine": Heart,
  "Gym/Fitness": Heart,
  "Mental Health": Heart,
  
  // Entertainment & Leisure
  "Subscriptions": Gamepad2,
  "Hobbies": Gamepad2,
  "Travel": Gamepad2,
  "Events/Cinema": Gamepad2,
  "Books/Media": Gamepad2,
  
  // Shopping
  "Clothes/Shoes": ShoppingCart,
  "Home Goods": ShoppingCart,
  "Electronics": ShoppingCart,
  "Personal Care": ShoppingCart,
  
  // Finance & Obligations
  "Loans/Credit": DollarSign,
  "Savings/Investments": TrendingUp,
  "Insurance": Building2,
  "Bank Fees": DollarSign,
  
  // Other
  "Education": GraduationCap,
  "Gifts/Charity": Gift,
  "Miscellaneous": MoreHorizontal,
  
  // Income
  "Salary": Wallet,
  "Freelance": Wallet,
  "Business": Building2,
  "Investments": TrendingUp,
  "Rental Income": Home,
  "Other Income": DollarSign,
};

const categoryGroups = {
  expense: [
    {
      name: "Housing & Utilities",
      categories: ["Rent/Mortgage", "Electricity", "Water", "Gas/Heating", "Internet/Phone", "Home Maintenance", "Property Tax", "Home Insurance"]
    },
    {
      name: "Food & Drinks",
      categories: ["Groceries", "Restaurants/Cafes", "Food Delivery", "Coffee/Snacks"]
    },
    {
      name: "Transportation",
      categories: ["Public Transport", "Fuel/Gas", "Taxi/Ride Sharing", "Car Maintenance", "Car Insurance", "Parking"]
    },
    {
      name: "Health & Wellness",
      categories: ["Health Insurance", "Doctor/Dentist", "Medicine", "Gym/Fitness", "Mental Health"]
    },
    {
      name: "Entertainment & Leisure",
      categories: ["Subscriptions", "Hobbies", "Travel", "Events/Cinema", "Books/Media"]
    },
    {
      name: "Shopping",
      categories: ["Clothes/Shoes", "Home Goods", "Electronics", "Personal Care"]
    },
    {
      name: "Finance & Obligations",
      categories: ["Loans/Credit", "Savings/Investments", "Insurance", "Bank Fees"]
    },
    {
      name: "Other",
      categories: ["Education", "Gifts/Charity", "Miscellaneous"]
    }
  ],
  income: [
    {
      name: "Primary Income",
      categories: ["Salary", "Freelance", "Business"]
    },
    {
      name: "Investment & Passive Income",
      categories: ["Investments", "Rental Income", "Other Income"]
    }
  ]
};

interface CategorySelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  type: "expense" | "income";
}

export default function CategorySelector({ value, onValueChange, type }: CategorySelectorProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories", type],
  });

  const groups = categoryGroups[type];

  const getCategoryIcon = (categoryName: string) => {
    const IconComponent = categoryIcons[categoryName as keyof typeof categoryIcons] || MoreHorizontal;
    return <IconComponent className="h-4 w-4 text-mono-gray-600" />;
  };

  // Filter groups and categories based on search term
  const filteredGroups = useMemo(() => {
    if (!searchTerm) return groups;
    
    return groups.map(group => ({
      ...group,
      categories: group.categories.filter(categoryName =>
        categoryName.toLowerCase().includes(searchTerm.toLowerCase())
      )
    })).filter(group => group.categories.length > 0);
  }, [groups, searchTerm]);

  const filteredCustomCategories = useMemo(() => {
    const customCategories = categories.filter(c => !groups.some(g => g.categories.includes(c.name)));
    if (!searchTerm) return customCategories;
    
    return customCategories.filter(category =>
      category.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [categories, groups, searchTerm]);

  const selectedCategory = categories.find(c => c.id === value);

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger data-testid="button-category-select">
        <SelectValue placeholder={`Select ${type} category`} />
      </SelectTrigger>
      <SelectContent className="max-h-[300px]">
        {/* Search Input */}
        <div className="sticky top-0 z-10 bg-mono-white border-b border-mono-gray-100 p-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-mono-gray-500" />
            <Input
              data-testid="input-category-search"
              placeholder="Search categories..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 h-8 text-sm"
              onMouseDown={(e) => {
                // Prevent Select from closing when clicking on search input
                e.stopPropagation();
              }}
              onKeyDown={(e) => {
                // Prevent Select key handlers from interfering
                e.stopPropagation();
              }}
            />
          </div>
        </div>

        {/* Show current selection if not visible in search results */}
        {searchTerm && selectedCategory && !categories.some(c => 
          c.id === selectedCategory.id && 
          (filteredGroups.some(g => g.categories.includes(c.name)) || 
           filteredCustomCategories.some(fc => fc.id === c.id))
        ) && (
          <div>
            <div className="px-2 py-1.5 text-xs font-semibold text-mono-gray-500 uppercase tracking-wider border-b">
              Current Selection
            </div>
            <SelectItem key={selectedCategory.id} value={selectedCategory.id}>
              <div className="flex items-center gap-2">
                {getCategoryIcon(selectedCategory.name)}
                <span>{selectedCategory.name}</span>
              </div>
            </SelectItem>
          </div>
        )}

        {filteredGroups.map((group) => (
          <div key={group.name}>
            <div className="px-2 py-1.5 text-xs font-semibold text-mono-gray-500 uppercase tracking-wider border-b">
              {group.name}
            </div>
            {group.categories.map((categoryName) => {
              const category = categories.find(c => c.name === categoryName);
              if (!category) return null;
              
              return (
                <SelectItem key={category.id} value={category.id}>
                  <div className="flex items-center gap-2">
                    {getCategoryIcon(categoryName)}
                    <span>{categoryName}</span>
                  </div>
                </SelectItem>
              );
            })}
          </div>
        ))}
        
        {/* Custom categories not in predefined groups */}
        {filteredCustomCategories.length > 0 && (
          <div>
            <div className="px-2 py-1.5 text-xs font-semibold text-mono-gray-500 uppercase tracking-wider border-b">
              Custom Categories
            </div>
            {filteredCustomCategories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                <div className="flex items-center gap-2">
                  <MoreHorizontal className="h-4 w-4 text-mono-gray-600" />
                  <span>{category.name}</span>
                </div>
              </SelectItem>
            ))}
          </div>
        )}

        {/* No results message */}
        {searchTerm && filteredGroups.every(g => g.categories.length === 0) && filteredCustomCategories.length === 0 && (
          <div className="px-2 py-4 text-center text-sm text-mono-gray-500">
            No categories found for "{searchTerm}"
          </div>
        )}
      </SelectContent>
    </Select>
  );
}