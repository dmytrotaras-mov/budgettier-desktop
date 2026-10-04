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
import { useSections, visibleSections, isHiddenCategory, SECTIONS_QUERY_KEY, type Section } from "@/lib/sectionUtils";

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

interface CategoryGroupsProps {
  type: "income" | "expense";
}

export default function CategoryGroups({ type }: CategoryGroupsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  // Queries
  const { data: categories = [], isLoading, error } = useQuery<any[]>({
    queryKey: [`/api/categories/${type}`],
    enabled: !!type,
  });
  const { data: allSections = [] } = useSections();
  // Sections of this type shown in Settings (hidden "System" group excluded).
  const typeSections: Section[] = visibleSections(allSections, type);

  // Section editing state
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionName, setEditingSectionName] = useState("");
  const [editingSectionEmoji, setEditingSectionEmoji] = useState("");
  const [isAddingSectionOpen, setIsAddingSectionOpen] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [isCreatingNewSection, setIsCreatingNewSection] = useState(false);
  const [newSectionNameInModal, setNewSectionNameInModal] = useState("");

  // Options for the "Section" picker in the category dialog
  const availableSections = typeSections.map((s) => ({ id: s.id, label: s.name }));

  const refreshSectionsAndCategories = () => {
    queryClient.invalidateQueries({ queryKey: SECTIONS_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
    queryClient.invalidateQueries({ queryKey: [`/api/categories/${type}`] });
  };

  // Create a section in the database; returns the new section's id.
  const createSection = async (name: string): Promise<string | null> => {
    try {
      const res = await apiRequest("POST", "/api/sections", { type, name });
      if (!res.ok) throw new Error(await res.text());
      const created: Section = await res.json();
      refreshSectionsAndCategories();
      return created.id;
    } catch (err: any) {
      toast({
        title: "Couldn't create section",
        description: String(err?.message || err),
        variant: "destructive",
      });
      return null;
    }
  };

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
    onSuccess: () => {
      // Invalidate all category queries to refresh the UI immediately
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      queryClient.invalidateQueries({ queryKey: [`/api/categories/${type}`] });
      toast({ title: "Category deleted successfully" });
    },
  });

  const handleEditCategory = (category: any) => {
    setSelectedCategory(category);
    const currentSection = typeSections.find((s) => s.name === category.section);
    form.reset({
      name: category.name,
      type: category.type,
      emoji: category.emoji || getCategoryEmoji(category.name),
      section: currentSection?.id,
    });
    setIsDialogOpen(true);
  };

  const getSectionDisplayName = (sectionId: string): string =>
    typeSections.find((s) => s.id === sectionId)?.name ?? "";

  const getSectionEmoji = (sectionId: string): string =>
    typeSections.find((s) => s.id === sectionId)?.emoji || "📂";

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

  const resetSectionEdit = () => {
    setEditingSectionId(null);
    setEditingSectionName("");
    setEditingSectionEmoji("");
  };

  const handleSaveSectionEdit = async () => {
    if (!editingSectionId || !editingSectionName.trim()) return;
    try {
      // Renaming also moves this section's categories to the new name (in Rust).
      const res = await apiRequest("PUT", `/api/sections/${editingSectionId}`, {
        name: editingSectionName.trim(),
        emoji: editingSectionEmoji || "",
      });
      if (!res.ok) throw new Error(await res.text());
      refreshSectionsAndCategories();
      resetSectionEdit();
      toast({ title: "Section updated successfully" });
    } catch (err: any) {
      toast({
        title: "Couldn't update section",
        description: String(err?.message || err),
        variant: "destructive",
      });
    }
  };

  const handleCancelSectionEdit = resetSectionEdit;

  const handleDeleteSection = async (sectionId: string) => {
    try {
      const res = await apiRequest("DELETE", `/api/sections/${sectionId}`);
      if (!res.ok) throw new Error(await res.text());
      const result: { reset: boolean; movedCategories: number } = await res.json();
      refreshSectionsAndCategories();
      resetSectionEdit();
      if (result.reset) {
        toast({ title: "Section name reset to default" });
      } else {
        toast({
          title: "Section deleted successfully",
          description:
            result.movedCategories > 0
              ? `${result.movedCategories} ${result.movedCategories === 1 ? "category" : "categories"} moved to Custom Categories`
              : undefined,
        });
      }
    } catch (err: any) {
      toast({
        title: "Couldn't delete section",
        description: String(err?.message || err),
        variant: "destructive",
      });
    }
  };

  const handleAddNewSection = async () => {
    if (!newSectionName.trim()) return;
    const id = await createSection(newSectionName.trim());
    if (!id) return;
    setNewSectionName("");
    setIsAddingSectionOpen(false);
    toast({ title: "New section added successfully" });
  };

  // Create a section from inside the category dialog and select it.
  const handleCreateSectionInModal = async (onSelect: (id: string) => void) => {
    const name = newSectionNameInModal.trim();
    if (!name) return;
    const id = await createSection(name);
    if (!id) return;
    onSelect(id);
    setNewSectionNameInModal("");
    setIsCreatingNewSection(false);
  };

  const onSubmit = (data: z.infer<typeof categoryFormSchema>) => {
    // The database stores the section NAME on the category ("" clears it).
    const backendData = {
      ...data,
      section: data.section ? getSectionDisplayName(data.section) || null : null,
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

  // Categories of this type; internal ones (hidden "System" section) excluded.
  const filteredCategories = categories.filter(
    (cat) => cat.type === type && !isHiddenCategory(cat, allSections),
  );

  // One card per section, in the order stored in the database.
  const groupedCategories = typeSections.map((section) => ({
    groupName: section.name,
    categories: filteredCategories.filter((cat) => cat.section === section.name),
    isCustom: !section.isDefault,
    sectionId: section.id,
  }));

  // No section (or a section that no longer exists) → "Custom Categories".
  const sectionNames = new Set(typeSections.map((s) => s.name));
  const ungroupedCategories = filteredCategories.filter(
    (cat) => !cat.section || !sectionNames.has(cat.section),
  );

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
                                  void handleCreateSectionInModal(field.onChange);
                                }
                              }}
                            />
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => void handleCreateSectionInModal(field.onChange)}
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
      {groupedCategories.map(({ groupName, categories: groupCategories, sectionId }) => (
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