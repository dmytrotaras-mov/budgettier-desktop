import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  Plus, 
  Edit, 
  Trash2, 
  Home, 
  Utensils, 
  Car, 
  Heart, 
  Gamepad2, 
  ShoppingBag, 
  CreditCard, 
  GraduationCap,
  DollarSign,
  Briefcase,
  TrendingUp,
  Building,
  Gift,
  FolderOpen,
  Check,
  X
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

const categoryFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["income", "expense"]),
  emoji: z.string().max(10, "Emoji too long").optional(),
  section: z.string().optional(),
});

// Emoji mapping for categories (from track page design)
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

// Helper function to get emoji for category
function getCategoryEmoji(categoryName: string): string {
  return categoryEmojis[categoryName as keyof typeof categoryEmojis] || "📋";
}

// Category groups with section structure - matching track page
const categoryGroups = {
  expense: [
    {
      id: "expense_housing_utilities",
      name: "Housing & Utilities",
      icon: Home,
      emoji: "🏠",
      categories: ["Rent/Mortgage", "Electricity", "Water", "Gas/Heating", "Internet/Phone"]
    },
    {
      id: "expense_food_drinks",
      name: "Food & Drinks",
      icon: Utensils,
      emoji: "🍽️",
      categories: ["Groceries", "Restaurants/Cafes", "Food Delivery"]
    },
    {
      id: "expense_transportation",
      name: "Transportation",
      icon: Car,
      emoji: "🚗",
      categories: ["Public Transport", "Fuel/Gas", "Taxi/Ride Sharing", "Car Maintenance"]
    },
    {
      id: "expense_health_wellness",
      name: "Health & Wellness",
      icon: Heart,
      emoji: "🏥",
      categories: ["Health Insurance", "Doctor/Dentist", "Medicine", "Gym/Fitness"]
    },
    {
      id: "expense_entertainment",
      name: "Entertainment",
      icon: Gamepad2,
      emoji: "🎬",
      categories: ["Subscriptions", "Hobbies", "Travel", "Events/Cinema"]
    },
    {
      id: "expense_shopping",
      name: "Shopping",
      icon: ShoppingBag,
      emoji: "🛍️",
      categories: ["Clothes/Shoes", "Home Goods"]
    },
    {
      id: "expense_finance",
      name: "Finance",
      icon: CreditCard,
      emoji: "💳",
      categories: ["Loans/Credit", "Savings/Investments", "Insurance"]
    },
    {
      id: "expense_education_other",
      name: "Education & Other",
      icon: GraduationCap,
      emoji: "📚",
      categories: ["Education", "Gifts/Charity", "Miscellaneous"]
    }
  ],
  income: [
    {
      id: "income_primary",
      name: "Primary Income",
      icon: TrendingUp,
      emoji: "💰",
      categories: ["Salary", "Freelance", "Business"]
    },
    {
      id: "income_other",
      name: "Other Income",
      icon: DollarSign,
      emoji: "💵",
      categories: ["Investments", "Rental Income", "Other Income"]
    }
  ]
};

interface CategoryGroupsProps {
  type: "income" | "expense";
}

export default function CategoryGroups({ type }: CategoryGroupsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  // Category section assignments - ID-based assignments (categoryName -> sectionId)
  const [sectionAssignments, setSectionAssignments] = useState<Record<string, string>>({});
  
  // Custom sections storage
  const [customSections, setCustomSections] = useState<Record<string, { name: string; icon: any; emoji?: string }>>({});

  // Section overrides for default sections
  const [sectionOverrides, setSectionOverrides] = useState<Record<string, string>>({});

  // Section emoji overrides for default sections
  const [sectionEmojiOverrides, setSectionEmojiOverrides] = useState<Record<string, string>>({});

  // Queries - Must be declared before useEffects that use categories
  const { data: categories = [], isLoading, error } = useQuery<any[]>({
    queryKey: [`/api/categories/${type}`],
    enabled: !!type,
  });

  // Initialize state when component mounts or type changes
  useEffect(() => {
    const storedAssignments = localStorage.getItem(`categoryAssignments_${type}`);
    const storedCustomSections = localStorage.getItem(`customSections_${type}`);
    const storedOverrides = localStorage.getItem(`sectionOverrides_${type}`);
    const storedEmojiOverrides = localStorage.getItem(`sectionEmojiOverrides_${type}`);

    setSectionAssignments(storedAssignments ? JSON.parse(storedAssignments) : {});
    setCustomSections(storedCustomSections ? JSON.parse(storedCustomSections) : {});
    setSectionOverrides(storedOverrides ? JSON.parse(storedOverrides) : {});
    setSectionEmojiOverrides(storedEmojiOverrides ? JSON.parse(storedEmojiOverrides) : {});
  }, [type]);

  // Sync custom sections from database to localStorage
  useEffect(() => {
    if (!categories.length) return;

    const filteredCategories = categories.filter(cat => cat.type === type);

    // Collect unique sections from database that aren't default sections
    const dbSections = new Set<string>();
    filteredCategories.forEach(cat => {
      if (cat.section && !categoryGroups[type].some(g => g.name === cat.section)) {
        dbSections.add(cat.section);
      }
    });

    // Check if we need to add any database sections to localStorage
    const currentCustomSections = JSON.parse(localStorage.getItem(`customSections_${type}`) || '{}');
    const updatedCustomSections = { ...currentCustomSections };
    let needsUpdate = false;

    dbSections.forEach(sectionName => {
      // Check if this section already exists in localStorage
      const existsInLocalStorage = Object.values(currentCustomSections).some((s: any) => s.name === sectionName);

      if (!existsInLocalStorage) {
        // Add this section to localStorage
        const sectionId = `custom_${sectionName.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}`;
        updatedCustomSections[sectionId] = {
          name: sectionName,
          icon: "FolderOpen"
        };
        needsUpdate = true;
      }
    });

    if (needsUpdate) {
      setCustomSections(updatedCustomSections);
      localStorage.setItem(`customSections_${type}`, JSON.stringify(updatedCustomSections));
    }
  }, [categories, type]);
  
  // Section editing state
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionName, setEditingSectionName] = useState("");
  const [editingSectionEmoji, setEditingSectionEmoji] = useState("");
  const [isAddingSectionOpen, setIsAddingSectionOpen] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [isCreatingNewSection, setIsCreatingNewSection] = useState(false);
  const [newSectionNameInModal, setNewSectionNameInModal] = useState("");
  
  // Get available sections for the current type (includes both default and custom)
  const availableSections = [
    ...categoryGroups[type].map(group => ({
      id: group.id,
      label: sectionOverrides[group.id] || group.name
    })),
    ...Object.entries(customSections).map(([id, section]) => ({
      id,
      label: section.name
    }))
  ];

  // Form
  const form = useForm<z.infer<typeof categoryFormSchema>>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      name: "",
      type: type,
    },
  });

  // Mutations
  const createCategoryMutation = useMutation({
    mutationFn: (category: any) => apiRequest("POST", "/api/categories", category),
    onSuccess: () => {
      // Invalidate all category queries to refresh the UI immediately
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      queryClient.invalidateQueries({ queryKey: [`/api/categories/${type}`] });
      toast({ title: "Category created successfully" });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({ 
        title: "Error creating category", 
        description: error?.message || "Failed to create category",
        variant: "destructive" 
      });
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: any }) =>
      apiRequest("PUT", `/api/categories/${id}`, updates),
    onSuccess: () => {
      // Invalidate all category queries to refresh the UI immediately
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      queryClient.invalidateQueries({ queryKey: [`/api/categories/${type}`] });
      toast({ title: "Category updated successfully" });
      setIsDialogOpen(false);
      form.reset();
      setSelectedCategory(null);
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/categories/${id}`),
    onSuccess: (_, deletedId) => {
      // Clean up section assignment for deleted category
      const deletedCategory = categories.find(cat => cat.id === deletedId);
      if (deletedCategory && sectionAssignments[deletedCategory.name]) {
        const newAssignments = { ...sectionAssignments };
        delete newAssignments[deletedCategory.name];
        setSectionAssignments(newAssignments);
        localStorage.setItem(`categoryAssignments_${type}`, JSON.stringify(newAssignments));
      }

      // Invalidate all category queries to refresh the UI immediately
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      queryClient.invalidateQueries({ queryKey: [`/api/categories/${type}`] });
      toast({ title: "Category deleted successfully" });
    },
  });

  const handleEditCategory = (category: any) => {
    setSelectedCategory(category);

    // Get the current section ID for this category
    let currentSectionId = undefined;

    // Priority 1: Check database section field
    if (category.section) {
      // Find section ID by name (could be custom or default)
      const customSectionEntry = Object.entries(customSections).find(([_, sec]: [string, any]) => sec.name === category.section);
      if (customSectionEntry) {
        currentSectionId = customSectionEntry[0];
      } else {
        const defaultSection = categoryGroups[type].find(g => g.name === category.section);
        if (defaultSection) {
          currentSectionId = defaultSection.id;
        }
      }
    }

    // Priority 2: Check localStorage assignment
    if (!currentSectionId && sectionAssignments[category.name]) {
      currentSectionId = sectionAssignments[category.name];
    }

    form.reset({
      name: category.name,
      type: category.type,
      emoji: category.emoji || getCategoryEmoji(category.name),
      section: currentSectionId,
    });

    // Track the original section of this category
    const originalSectionId = getOriginalSectionId(category.name);
    if (originalSectionId && !sectionAssignments[category.name]) {
      const newAssignments = { ...sectionAssignments, [category.name]: originalSectionId };
      setSectionAssignments(newAssignments);
      localStorage.setItem(`categoryAssignments_${type}`, JSON.stringify(newAssignments));
    }

    setIsDialogOpen(true);
  };
  
  // Helper function to get the original section ID of a category
  const getOriginalSectionId = (categoryName: string): string | null => {
    for (const group of categoryGroups[type]) {
      if (group.categories.includes(categoryName)) {
        return group.id;
      }
    }
    return null;
  };
  
  // Helper function to get section display name by ID
  const getSectionDisplayName = (sectionId: string): string => {
    // Check if it's a custom section
    if (customSections[sectionId]) {
      return customSections[sectionId].name;
    }

    // Check if it's a default section
    const defaultSection = categoryGroups[type].find(group => group.id === sectionId);
    if (defaultSection) {
      return sectionOverrides[sectionId] || defaultSection.name;
    }

    return "Unknown Section";
  };

  // Helper function to get section emoji by ID
  const getSectionEmoji = (sectionId: string): string => {
    // Check if it's a custom section
    if (customSections[sectionId]) {
      return customSections[sectionId].emoji || "📂";
    }

    // Check if it's a default section with emoji override
    if (sectionEmojiOverrides[sectionId]) {
      return sectionEmojiOverrides[sectionId];
    }

    // Check if it's a default section with default emoji
    const defaultSection = categoryGroups[type].find(group => group.id === sectionId);
    if (defaultSection) {
      return defaultSection.emoji || "📂";
    }

    return "📂";
  };

  const handleAddCategory = () => {
    setSelectedCategory(null);
    form.reset({ name: "", type: type, emoji: "📋" });
    setIsDialogOpen(true);
  };
  
  // Section editing functions
  const handleEditSection = (sectionId: string, sectionName: string, sectionEmoji: string) => {
    setEditingSectionId(sectionId);
    setEditingSectionName(sectionName);
    setEditingSectionEmoji(sectionEmoji);
  };

  const handleSaveSectionEdit = () => {
    if (!editingSectionId || !editingSectionName.trim()) return;

    // Check if this is a custom section
    const isCustomSection = customSections[editingSectionId];

    if (isCustomSection) {
      // Update custom section (both name and emoji)
      const updatedCustomSections = {
        ...customSections,
        [editingSectionId]: {
          ...customSections[editingSectionId],
          name: editingSectionName.trim(),
          emoji: editingSectionEmoji || "📂"
        }
      };
      setCustomSections(updatedCustomSections);
      localStorage.setItem(`customSections_${type}`, JSON.stringify(updatedCustomSections));
    } else {
      // For default sections, store both name and emoji overrides
      const updatedOverrides = {
        ...sectionOverrides,
        [editingSectionId]: editingSectionName.trim()
      };
      setSectionOverrides(updatedOverrides);
      localStorage.setItem(`sectionOverrides_${type}`, JSON.stringify(updatedOverrides));

      // Save emoji override separately
      const updatedEmojiOverrides = {
        ...sectionEmojiOverrides,
        [editingSectionId]: editingSectionEmoji || "📂"
      };
      setSectionEmojiOverrides(updatedEmojiOverrides);
      localStorage.setItem(`sectionEmojiOverrides_${type}`, JSON.stringify(updatedEmojiOverrides));
    }

    setEditingSectionId(null);
    setEditingSectionName("");
    setEditingSectionEmoji("");
    toast({ title: "Section updated successfully" });
  };
  
  const handleCancelSectionEdit = () => {
    setEditingSectionId(null);
    setEditingSectionName("");
    setEditingSectionEmoji("");
  };

  const handleDeleteSection = async (sectionId: string) => {
    // Check if this is a custom section
    const isCustomSection = customSections[sectionId];

    if (isCustomSection) {
      const sectionName = customSections[sectionId].name;

      // Find all categories in this section and update them to have no section
      const categoriesToUpdate = categories.filter(cat =>
        cat.type === type && cat.section === sectionName
      );

      // Update each category in the database to remove the section assignment
      try {
        await Promise.all(
          categoriesToUpdate.map(cat =>
            apiRequest("PUT", `/api/categories/${cat.id}`, { ...cat, section: null })
          )
        );

        // Remove custom section from localStorage
        const updatedCustomSections = { ...customSections };
        delete updatedCustomSections[sectionId];
        setCustomSections(updatedCustomSections);
        localStorage.setItem(`customSections_${type}`, JSON.stringify(updatedCustomSections));

        // Clean up any localStorage assignments (legacy system)
        const newAssignments = { ...sectionAssignments };
        Object.keys(newAssignments).forEach(categoryName => {
          if (newAssignments[categoryName] === sectionId) {
            delete newAssignments[categoryName];
          }
        });
        setSectionAssignments(newAssignments);
        localStorage.setItem(`categoryAssignments_${type}`, JSON.stringify(newAssignments));

        // Refresh categories to show the updated data
        queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
        queryClient.invalidateQueries({ queryKey: [`/api/categories/${type}`] });

        toast({
          title: "Section deleted successfully",
          description: categoriesToUpdate.length > 0
            ? `${categoriesToUpdate.length} ${categoriesToUpdate.length === 1 ? 'category' : 'categories'} moved to Custom Categories`
            : undefined
        });
      } catch (error) {
        toast({
          title: "Error deleting section",
          description: "Failed to update categories",
          variant: "destructive"
        });
      }
    } else {
      // For default sections, remove the override (if any)
      const updatedOverrides = { ...sectionOverrides };
      delete updatedOverrides[sectionId];
      setSectionOverrides(updatedOverrides);
      localStorage.setItem(`sectionOverrides_${type}`, JSON.stringify(updatedOverrides));
      
      toast({ title: "Section name reset to default" });
    }
    
    // Exit edit mode
    setEditingSectionId(null);
    setEditingSectionName("");
  };
  
  const handleAddNewSection = () => {
    if (!newSectionName.trim()) return;
    
    const sectionId = `custom_${Date.now()}`;
    const newSection = {
      name: newSectionName.trim(),
      icon: "FolderOpen" // Default icon for custom sections
    };
    
    const updatedCustomSections = {
      ...customSections,
      [sectionId]: newSection
    };
    
    setCustomSections(updatedCustomSections);
    localStorage.setItem(`customSections_${type}`, JSON.stringify(updatedCustomSections));
    
    setNewSectionName("");
    setIsAddingSectionOpen(false);
    toast({ title: "New section added successfully" });
  };

  const onSubmit = (data: z.infer<typeof categoryFormSchema>) => {
    // Prepare data for backend - convert section ID to section name for database
    // IMPORTANT: Always save the section NAME to the database, not the ID
    const backendData = {
      ...data,
      section: data.section ? getSectionDisplayName(data.section) : undefined
    };

    if (selectedCategory) {
      updateCategoryMutation.mutate({ id: selectedCategory.id, updates: backendData });
    } else {
      createCategoryMutation.mutate(backendData);
    }
  };

  const handleDeleteCategory = (id: string) => {
    if (window.confirm("Are you sure you want to delete this category? This action cannot be undone.")) {
      deleteCategoryMutation.mutate(id);
    }
  };

  // Filter categories by type first
  const filteredCategories = categories.filter(cat => cat.type === type);

  // Group categories by their groups - use database section field as primary source
  const defaultGroupedCategories = categoryGroups[type].map(group => {
    const groupCategories = filteredCategories.filter(cat => {
      // If category has a database section assigned, ONLY match that section
      if (cat.section) {
        return cat.section === group.name;
      }

      // If category has localStorage assignment, ONLY match that section
      if (sectionAssignments[cat.name]) {
        return sectionAssignments[cat.name] === group.id;
      }

      // Only include default categories if they don't have any section assigned
      const isDefaultCategory = group.categories.some(defaultCat => cat.name === defaultCat);
      return isDefaultCategory;
    });
    // Use override name if available, otherwise use default name
    const displayName = sectionOverrides[group.id] || group.name;
    return {
      groupName: displayName,
      group,
      categories: groupCategories,
      isCustom: false,
      sectionId: group.id
    };
  });

  // Add custom sections from localStorage (now includes sections synced from database)
  const customGroupedCategories = Object.entries(customSections).map(([sectionId, section]) => {
    const groupCategories = filteredCategories.filter(cat => {
      // If category has a database section assigned, ONLY match that section by name
      if (cat.section) {
        return cat.section === section.name;
      }

      // If category has localStorage assignment, ONLY match that section by ID
      if (sectionAssignments[cat.name]) {
        return sectionAssignments[cat.name] === sectionId;
      }

      // Don't include categories without assignments in custom sections
      return false;
    });
    return {
      groupName: section.name,
      group: { icon: FolderOpen, categories: [] },
      categories: groupCategories,
      isCustom: true,
      sectionId
    };
  });

  const groupedCategories = [...defaultGroupedCategories, ...customGroupedCategories];

  // Categories not in any group (custom categories) - exclude those with section assignments or db section
  const ungroupedCategories = filteredCategories.filter(cat => {
    const isDefaultCategory = categoryGroups[type].some(group =>
      group.categories.includes(cat.name)
    );
    // PRIORITY 1: Database section field
    const hasDbSection = cat.section;
    // PRIORITY 2: localStorage assignment
    const hasAssignment = sectionAssignments[cat.name];
    return !isDefaultCategory && !hasDbSection && !hasAssignment;
  });

  // Add loading and error states
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-gray-500">Loading categories...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-red-500">Error loading categories: {error.message}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hidden Add Category Dialog - Only the dialog logic, no visible button */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        setIsDialogOpen(open);
        if (!open) {
          setIsCreatingNewSection(false);
          setNewSectionNameInModal("");
        }
      }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {selectedCategory ? "Edit Category" : "Add New Category"}
              </DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter category name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="emoji"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category Icon</FormLabel>
                      <FormControl>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <div className="text-2xl p-2 border rounded-lg bg-gray-50 min-w-[48px] text-center">
                              {field.value || "📋"}
                            </div>
                            <span className="text-sm text-gray-600">Current icon</span>
                          </div>
                          <div className="grid grid-cols-8 gap-1 p-3 border rounded-lg bg-gray-50 max-h-32 overflow-y-auto">
                            {/* Common category emojis */}
                            {[
                              "🏠", "⚡", "💧", "🔥", "📶", "🛒", "☕", "🛍️", "🚌", "⛽", "🚗", "🔧",
                              "🏥", "👩‍⚕️", "💊", "💪", "📺", "🎨", "✈️", "🎬", "👕", "💻", "🧴", "💳",
                              "📈", "🛡️", "📖", "🎁", "📋", "💰", "💼", "🏢", "📊", "💵", "🍕", "🍔",
                              "🍜", "🚊", "🚲", "🏃", "🎵", "📚", "🛏️", "🧽", "🔨", "🎯", "🎪", "🎭"
                            ].map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                className={`text-xl p-1 hover:bg-white hover:shadow-sm rounded transition-all ${
                                  field.value === emoji ? 'bg-blue-100 ring-2 ring-blue-500' : ''
                                }`}
                                onClick={() => field.onChange(emoji)}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="income">Income</SelectItem>
                          <SelectItem value="expense">Expense</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="section"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Section (Optional)</FormLabel>
                      {!isCreatingNewSection ? (
                        <>
                          <Select
                            onValueChange={(value) => {
                              if (value === "__create_new__") {
                                setIsCreatingNewSection(true);
                                field.onChange(undefined);
                              } else {
                                field.onChange(value);
                              }
                            }}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Choose a section or leave empty" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {availableSections.map((section) => (
                                <SelectItem key={section.id} value={section.id}>
                                  {section.label}
                                </SelectItem>
                              ))}
                              <SelectItem value="__create_new__" className="text-blue-600 font-medium">
                                + Create new section
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-sm text-gray-500 mt-1">
                            Leave empty to place in Custom Categories
                          </p>
                        </>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <Input
                              placeholder="Enter new section name"
                              value={newSectionNameInModal}
                              onChange={(e) => setNewSectionNameInModal(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  if (newSectionNameInModal.trim()) {
                                    const sectionId = `custom_${newSectionNameInModal.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}`;
                                    const updatedSections = {
                                      ...customSections,
                                      [sectionId]: { name: newSectionNameInModal.trim(), icon: "FolderOpen" }
                                    };
                                    setCustomSections(updatedSections);
                                    localStorage.setItem(`customSections_${type}`, JSON.stringify(updatedSections));
                                    field.onChange(sectionId);
                                    setNewSectionNameInModal("");
                                    setIsCreatingNewSection(false);
                                  }
                                }
                              }}
                            />
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => {
                                if (newSectionNameInModal.trim()) {
                                  const sectionId = `custom_${newSectionNameInModal.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}`;
                                  const updatedSections = {
                                    ...customSections,
                                    [sectionId]: { name: newSectionNameInModal.trim(), icon: "FolderOpen" }
                                  };
                                  setCustomSections(updatedSections);
                                  localStorage.setItem(`customSections_${type}`, JSON.stringify(updatedSections));
                                  field.onChange(sectionId);
                                  setNewSectionNameInModal("");
                                  setIsCreatingNewSection(false);
                                }
                              }}
                            >
                              Add
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setIsCreatingNewSection(false);
                                setNewSectionNameInModal("");
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-between">
                  <div>
                    {selectedCategory && (
                      <Button 
                        type="button" 
                        variant="outline"
                        onClick={() => {
                          handleDeleteCategory(selectedCategory.id);
                          setIsDialogOpen(false);
                        }}
                        className="hover:bg-red-100 hover:text-red-600 hover:border-red-300"
                        disabled={deleteCategoryMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </Button>
                    )}
                  </div>
                  <div className="flex space-x-2">
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={createCategoryMutation.isPending || updateCategoryMutation.isPending}
                      className="bg-mono-black hover:bg-mono-gray-800"
                    >
                      {selectedCategory ? "Update" : "Create"}
                    </Button>
                  </div>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

      {/* Grouped Categories */}
      {groupedCategories.map(({ groupName, group, categories: groupCategories, isCustom, sectionId }) => (
        <Card key={sectionId} className="bg-white !shadow-none border-4 border-white rounded-2xl group/section">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <div className="flex items-center gap-2">
                {editingSectionId === sectionId ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={editingSectionEmoji}
                      onChange={(e) => setEditingSectionEmoji(e.target.value)}
                      className="h-6 w-8 text-base border-0 p-0 focus-visible:ring-0 text-center"
                      placeholder="📂"
                      maxLength={2}
                    />
                    <Input
                      value={editingSectionName}
                      onChange={(e) => setEditingSectionName(e.target.value)}
                      className="h-6 text-base border-0 p-0 focus-visible:ring-0 font-semibold"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveSectionEdit();
                        if (e.key === 'Escape') handleCancelSectionEdit();
                      }}
                      autoFocus
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleSaveSectionEdit}
                      className="h-6 w-6 p-0 hover:bg-green-100 hover:text-green-600"
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCancelSectionEdit}
                      className="h-6 w-6 p-0 hover:bg-red-100 hover:text-red-600"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteSection(sectionId)}
                      className="h-6 w-6 p-0 hover:bg-red-100 hover:text-red-600"
                      title="Delete section"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <span
                    onClick={() => handleEditSection(sectionId, groupName, getSectionEmoji(sectionId))}
                    className="cursor-pointer hover:text-blue-600 transition-colors flex items-center gap-2"
                  >
                    <span className="text-lg">{getSectionEmoji(sectionId)}</span>
                    <span>{groupName}</span>
                  </span>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-[0px] pb-[0px]">
            <div className="flex flex-wrap gap-2">
              {groupCategories.map((category) => (
                <div
                  key={category.id}
                  onClick={() => handleEditCategory(category)}
                  className="group relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-white hover:bg-gray-100 hover:shadow-sm transition-all duration-150 border border-gray-200 cursor-pointer"
                >
                  <span className="text-base">{category.emoji || getCategoryEmoji(category.name)}</span>
                  <span className="font-medium whitespace-nowrap" style={{ fontSize: '12px' }}>{category.name}</span>
                </div>
              ))}

              {/* Add Category Button for this group */}
              <div
                className="opacity-0 group-hover/section:opacity-100 transition-opacity duration-200 flex items-center justify-center w-8 h-8 rounded-full bg-white hover:bg-gray-100 hover:shadow-sm border border-gray-200 cursor-pointer"
                onClick={() => {
                  handleAddCategory();
                  // Pre-select this section for the new category
                  form.setValue('section', sectionId);
                }}
              >
                <Plus className="h-4 w-4 text-gray-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Custom Categories */}
      {ungroupedCategories.length > 0 && (
        <Card className="bg-white !shadow-none border-4 border-white rounded-2xl group/section">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              Custom Categories
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {ungroupedCategories.map((category) => (
                <div
                  key={category.id}
                  onClick={() => handleEditCategory(category)}
                  className="group relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-white hover:bg-gray-100 hover:shadow-sm transition-all duration-150 border border-gray-200 cursor-pointer"
                >
                  <span className="text-base">{category.emoji || getCategoryEmoji(category.name)}</span>
                  <span className="font-medium whitespace-nowrap" style={{ fontSize: '12px' }}>{category.name}</span>
                </div>
              ))}

              {/* Add Category Button for custom categories */}
              <div
                className="opacity-0 group-hover/section:opacity-100 transition-opacity duration-200 flex items-center justify-center w-8 h-8 rounded-full bg-white hover:bg-gray-100 hover:shadow-sm border border-gray-200 cursor-pointer"
                onClick={() => {
                  handleAddCategory();
                  // Clear section for custom categories
                  form.setValue('section', '');
                }}
              >
                <Plus className="h-4 w-4 text-gray-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add New Section Button */}
      <div className="pt-4">
        {isAddingSectionOpen ? (
          <Card className="bg-white !shadow-none border-4 border-white rounded-2xl">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Input
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  placeholder="Enter section name"
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddNewSection();
                    if (e.key === 'Escape') setIsAddingSectionOpen(false);
                  }}
                  autoFocus
                />
                <Button
                  onClick={handleAddNewSection}
                  size="sm"
                  className="bg-mono-black hover:bg-mono-gray-800"
                  disabled={!newSectionName.trim()}
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddingSectionOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div
            className="flex items-center gap-3 cursor-pointer p-3 rounded-xl hover:bg-gray-50 transition-colors"
            onClick={() => setIsAddingSectionOpen(true)}
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white hover:bg-gray-100 hover:shadow-sm border border-gray-200">
              <Plus className="h-4 w-4 text-gray-400" />
            </div>
            <span className="text-sm font-medium text-gray-700">New Section</span>
          </div>
        )}
      </div>
    </div>
  );
}