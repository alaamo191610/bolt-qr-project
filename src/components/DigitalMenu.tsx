import React, { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, X, Search, Check, Settings, Edit, AlertTriangle } from 'lucide-react'
import { menuService } from '../services/menuService'
import { useAuth } from '../hooks/useAuth'
import { useLanguage } from '../contexts/LanguageContext'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast';
import { UploadCloud, Loader2, CheckCircle, XCircle } from 'lucide-react'


interface Category {
  id: string
  name_en: string
  name_ar: string
}

interface Ingredient {
  id: string
  name_en: string
  name_ar: string
}

interface MenuItem {
  id: string
  name_en: string
  name_ar: string
  price: number
  image_url: string
  available: boolean
  category_id: string
  created_at: string
  categories?: Category | null
  ingredients_details?: {
    ingredient: Ingredient
  }[]
}

// Subcomponents
const LoadingSpinner = () => (
  <div className="flex items-center justify-center p-8">
    <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
  </div>
)

const EmptyState = ({ title, description, action }: { title: string, description: string, action?: React.ReactNode }) => (
  <div className="text-center p-12 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
    <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
      <Search className="w-8 h-8 text-slate-400" />
    </div>
    <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">{title}</h3>
    <p className="text-slate-600 dark:text-slate-400 mb-4">{description}</p>
    {action}
  </div>
)

const CategoryForm = ({
  isOpen,
  onClose,
  onSubmit,
  loading
}: {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: { name_en: string, name_ar: string }) => void
  loading: boolean
}) => {
  const { t } = useLanguage()
  const [formData, setFormData] = useState({ name_en: '', name_ar: '' })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (formData.name_en.trim() && formData.name_ar.trim()) {
      onSubmit(formData)
      setFormData({ name_en: '', name_ar: '' })
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">{t('common.addCategory')}</h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {t('common.nameEn')}
            </label>
            <input
              type="text"
              value={formData.name_en}
              onChange={(e) => setFormData(prev => ({ ...prev, name_en: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Category name in English"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {t('common.nameAr')}
            </label>
            <input
              type="text"
              value={formData.name_ar}
              onChange={(e) => setFormData(prev => ({ ...prev, name_ar: e.target.value }))}
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
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {loading ? t('common.adding') : t('common.add')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const IngredientForm = ({
  isOpen,
  onClose,
  onSubmit,
  loading
}: {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: { name_en: string, name_ar: string }) => void
  loading: boolean
}) => {
  const { t } = useLanguage()
  const [formData, setFormData] = useState({ name_en: '', name_ar: '' })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (formData.name_en.trim() && formData.name_ar.trim()) {
      onSubmit(formData)
      setFormData({ name_en: '', name_ar: '' })
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">{t('common.addIngredient')}</h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {t('common.nameEn')}
            </label>
            <input
              type="text"
              value={formData.name_en}
              onChange={(e) => setFormData(prev => ({ ...prev, name_en: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Ingredient name in English"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {t('common.nameAr')}
            </label>
            <input
              type="text"
              value={formData.name_ar}
              onChange={(e) => setFormData(prev => ({ ...prev, name_ar: e.target.value }))}
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
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {loading ? t('common.adding') : t('common.add')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const DeleteConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  loading
}: {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  loading: boolean
}) => {
  const { t } = useLanguage()

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-10 h-10 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h3>
        </div>

        <p className="text-slate-600 dark:text-slate-400 mb-6">{message}</p>

        <div className="flex space-x-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {loading ? t('common.deleting') : t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  )
}

const DigitalMenu: React.FC = () => {
  const { t, language } = useLanguage()
  const { user } = useAuth()

  // State management
  const [items, setItems] = useState<MenuItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [loading, setLoading] = useState(true)
  const [selectedItems, setSelectedItems] = useState<string[]>([])

  // Modal states
  const [formOpen, setFormOpen] = useState(false)
  const [categoryFormOpen, setCategoryFormOpen] = useState(false)
  const [ingredientFormOpen, setIngredientFormOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteAllModalOpen, setDeleteAllModalOpen] = useState(false)

  // Loading states
  const [formLoading, setFormLoading] = useState(false)
  const [categoryLoading, setCategoryLoading] = useState(false)
  const [ingredientLoading, setIngredientLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Form state
  const [form, setForm] = useState({
    id: null as string | null,
    name_en: '',
    name_ar: '',
    price: '',
    category_id: '',
    image_url: '',
    available: true,
    ingredients: [] as string[],
  })

  const [itemToDelete, setItemToDelete] = useState<string | null>(null)

  // Helper function to get localized name
  const getLocalizedName = (item: { name_en: string; name_ar: string }) => {
    return language === 'ar' ? item.name_ar : item.name_en
  }

  // Data fetching
  useEffect(() => {
    if (!user) return;

    fetchItems()
    fetchCategories()
    fetchIngredients()

    // Prevent component reload on tab switch
    const handleVisibilityChange = () => {
      if (!document.hidden && user) {
        // Tab became visible - refresh data if needed
        const lastFetch = sessionStorage.getItem('lastDataFetch');
        const now = Date.now();

        // Only refetch if more than 5 minutes have passed
        if (!lastFetch || now - parseInt(lastFetch) > 300000) {
          fetchItems();
          fetchCategories();
          fetchIngredients();
          sessionStorage.setItem('lastDataFetch', now.toString());
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user])

  const fetchItems = async () => {
    if (!user) return

    try {
      setLoading(true)

      // Always fetch fresh data when explicitly called
      // Only use cache on initial component mount
      const shouldUseCache = !items.length && !document.hidden

      if (shouldUseCache) {
        const cachedItems = sessionStorage.getItem(`menuItems_${user.id}`);
        if (cachedItems) {
          const parsed = JSON.parse(cachedItems);
          if (Date.now() - parsed.timestamp < 300000) { // 5 minutes cache
            setItems(parsed.data);
            setLoading(false);
            return;
          }
        }
      }

      const { data, error } = await supabase
        .from('menus')
        .select(`
          *, 
          categories(id, name_en, name_ar), 
          ingredients_details:menu_ingredients(ingredient:ingredients(id, name_en, name_ar))
        `)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (error) throw error

      console.log('Fetched items:', data) // Debug log
      setItems(data || [])

      // Cache the data
      if (data) {
        sessionStorage.setItem(`menuItems_${user.id}`, JSON.stringify({
          data: data,
          timestamp: Date.now()
        }));
      }
    } catch (error) {
      console.error('Error fetching items:', error)
      return []
    } finally {
      setLoading(false)
    }
  }
  const ImageUploadField = ({ value, onChange }: { value: string; onChange: (url: string) => void }) => {
    const [uploading, setUploading] = useState(false)
    const [uploadError, setUploadError] = useState<string | null>(null)

    const handleFileUpload = async (file: File) => {
      setUploading(true)
      setUploadError(null)

      try {
        const fileExt = file.name.split('.').pop()
        const fileName = `${Date.now()}.${fileExt}`

        const { data, error } = await supabase.storage
          .from('menu-images') // Make sure this bucket exists
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false,
          })

        if (error) throw error

        const { data: publicUrlData } = supabase.storage
          .from('menu-images')
          .getPublicUrl(fileName)

        const imageUrl = publicUrlData?.publicUrl || ''
        onChange(imageUrl)
      } catch (err: any) {
        console.error('Upload failed:', err.message)
        setUploadError('Upload failed. Please try again.')
      } finally {
        setUploading(false)
      }
    }

    const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
      e.preventDefault()
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFileUpload(e.dataTransfer.files[0])
      }
    }

    const handleSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
        handleFileUpload(e.target.files[0])
      }
    }

    return (
      <div className="space-y-2">
        <label
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          className="flex items-center justify-center px-4 py-10 border-2 border-dashed rounded-lg cursor-pointer bg-white dark:bg-slate-700 hover:border-emerald-500 transition"
        >
          <div className="text-center">
            {uploading ? (
              <div className="flex items-center justify-center gap-2 text-emerald-600">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Uploading...</span>
              </div>
            ) : value ? (
              <div className="space-y-2">
                <img src={value} alt="Uploaded" className="h-24 mx-auto rounded-md object-contain" />
                <div className="flex items-center justify-center gap-2 text-green-600">
                  <CheckCircle className="w-4 h-4" />
                  <span>Uploaded</span>
                </div>
              </div>
            ) : (
              <div className="text-slate-500 dark:text-slate-300">
                <UploadCloud className="w-6 h-6 mx-auto mb-2" />
                <p>Click or drag image to upload</p>
              </div>
            )}
          </div>
          <input type="file" accept="image/*" className="hidden" onChange={handleSelectFile} />
        </label>

        {uploadError && (
          <div className="flex items-center gap-2 text-red-600 text-sm">
            <XCircle className="w-4 h-4" />
            <span>{uploadError}</span>
          </div>
        )}
      </div>
    )
  }
  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name_en')

      if (error) throw error
      setCategories(data || [])
    } catch (error) {
      console.error('Error fetching categories:', error)
      return []
    }
  }

  const fetchIngredients = async () => {
    try {
      const { data, error } = await supabase
        .from('ingredients')
        .select('*')
        .order('name_en')

      if (error) throw error
      setIngredients(data || [])
    } catch (error) {
      console.error('Error fetching ingredients:', error)
      return []
    }
  }

  // Category management
  const handleAddCategory = async (categoryData: { name_en: string, name_ar: string }) => {
    try {
      setCategoryLoading(true)
      const { data, error } = await supabase
        .from('categories')
        .insert([categoryData])
        .select()
        .single()

      if (error) throw error

      setCategories(prev => [...prev, data])
      setCategoryFormOpen(false)
    } catch (error) {
      console.error('Error adding category:', error)
    } finally {
      setCategoryLoading(false)
    }
  }

  // Ingredient management
  const handleAddIngredient = async (ingredientData: { name_en: string, name_ar: string }) => {
    try {
      setIngredientLoading(true)
      const { data, error } = await supabase
        .from('ingredients')
        .insert([ingredientData])
        .select()
        .single()

      if (error) throw error

      setIngredients(prev => [...prev, data])
      setIngredientFormOpen(false)
    } catch (error) {
      console.error('Error adding ingredient:', error)
    } finally {
      setIngredientLoading(false)
    }
  }

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
        ingredients: item.ingredients_details?.map(i => i.ingredient.id) || [],
      })
    } else {
      setForm({
        id: null,
        name_en: '',
        name_ar: '',
        price: '',
        category_id: '',
        image_url: '',
        available: true,
        ingredients: [],
      })
    }
    setFormOpen(true)
  }


  const handleSubmit = async () => {
    const { name_en, name_ar, price, category_id } = form

    // Validate required fields
    if (!name_en || !name_ar || !price || !category_id) {
      toast.error(t('common.fillAllFields') || 'Please fill all required fields')
      return
    }

    if (!user) {
      toast.error(t('common.authError') || 'User not authenticated')
      return
    }

    const payload = {
      name_en: name_en.trim(),
      name_ar: name_ar.trim(),
      price: parseFloat(price),
      category_id,
      available: form.available,
      user_id: user.id,
      ...(form.image_url && { image_url: form.image_url }),
    }

    setFormLoading(true)

    try {
      let res, menuId: string

      await toast.promise(
        (async () => {
          if (form.id) {
            // Update existing menu item
            res = await supabase.from('menus').update(payload).eq('id', form.id).select('id')
            if (res.error) throw res.error
            menuId = form.id

            // Remove previous ingredient links
            await supabase.from('menu_ingredients').delete().eq('menu_id', form.id)
          } else {
            // Insert new item
            res = await supabase.from('menus').insert(payload).select('id')
            if (res.error) throw res.error
            menuId = res.data?.[0]?.id
          }

          // Re-insert selected ingredients
          if (menuId && form.ingredients.length > 0) {
            const inserts = form.ingredients.map(i => ({
              menu_id: menuId,
              ingredient_id: i,
            }))
            const insertRes = await supabase.from('menu_ingredients').insert(inserts)
            if (insertRes.error) throw insertRes.error
          }
        })(),
        {
          loading: form.id ? t('common.saving') : t('common.adding'),
          success: form.id ? t('common.updated') : t('common.added'),
          error: t('common.errorOccurred') || 'Something went wrong',
        }
      )

      setFormOpen(false)

      // Clear cache and refresh data
      sessionStorage.removeItem(`menuItems_${user.id}`)
      await fetchItems()
    } catch (error) {
      console.error('Error saving item:', error)
    } finally {
      setFormLoading(false)
    }
  }


  const handleDeleteItem = async (itemId: string) => {
    setItemToDelete(itemId)
    setDeleteModalOpen(true)
  }

  const confirmDelete = async () => {
    if (!itemToDelete) return

    try {
      setDeleteLoading(true)

      // 1. Fetch the image URL from the menu item
      const { data: menuData, error: fetchError } = await supabase
        .from('menus')
        .select('image_url')
        .eq('id', itemToDelete)
        .single()

      if (fetchError) throw fetchError

      const imageUrl: string | null = menuData?.image_url || null

      // 2. Extract the storage path from the public URL
      if (imageUrl?.includes('/storage/v1/object/public/menu-images/')) {
        const path = imageUrl.split('/storage/v1/object/public/menu-images/')[1]

        const { error: storageError } = await supabase
          .storage
          .from('menu-images')
          .remove([path])

        if (storageError) console.warn('Image delete failed:', storageError.message)
      }

      // 3. Now delete the menu row from DB
      const { error } = await supabase
        .from('menus')
        .delete()
        .eq('id', itemToDelete)

      if (error) {
        toast.error(t('common.errorOccurred') || 'Something went wrong')
        throw error
      }

      // Update UI
      setItems(prev => prev.filter(item => item.id !== itemToDelete))
      sessionStorage.removeItem(`menuItems_${user?.id}`)
      toast.success(t('common.deleted') || 'Item deleted successfully')

      setDeleteModalOpen(false)
      setItemToDelete(null)
    } catch (error) {
      console.error('Error deleting item:', error)
      fetchItems()
    } finally {
      setDeleteLoading(false)
    }
  }



  const handleDeleteSelected = async () => {
    if (selectedItems.length === 0) return

    try {
      setDeleteLoading(true)

      // 1. Fetch image URLs for all selected menu items
      const { data: menusToDelete, error: fetchError } = await supabase
        .from('menus')
        .select('id, image_url')
        .in('id', selectedItems)

      if (fetchError) throw fetchError

      // 2. Extract file paths from public image URLs
      const imagePaths = (menusToDelete || [])
        .map(menu => {
          const url = menu.image_url || ''
          if (url.includes('/storage/v1/object/public/menu-images/')) {
            return url.split('/storage/v1/object/public/menu-images/')[1]
          }
          return null
        })
        .filter(Boolean) as string[] // remove nulls

      // 3. Delete images from Supabase Storage
      if (imagePaths.length > 0) {
        const { error: removeError } = await supabase
          .storage
          .from('menu-images')
          .remove(imagePaths)

        if (removeError) {
          console.warn('Failed to remove some images:', removeError.message)
        }
      }

      // 4. Delete menu items from DB
      const { error } = await supabase
        .from('menus')
        .delete()
        .in('id', selectedItems)

      if (error) {
        toast.error(t('common.errorOccurred') || 'Something went wrong')
        throw error
      }

      // 5. Optimistic UI update
      setItems(prev => prev.filter(item => !selectedItems.includes(item.id)))
      sessionStorage.removeItem(`menuItems_${user?.id}`)

      toast.success(
        t('common.deletedSelected', { count: String(selectedItems.length) }) ||
        `${selectedItems.length} items deleted successfully`
      )

      setSelectedItems([])
      setDeleteAllModalOpen(false)
    } catch (error) {
      console.error('Error deleting selected items:', error)
      fetchItems()
    } finally {
      setDeleteLoading(false)
    }
  }




  const toggleItemSelection = (itemId: string) => {
    setSelectedItems(prev =>
      prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    )
  }

  const toggleSelectAll = () => {
    if (selectedItems.length === filteredItems.length) {
      setSelectedItems([])
    } else {
      setSelectedItems(filteredItems.map(item => item.id))
    }
  }

  // Filtering
  const filteredItems = items.filter(item => {
    const matchesCategory = selectedCategory === 'All' || item.category_id === selectedCategory
    const matchesSearch =
      item.name_en.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.name_ar || '').toLowerCase().includes(searchTerm.toLowerCase())
    return matchesCategory && matchesSearch
  })

  // Add timeout for loading state
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (loading) {
        console.warn('Loading timeout - forcing loading to false')
        setLoading(false)
      }
    }, 10000) // 10 second timeout

    return () => clearTimeout(timeout)
  }, [loading])

  if (loading && user) {
    return <LoadingSpinner />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-lg flex items-center justify-center">
              <Settings className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{t('admin.title')}</h2>
              <p className="text-slate-600 dark:text-slate-400">{t('admin.subtitle')}</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => setCategoryFormOpen(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center space-x-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>{t('common.addCategory')}</span>
            </button>

            <button
              onClick={() => setIngredientFormOpen(true)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg flex items-center space-x-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>{t('common.addIngredient')}</span>
            </button>

            <button
              onClick={() => openForm()}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center space-x-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>{t('common.addItem')}</span>
            </button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-3 w-full border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder={t('common.search')}
            />
          </div>

          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            className="px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="All">{t('menu.all')}</option>
            {categories.map(cat => (
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
                {selectedItems.length} {t('common.itemsSelected')}
              </span>
              <button
                onClick={() => setDeleteAllModalOpen(true)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center space-x-2 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>{t('common.deleteSelected')}</span>
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
              checked={selectedItems.length === filteredItems.length && filteredItems.length > 0}
              onChange={toggleSelectAll}
              className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500"
            />
            <span className="text-sm text-slate-600 dark:text-slate-400">
              {t('common.selectAll')} ({filteredItems.length})
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredItems.map(item => (
              <div key={item.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm hover:shadow-md transition-shadow p-4">
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
                        ${item.price.toFixed(2)}
                      </span>
                    </div>

                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                      {item.categories ? getLocalizedName(item.categories) : t('common.noCategory')}
                    </p>

                    <div className="flex items-center space-x-2 mb-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${item.available
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                        : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                        }`}>
                        {item.available ? t('common.available') : t('common.unavailable')}
                      </span>
                    </div>

                    {item.ingredients_details && item.ingredients_details.length > 0 && (
                      <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">
                        {t('common.ingredients')}: {item.ingredients_details.map(i => i.ingredient ? getLocalizedName(i.ingredient) : '').filter(Boolean).join(', ')}
                      </p>
                    )}

                    <div className="flex justify-between items-center">
                      <button
                        onClick={() => openForm(item)}
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm flex items-center space-x-1 transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                        <span>{t('common.edit')}</span>
                      </button>

                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-sm flex items-center space-x-1 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>{t('common.delete')}</span>
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
          title={t('common.noItems')}
          description={t('common.noItemsDescription')}
          action={
            <button
              onClick={() => openForm()}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center space-x-2 mx-auto transition-colors"
            >
              <Plus className="w-5 h-5" />
              <span>{t('common.addFirstItem')}</span>
            </button>
          }
        />
      )}

      {/* Menu Item Form Modal */}
      {formOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                {form.id ? t('common.editItem') : t('common.addItem')}
              </h3>
              <button onClick={() => setFormOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    {t('common.nameEn')} *
                  </label>
                  <input
                    value={form.name_en}
                    onChange={e => setForm(f => ({ ...f, name_en: e.target.value }))}
                    placeholder={t('common.nameEn')}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    {t('common.nameAr')} *
                  </label>
                  <input
                    value={form.name_ar}
                    onChange={e => setForm(f => ({ ...f, name_ar: e.target.value }))}
                    placeholder={t('common.nameAr')}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    {t('common.price')} *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.price}
                    onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    {t('common.category')} *
                  </label>

                  <select
                    value={form.category_id ?? ''} // fallback to empty string if null/undefined
                    onChange={e =>
                      setForm(f => ({
                        ...f,
                        category_id: e.target.value, // keep as string here
                      }))
                    }
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  >
                    <option value="">{t('common.selectCategory')}</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={String(cat.id)}>
                        {getLocalizedName(cat)}
                      </option>
                    ))}
                  </select>
                </div>


                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    {t('common.image')}
                  </label>
                  <ImageUploadField
                    value={form.image_url}
                    onChange={(url) => setForm(f => ({ ...f, image_url: url }))}
                  />
                </div>

                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="available"
                    checked={form.available}
                    onChange={e => setForm(f => ({ ...f, available: e.target.checked }))}
                    className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500"
                  />
                  <label htmlFor="available" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {t('common.available')}
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {t('common.ingredients')}
                </label>
                <div className="max-h-64 overflow-y-auto border border-slate-300 dark:border-slate-600 rounded-lg p-3 space-y-2">
                  {ingredients.map(ing => (
                    <label key={ing.id} className="flex items-center space-x-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.ingredients.includes(ing.id)}
                        onChange={() => {
                          setForm(f => ({
                            ...f,
                            ingredients: f.ingredients.includes(ing.id)
                              ? f.ingredients.filter(i => i !== ing.id)
                              : [...f.ingredients, ing.id]
                          }))
                        }}
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

            <div className="flex space-x-3 mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setFormOpen(false)}
                className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSubmit}
                disabled={formLoading}
                className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {formLoading ? t('common.saving') : (form.id ? t('common.updateItem') : t('common.addItem'))}
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
          setDeleteModalOpen(false)
          setItemToDelete(null)
        }}
        onConfirm={confirmDelete}
        title={t('common.deleteItem')}
        message={t('common.deleteItemConfirm')}
        loading={deleteLoading}
      />

      {/* Delete All Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={deleteAllModalOpen}
        onClose={() => setDeleteAllModalOpen(false)}
        onConfirm={handleDeleteSelected}
        title={t('common.deleteSelected')}
        message={t('common.deleteSelectedConfirm', { count: selectedItems.length.toString() })}
        loading={deleteLoading}
      />
    </div>
  )
}

export default DigitalMenu