import React, { useEffect, useRef, useState } from "react";
import {
  Plus,
  Trash2,
  X,
  Search,
  Settings,
  Edit,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "../../providers/AuthProvider";

import { useLanguage } from "../../contexts/LanguageContext";
import { menuService } from "../../services/menuService";
import toast from "react-hot-toast";
import { UploadCloud, Loader2, XCircle } from "lucide-react";
import AdminOptionsPanel from "../admin/AdminOptionsPanel"; // adjust path
import { SeedDataButton } from "./SeedDataButton";

interface Category {
  id: string;
  name_en: string;
  name_ar: string;
}

interface Ingredient {
  id: string;
  name_en: string;
  name_ar: string;
}

interface MenuItem {
  id: string;
  name_en: string;
  name_ar: string;
  price: number;
  image_url: string;
  available: boolean;
  category_id: string;
  created_at: string;
  user_id?: string;
  categories?: Category | null;
  ingredients_details?: {
    ingredient: Ingredient;
  }[];
}

interface ImageUploadFieldProps {
  value: string;
  onChange: (url: string) => void;
  disableManualInput?: boolean;
  uploadPrefix?: string;
  fieldId?: string;
}

// Subcomponents
const LoadingSpinner = () => (
  <div className="flex items-center justify-center p-8">
    <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
  </div>
);

// ✅ Converts a Supabase public URL -> "object path" expected by .remove()
function getPathFromPublicUrl(
  url: string,
  expectedBucket = "menu-images"
): string | null {
  try {
    const u = new URL(url);
    // URL looks like: /storage/v1/object/public/<bucket>/<path...>
    const marker = "/object/public/";
    const i = u.pathname.indexOf(marker);
    if (i === -1) return null;
    const after = u.pathname.slice(i + marker.length); // "<bucket>/<path>"
    const [bucket, ...pathParts] = after.split("/");
    if (bucket !== expectedBucket) return null;
    return decodeURIComponent(pathParts.join("/")); // "<path>"
  } catch {
    return null;
  }
}

const EmptyState = ({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) => (
  <div className="text-center p-12 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
    <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
      <Search className="w-8 h-8 text-slate-400" />
    </div>
    <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
      {title}
    </h3>
    <p className="text-slate-600 dark:text-slate-400 mb-4">{description}</p>
    {action}
  </div>
);

const CategoryForm = ({
  isOpen,
  onClose,
  onSubmit,
  loading,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { name_en: string; name_ar: string }) => void;
  loading: boolean;
}) => {
  const { t } = useLanguage();
  const [formData, setFormData] = useState({ name_en: "", name_ar: "" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.name_en.trim() && formData.name_ar.trim()) {
      onSubmit(formData);
      setFormData({ name_en: "", name_ar: "" });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
            {t("common.addCategory")}
          </h3>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {t("common.nameEn")}
            </label>
            <input
              type="text"
              value={formData.name_en}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name_en: e.target.value }))
              }
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Category name in English"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {t("common.nameAr")}
            </label>
            <input
              type="text"
              value={formData.name_ar}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name_ar: e.target.value }))
              }
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="اسم الفئة بالعربية"
              required
            />
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {loading ? t("common.adding") : t("common.add")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const IngredientForm = ({
  isOpen,
  onClose,
  onSubmit,
  loading,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { name_en: string; name_ar: string }) => void;
  loading: boolean;
}) => {
  const { t } = useLanguage();
  const [formData, setFormData] = useState({ name_en: "", name_ar: "" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.name_en.trim() && formData.name_ar.trim()) {
      onSubmit(formData);
      setFormData({ name_en: "", name_ar: "" });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
            {t("common.addIngredient")}
          </h3>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {t("common.nameEn")}
            </label>
            <input
              type="text"
              value={formData.name_en}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name_en: e.target.value }))
              }
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Ingredient name in English"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {t("common.nameAr")}
            </label>
            <input
              type="text"
              value={formData.name_ar}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name_ar: e.target.value }))
              }
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="اسم المكون بالعربية"
              required
            />
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {loading ? t("common.adding") : t("common.add")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const DeleteConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  loading,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  loading: boolean;
}) => {
  const { t } = useLanguage();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-10 h-10 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
            {title}
          </h3>
        </div>

        <p className="text-slate-600 dark:text-slate-400 mb-6">{message}</p>

        <div className="flex space-x-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {loading ? t("common.deleting") : t("common.delete")}
          </button>
        </div>
      </div>
    </div>
  );
};

const ImageUploadField = ({
  value,
  onChange,
  disableManualInput = false,
  uploadPrefix = "",
  fieldId = "file-upload",
}: ImageUploadFieldProps) => {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useLanguage();
  const { user } = useAuth();

  const handleFileUpload = async (file: File) => {
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("File size must be less than 5MB");
      return;
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setUploadError("Please select an image file");
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = uploadPrefix
        ? `${uploadPrefix}/${Date.now()}.${fileExt}`
        : `${Date.now()}.${fileExt}`;
      console.log('Uploading file:', fileName);

      // Use Backend API for upload
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("http://localhost:3000/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      const imageUrl = data.url;

      onChange(imageUrl);
    } catch (err: any) {
      console.error("Upload failed:", err.message);
      setUploadError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const handleRemoveImage = async () => {
    if (!value) return;
    if (!window.confirm("Are you sure you want to delete this image?")) return;

    try {
      // Ensure the user is logged in (needed if your policy is "owner = auth.uid()")
      if (!user) {
        console.warn("No auth user; delete will be blocked by RLS.");
        return;
      }

      // If you already store "imagePath" in DB, prefer that:
      // const path = imagePath ?? getPathFromPublicUrl(value);
      const path = getPathFromPublicUrl(value);
      if (!path) {
        console.warn("Could not resolve storage path from URL:", value);
        return;
      }

      // Supabase storage delete not configured - skip for now
      /*
      const { error } = await supabase.storage
        .from("menu-images")
        .remove([path]);
      if (error) {
        console.warn("Failed to delete image from Supabase:", error);
        return;
      }
      */

      onChange(""); // clear the field
    } catch (err) {
      console.warn("Failed to delete image from Supabase:", err);
    }
  };

  const handleRetryClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-2">
      <label
        htmlFor={fieldId}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`relative flex items-center justify-center px-4 py-10 border-2 border-dashed rounded-lg cursor-pointer transition group
          ${isDragging
            ? "border-emerald-500 bg-emerald-50"
            : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700"
          }
        `}
      >
        {uploading ? (
          <div className="flex items-center gap-2 text-emerald-600">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>{t("common.uploading")}</span>
          </div>
        ) : value ? (
          <div className="w-full flex flex-col items-center gap-2 group relative">
            <div className="relative w-full">
              <img
                src={value}
                alt={t("common.uploaded")}
                className="h-40 w-full object-contain rounded-md"
              />
              <div className="absolute inset-0 bg-opacity-50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                >
                  {t("common.remove")}
                </button>
              </div>
            </div>
            <div className="bg-emerald-600 text-white px-3 py-1 rounded text-xs shadow">
              {t("common.uploaded")}
            </div>
          </div>
        ) : (
          <div className="text-center text-slate-500 dark:text-slate-300">
            <UploadCloud className="w-6 h-6 mx-auto mb-2" />
            <p>{t("common.placeholder")}</p>
          </div>
        )}

        <input
          id={fieldId}
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleSelectFile}
          disabled={disableManualInput || !!value}
        />
      </label>

      {uploadError && (
        <div className="flex items-center justify-between bg-red-50 dark:bg-red-900/20 p-2 rounded text-red-700 dark:text-red-300 text-sm">
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4" />
            <span>{uploadError}</span>
          </div>
          <button
            onClick={handleRetryClick}
            className="text-sm text-red-600 dark:text-red-300 underline hover:text-red-800 dark:hover:text-white"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
};

const DigitalMenu: React.FC = () => {
  const { t, language } = useLanguage();
  const { user } = useAuth();

  // State management
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [loading, setLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Modal states
  const [formOpen, setFormOpen] = useState(false);
  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const [ingredientFormOpen, setIngredientFormOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteAllModalOpen, setDeleteAllModalOpen] = useState(false);

  // Loading states
  const [formLoading, setFormLoading] = useState(false);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [ingredientLoading, setIngredientLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Form state
  const [form, setForm] = useState({
    id: null as string | null,
    name_en: "",
    name_ar: "",
    price: "",
    category_id: "",
    image_url: "",
    available: true,
    ingredients: [] as string[],
  });

  const fieldRefs = useRef<
    Record<string, HTMLInputElement | HTMLSelectElement | null>
  >({
    name_en: null,
    name_ar: null,
    price: null,
    category_id: null,
  });

  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  // Helper function to get localized name
  const getLocalizedName = (item: { name_en: string; name_ar: string }) => {
    return language === "ar" ? item.name_ar : item.name_en;
  };

  // Data fetching
  useEffect(() => {
    if (!user) return;

    fetchItems();
    fetchCategories();
    fetchIngredients();

    // Prevent component reload on tab switch
    const handleVisibilityChange = () => {
      if (!document.hidden && user) {
        // Tab became visible - refresh data if needed
        const lastFetch = sessionStorage.getItem("lastDataFetch");
        const now = Date.now();

        // Only refetch if more than 5 minutes have passed
        if (!lastFetch || now - parseInt(lastFetch) > 300000) {
          fetchItems();
          fetchCategories();
          fetchIngredients();
          sessionStorage.setItem("lastDataFetch", now.toString());
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [user]);

  const fetchItems = async () => {
    if (!user) return;

    try {
      setLoading(true);

      // Always fetch fresh data when explicitly called
      // Only use cache on initial component mount
      const shouldUseCache = !items.length && !document.hidden;

      if (shouldUseCache) {
        const cachedItems = sessionStorage.getItem(`menuItems_${user.id}`);
        if (cachedItems) {
          try {
            const parsed = JSON.parse(cachedItems);
            // Validate cache integrity (check for NaN prices)
            if (
              parsed &&
              Array.isArray(parsed.data) &&
              parsed.data.every((i: any) => !isNaN(Number(i.price)))
            ) {
              if (Date.now() - parsed.timestamp < 300000) {
                setItems(parsed.data);
                setLoading(false);
                return;
              }
            } else {
              sessionStorage.removeItem(`menuItems_${user.id}`);
            }
          } catch {
            sessionStorage.removeItem(`menuItems_${user.id}`);
          }
        }
      }

      const data = await menuService.getMenuItems(user.id);

      console.log("Fetched items:", data); // Debug log

      // FIX: Apply client-side filtering as a temporary workaround.
      // The backend should ideally filter items by user_id.
      const userItems = (data || []).filter(
        (item: MenuItem) => item.user_id === user.id
      );

      setItems(userItems);

      // Cache the data
      if (userItems) {
        sessionStorage.setItem(
          `menuItems_${user.id}`,
          JSON.stringify({
            data: userItems,
            timestamp: Date.now(),
          })
        );
      }
    } catch (error) {
      console.error("Error fetching items:", error);
      return [];
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const data = await menuService.getCategories();
      setCategories(data || []);
    } catch (error) {
      console.error("Error fetching categories:", error);
      return [];
    }
  };

  const fetchIngredients = async () => {
    try {
      const data = await menuService.getIngredients();
      setIngredients(data || []);
    } catch (error) {
      console.error("Error fetching ingredients:", error);
      return [];
    }
  };

  // Category management
  const handleAddCategory = async (categoryData: {
    name_en: string;
    name_ar: string;
  }) => {
    try {
      setCategoryLoading(true);
      const data = await menuService.addCategory(categoryData);

      setCategories((prev) => [...prev, data]);
      setCategoryFormOpen(false);
    } catch (error) {
      console.error("Error adding category:", error);
    } finally {
      setCategoryLoading(false);
    }
  };

  // Ingredient management
  const handleAddIngredient = async (ingredientData: {
    name_en: string;
    name_ar: string;
  }) => {
    try {
      setIngredientLoading(true);
      const data = await menuService.addIngredient(ingredientData);

      setIngredients((prev) => [...prev, data]);
      setIngredientFormOpen(false);
    } catch (error) {
      console.error("Error adding ingredient:", error);
    } finally {
      setIngredientLoading(false);
    }
  };

  // Menu item management
  const openForm = (item?: MenuItem) => {
    if (item) {
      setForm({
        id: item.id,
        name_en: item.name_en,
        name_ar: item.name_ar,
        price: item.price.toString(),
        category_id: item.category_id,
        image_url: item.image_url,
        available: item.available,
        ingredients:
          item.ingredients_details?.map((i) => i.ingredient.id) || [],
      });
    } else {
      setForm({
        id: null,
        name_en: "",
        name_ar: "",
        price: "",
        category_id: "",
        image_url: "",
        available: true,
        ingredients: [],
      });
    }
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    const newErrors: Record<string, string> = {};

    if (!form.name_en.trim()) newErrors.name_en = t("common.required");
    if (!form.name_ar.trim()) newErrors.name_ar = t("common.required");
    if (!form.price.trim()) newErrors.price = t("common.required");
    if (!form.category_id) newErrors.category_id = t("common.required");

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      // Scroll to first invalid field
      const firstKey = Object.keys(newErrors)[0];
      const firstEl = fieldRefs.current[firstKey];
      if (firstEl)
        firstEl.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    if (!user) {
      toast.error(t("common.authError") || "User not authenticated");
      return;
    }

    const { name_en, name_ar, price, category_id } = form;

    const payload = {
      name_en: name_en.trim(),
      name_ar: name_ar.trim(),
      price: parseFloat(price),
      category_id,
      available: form.available,
      user_id: user.id,
      image_url: form.image_url || undefined,
      ingredients: form.ingredients, // Pass ingredients to service
    };

    setFormLoading(true);

    try {

      await toast.promise(
        (async () => {
          if (form.id) {
            await menuService.updateMenuItem(form.id, payload);
          } else {
            await menuService.addMenuItem(payload);
          }
        })(),
        {
          loading: form.id ? t("common.saving") : t("common.adding"),
          success: form.id ? t("common.updated") : t("common.added"),
          error: (err: any) => err.message || t("common.errorOccurred") || "Something went wrong",
        }
      );

      setFormOpen(false);
      sessionStorage.removeItem(`menuItems_${user.id}`);
      await fetchItems();
    } catch (error) {
      console.error("Error saving item:", error);
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    setItemToDelete(itemId);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;

    try {
      setDeleteLoading(true);

      await menuService.deleteMenuItem(itemToDelete);

      // 4) UI
      setItems((prev) => prev.filter((it) => it.id !== itemToDelete));
      setDeleteModalOpen(false);
      setItemToDelete(null);
    } catch (e) {
      console.error("Delete item failed:", e);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedItems.length === 0) return;

    try {
      setDeleteLoading(true);

      // 5) Soft-delete DB rows + clear image_url
      await Promise.all(
        selectedItems.map((id) => menuService.deleteMenuItem(id))
      );

      // 6) UI
      setItems((prev) =>
        prev.filter((item) => !selectedItems.includes(item.id))
      );
      sessionStorage.removeItem(`menuItems_${user?.id}`);
      toast.success(
        t("common.deletedSelected", { count: String(selectedItems.length) }) ||
        `${selectedItems.length} items deleted successfully`
      );
      setSelectedItems([]);
      setDeleteAllModalOpen(false);
    } catch (e) {
      console.error("Bulk delete failed:", e);
      fetchItems(); // fallback refresh
    } finally {
      setDeleteLoading(false);
    }
  };

  const toggleItemSelection = (itemId: string) => {
    setSelectedItems((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedItems.length === filteredItems.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(filteredItems.map((item) => item.id));
    }
  };

  // Quick toggle availability handler
  const handleToggleAvailability = async (itemId: string, currentAvailable: boolean) => {
    const newAvailable = !currentAvailable;

    // Optimistic UI update
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, available: newAvailable } : item
      )
    );

    try {
      await menuService.toggleAvailability(itemId, newAvailable);
      toast.success(
        newAvailable
          ? t("common.itemNowAvailable") || "Item is now available"
          : t("common.itemNowUnavailable") || "Item is now out of stock"
      );
      // Clear cache to ensure fresh data on next fetch
      if (user) sessionStorage.removeItem(`menuItems_${user.id}`);
    } catch (error) {
      // Revert optimistic update on error
      setItems((prev) =>
        prev.map((item) =>
          item.id === itemId ? { ...item, available: currentAvailable } : item
        )
      );
      toast.error(t("common.errorOccurred") || "Failed to update availability");
      console.error("Error toggling availability:", error);
    }
  };

  // Filtering
  const filteredItems = items.filter((item) => {
    const matchesCategory =
      selectedCategory === "All" || item.category_id === selectedCategory;
    const matchesSearch =
      item.name_en.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.name_ar || "").toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Add timeout for loading state
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (loading) {
        console.warn("Loading timeout - forcing loading to false");
        setLoading(false);
      }
    }, 10000); // 10 second timeout

    return () => clearTimeout(timeout);
  }, [loading]);

  if (loading && user) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center justify-between mb-6 flex-col sm:flex-row">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-lg flex items-center justify-center">
              <Settings className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                {t("admin.title")}
              </h2>
              <p className="text-slate-600 dark:text-slate-400">
                {t("admin.subtitle")}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <SeedDataButton userId={user?.id} onComplete={fetchItems} />

            <button
              onClick={() => setCategoryFormOpen(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center space-x-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>{t("common.addCategory")}</span>
            </button>

            <button
              onClick={() => setIngredientFormOpen(true)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg flex items-center space-x-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>{t("common.addIngredient")}</span>
            </button>

            <button
              onClick={() => openForm()}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center space-x-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>{t("common.addItem")}</span>
            </button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-3 w-full border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder={t("common.search")}
            />
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="All">{t("menu.all")}</option>
            {categories.map((cat) => (
              <option key={cat.id} value={String(cat.id)}>
                {getLocalizedName(cat)}
              </option>
            ))}
          </select>
        </div>

        {/* Bulk Actions */}
        {selectedItems.length > 0 && (
          <div className="mt-4 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-700">
            <div className="flex items-center justify-between">
              <span className="text-emerald-800 dark:text-emerald-300 font-medium">
                {selectedItems.length} {t("common.itemsSelected")}
              </span>
              <button
                onClick={() => setDeleteAllModalOpen(true)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center space-x-2 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>{t("common.deleteSelected")}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Items Grid */}
      {filteredItems.length > 0 ? (
        <div className="space-y-4">
          {/* Select All */}
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={
                selectedItems.length === filteredItems.length &&
                filteredItems.length > 0
              }
              onChange={toggleSelectAll}
              className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500"
            />
            <span className="text-sm text-slate-600 dark:text-slate-400">
              {t("common.selectAll")} ({filteredItems.length})
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm hover:shadow-md transition-shadow p-4"
              >
                <div className="flex items-start space-x-3 mb-3">
                  <input
                    type="checkbox"
                    checked={selectedItems.includes(item.id)}
                    onChange={() => toggleItemSelection(item.id)}
                    className="mt-1 w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500"
                  />

                  {item.image_url && (
                    <img
                      src={item.image_url}
                      className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                      alt={getLocalizedName(item)}
                    />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-1">
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white truncate">
                        {getLocalizedName(item)}
                      </h3>
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold text-lg ml-2">
                        ${Number(item.price).toFixed(2)}
                      </span>
                    </div>

                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                      {item.categories
                        ? getLocalizedName(item.categories)
                        : t("common.noCategory")}
                    </p>

                    <div className="flex items-center justify-between space-x-2 mb-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${item.available
                          ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400"
                          : "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400"
                          }`}
                      >
                        {item.available
                          ? t("common.available")
                          : t("common.unavailable")}
                      </span>

                      {/* Quick Toggle Switch */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleAvailability(item.id, item.available);
                        }}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${item.available
                          ? "bg-emerald-600"
                          : "bg-slate-300 dark:bg-slate-600"
                          }`}
                        title={item.available ? t("common.markUnavailable") || "Mark unavailable" : t("common.markAvailable") || "Mark available"}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${item.available ? "translate-x-6" : "translate-x-1"
                            }`}
                        />
                      </button>
                    </div>

                    {item.ingredients_details &&
                      item.ingredients_details.length > 0 && (
                        <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">
                          {t("common.ingredients")}:{" "}
                          {item.ingredients_details
                            .map((i) =>
                              i.ingredient ? getLocalizedName(i.ingredient) : ""
                            )
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      )}

                    <div className="flex justify-between items-center">
                      <button
                        onClick={() => openForm(item)}
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm flex items-center space-x-1 transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                        <span>{t("common.edit")}</span>
                      </button>

                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-sm flex items-center space-x-1 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>{t("common.delete")}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState
          title={t("common.noItems")}
          description={t("common.noItemsDescription")}
          action={
            <button
              onClick={() => openForm()}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center space-x-2 mx-auto transition-colors"
            >
              <Plus className="w-5 h-5" />
              <span>{t("common.addFirstItem")}</span>
            </button>
          }
        />
      )}

      {/* Menu Item Form Modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/30 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 shadow-xl w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-xl overflow-y-auto p-4 sm:p-6 md:h-auto">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                {form.id ? t("common.editItem") : t("common.addItem")}
              </h3>
              <button
                onClick={() => setFormOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                {/* Name EN */}
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">
                    {t("common.nameEn")} *
                  </label>
                  <input
                    ref={(el) => { fieldRefs.current.name_en = el; }}
                    value={form.name_en}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name_en: e.target.value }))
                    }
                    placeholder={t("common.nameEn")}
                    className={`w-full px-3 py-2 rounded-lg border ${errors.name_en
                      ? "border-red-500"
                      : "border-slate-300 dark:border-slate-600"
                      } bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                  />
                  {errors.name_en && (
                    <p className="text-sm text-red-500 mt-1">
                      {errors.name_en}
                    </p>
                  )}
                </div>

                {/* Name AR */}
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">
                    {t("common.nameAr")} *
                  </label>
                  <input
                    ref={(el) => { fieldRefs.current.name_ar = el; }}
                    value={form.name_ar}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name_ar: e.target.value }))
                    }
                    placeholder={t("common.nameAr")}
                    className={`w-full px-3 py-2 rounded-lg border ${errors.name_ar
                      ? "border-red-500"
                      : "border-slate-300 dark:border-slate-600"
                      } bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                  />
                  {errors.name_ar && (
                    <p className="text-sm text-red-500 mt-1">
                      {errors.name_ar}
                    </p>
                  )}
                </div>

                {/* Price */}
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">
                    {t("common.price")} *
                  </label>
                  <input
                    ref={(el) => { fieldRefs.current.price = el; }}
                    type="number"
                    step="0.01"
                    value={form.price}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, price: e.target.value }))
                    }
                    placeholder="0.00"
                    className={`w-full px-3 py-2 rounded-lg border ${errors.price
                      ? "border-red-500"
                      : "border-slate-300 dark:border-slate-600"
                      } bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                  />
                  {errors.price && (
                    <p className="text-sm text-red-500 mt-1">{errors.price}</p>
                  )}
                </div>

                {/* Category */}
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">
                    {t("common.category")} *
                  </label>
                  <select
                    ref={(el) => { fieldRefs.current.category_id = el; }}
                    value={form.category_id ?? " hjk"}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, category_id: e.target.value }))
                    }
                    className={`w-full px-3 py-2 rounded-lg border ${errors.category_id
                      ? "border-red-500"
                      : "border-slate-300 dark:border-slate-600"
                      } bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                  >
                    <option value="">{t("common.selectCategory")}</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={String(cat.id)}>
                        {getLocalizedName(cat)}
                      </option>
                    ))}
                  </select>
                  {errors.category_id && (
                    <p className="text-sm text-red-500 mt-1">
                      {errors.category_id}
                    </p>
                  )}
                </div>

                {/* Image Upload */}
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">
                    {t("common.image")}
                  </label>
                  <ImageUploadField
                    value={form.image_url}
                    onChange={(url) =>
                      setForm((f) => ({ ...f, image_url: url }))
                    }
                    disableManualInput={Boolean(form.image_url)}
                    uploadPrefix={user?.id ? `${user.id}/menu-items` : ""}
                    fieldId={`menu-item-image-${form.id || "new"}`}
                  />
                </div>

                {/* Available Checkbox */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {t("common.available")}
                  </span>
                  <button
                    onClick={() =>
                      setForm((f) => ({ ...f, available: !f.available }))
                    }
                    className={`w-10 h-6 flex items-center rounded-full p-1 transition-colors ${form.available ? "bg-emerald-500" : "bg-slate-300"
                      }`}
                  >
                    <div
                      className={`w-4 h-4 bg-white rounded-full shadow-md transform duration-300 ${form.available ? "translate-x-4" : "translate-x-0"
                        }`}
                    />
                  </button>
                </div>
              </div>

              {/* Ingredients List */}
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">
                  {t("common.ingredients")}
                </label>
                <div className="max-h-64 overflow-y-auto border border-slate-300 dark:border-slate-600 rounded-lg p-3 space-y-2">
                  {ingredients.map((ing) => (
                    <label
                      key={ing.id}
                      className="flex items-center space-x-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={form.ingredients.includes(ing.id)}
                        onChange={() =>
                          setForm((f) => ({
                            ...f,
                            ingredients: f.ingredients.includes(ing.id)
                              ? f.ingredients.filter((i) => i !== ing.id)
                              : [...f.ingredients, ing.id],
                          }))
                        }
                        className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500"
                      />
                      <span className="text-slate-700 dark:text-slate-300">
                        {getLocalizedName(ing)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            {form.id && (
              <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
                <h4 className="text-lg font-semibold mb-3">
                  Advanced: Options & Combos
                </h4>
                <p className="text-sm text-slate-500 mb-3">
                  Configure ingredient rules, modifier groups & options, and
                  meal combos for this item.
                </p>
                <AdminOptionsPanel menuId={form.id} adminId={user?.id} />
              </div>
            )}
            {/* Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setFormOpen(false)}
                className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleSubmit}
                disabled={formLoading}
                className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {formLoading
                  ? t("common.saving")
                  : form.id
                    ? t("common.updateItem")
                    : t("common.addItem")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Form Modal */}
      <CategoryForm
        isOpen={categoryFormOpen}
        onClose={() => setCategoryFormOpen(false)}
        onSubmit={handleAddCategory}
        loading={categoryLoading}
      />

      {/* Ingredient Form Modal */}
      <IngredientForm
        isOpen={ingredientFormOpen}
        onClose={() => setIngredientFormOpen(false)}
        onSubmit={handleAddIngredient}
        loading={ingredientLoading}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setItemToDelete(null);
        }}
        onConfirm={confirmDelete}
        title={t("common.deleteItem")}
        message={t("common.deleteItemConfirm")}
        loading={deleteLoading}
      />

      {/* Delete All Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={deleteAllModalOpen}
        onClose={() => setDeleteAllModalOpen(false)}
        onConfirm={handleDeleteSelected}
        title={t("common.deleteSelected")}
        message={t("common.deleteSelectedConfirm", {
          count: selectedItems.length.toString(),
        })}
        loading={deleteLoading}
      />
    </div>
  );
};

export default DigitalMenu;
