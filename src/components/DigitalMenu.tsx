// AdminDigitalMenu component with DigitalMenu export
'use client'

import React, { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, X, Search, Minus, Check, Settings, Edit } from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import { menuService } from '../services/menuService'
import { useAuth } from '../hooks/useAuth'
import { useLanguage } from '../contexts/LanguageContext'
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast'
import Modal from 'react-modal'

Modal.setAppElement('body')

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
  category?: Category | null
  ingredients_details?: {
    ingredient: Ingredient
  }[]
}

const DigitalMenu: React.FC = () => {
  const { t } = useLanguage();

  const [items, setItems] = useState<MenuItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')

  const [formOpen, setFormOpen] = useState(false)
  const [formLoading, setFormLoading] = useState(false)
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
  const [imageFile, setImageFile] = useState<File | null>(null)

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/*': [] },
    maxFiles: 1,
    onDrop: (accepted) => {
      if (accepted.length > 0) setImageFile(accepted[0])
    },
  })

  useEffect(() => {
    fetchItems()
    fetchCategories()
    fetchIngredients()
  }, [])

  async function fetchItems() {
    const { data: userData } = await supabase.auth.getUser()
    const adminId = userData?.user?.id
    if (!adminId) return toast.error('Not authenticated')

    const { data, error } = await supabase
      .from('menus')
      .select(
        `*, category:categories(name_en, name_ar), ingredients_details:menu_ingredients(ingredient:ingredients(name_en, name_ar))`
      )
      .eq('user_id', adminId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) toast.error('Failed to load items')
    else setItems(data as MenuItem[])
  }

  async function fetchCategories() {
    const { data, error } = await supabase.from('categories').select('*').order('name_en')
    if (!error) setCategories(data || [])
  }

  async function fetchIngredients() {
    const { data, error } = await supabase.from('ingredients').select('*').order('name_en')
    if (!error) setIngredients(data || [])
  }

  function openForm(item?: MenuItem) {
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
      setForm({ id: null, name_en: '', name_ar: '', price: '', category_id: '', image_url: '', available: true, ingredients: [] })
    }
    setImageFile(null)
    setFormOpen(true)
  }

  async function handleSubmit() {
    const { name_en, name_ar, price, category_id } = form
    if (!name_en || !name_ar || !price || !category_id) return toast.error(t('adminMenu.fillRequired'))

    setFormLoading(true)
    let imageUrl = form.image_url
    if (imageFile) {
      const fileName = `${Date.now()}-${imageFile.name}`
      const { error: uploadError } = await supabase.storage.from('menu-images').upload(fileName, imageFile)
      if (uploadError) {
        toast.error('Upload failed')
        return setFormLoading(false)
      }
      const { data: urlData } = supabase.storage.from('menu-images').getPublicUrl(fileName)
      imageUrl = urlData.publicUrl
    }

    const { data: userData } = await supabase.auth.getUser()
    const adminId = userData?.user?.id
    if (!adminId) return toast.error('Auth failed')

    const payload = {
      name_en: name_en.trim(),
      name_ar: name_ar.trim(),
      price: parseFloat(price),
      category_id: category_id,
      image_url: imageUrl,
      available: form.available,
      user_id: adminId,
    }

    let res, menuId
    if (form.id) {
      res = await supabase.from('menus').update(payload).eq('id', form.id).select('id')
      menuId = form.id
      await supabase.from('menu_ingredients').delete().eq('menu_id', form.id)
    } else {
      res = await supabase.from('menus').insert(payload).select('id')
      menuId = res.data?.[0]?.id
    }

    if (res.error) toast.error(res.error.message)

    if (menuId && form.ingredients.length > 0) {
      const inserts = form.ingredients.map(i => ({ menu_id: menuId, ingredient_id: i }))
      await supabase.from('menu_ingredients').insert(inserts)
    }

    toast.success(form.id ? t('adminMenu.updated') : t('adminMenu.added'))
    setFormOpen(false)
    fetchItems()
    setFormLoading(false)
  }

  const filteredItems = items.filter(item => {
    const matchesCategory = selectedCategory === 'All' || item.category?.name_en === selectedCategory || item.category?.name_ar === selectedCategory
    const matchesSearch = item.name_en.toLowerCase().includes(searchTerm.toLowerCase()) || item.name_ar.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesCategory && matchesSearch
  })

  return (
    <main className="max-w-6xl mx-auto p-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{t('admin.title')}</h1>
        <button
          onClick={() => openForm()}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <Plus size={16} /> {t('admin.addItem')}
        </button>
      </div>
  
      <div className="flex gap-4 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-10 pr-4 py-3 w-full border border-slate-300 rounded-lg"
            placeholder={t('common.search')}
          />
        </div>
        <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} className="p-3 border rounded-lg">
          <option value="All">{t('common.allCategories')}</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.name_en}>{t(`category.${cat.id}`) || cat.name_en}</option>
          ))}
        </select>
      </div>
  
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {items.map(item => (
          <div key={item.id} className="bg-white border rounded-xl shadow p-4">
            {item.image_url && <img src={item.image_url} className="w-full h-40 object-cover rounded mb-2" />}
            <div className="flex justify-between items-center mb-1">
              <h3 className="text-lg font-bold">{item.name_en}</h3>
              <span className="text-emerald-600 font-bold">${item.price.toFixed(2)}</span>
            </div>
            <p className="text-sm text-gray-500 mb-2">{item.category?.name_en}</p>
            <p className="text-xs text-gray-400 mb-2">
              {t('admin.menuManagement')}: {item.ingredients_details?.map(i => i.ingredient.name_en).join(', ') || '—'}
            </p>
            <div className="flex justify-between items-center mt-2">
              <button onClick={() => openForm(item)} className="text-blue-600 hover:underline text-sm flex items-center gap-1">
                <Pencil size={14} /> {t('common.edit')}
              </button>
              <button onClick={() => toast.error('Delete logic coming')} className="text-red-500 text-sm flex items-center gap-1">
                <Trash2 size={14} /> {t('common.delete')}
              </button>
            </div>
          </div>
        ))}
      </div>
  
      {formOpen && (
        <Modal
          isOpen={formOpen}
          onRequestClose={() => setFormOpen(false)}
          className="bg-white p-6 rounded shadow max-w-xl mx-auto mt-20"
          overlayClassName="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center"
        >
          <h2 className="text-xl font-bold mb-4">{form.id ? t('admin.editItem') : t('admin.addItem')}</h2>
  
          <div className="grid grid-cols-2 gap-4 mb-4">
            <input
              value={form.name_en}
              onChange={e => setForm(f => ({ ...f, name_en: e.target.value }))}
              placeholder={t('common.nameEn')}
              className="p-2 border rounded"
            />
            <input
              value={form.name_ar}
              onChange={e => setForm(f => ({ ...f, name_ar: e.target.value }))}
              placeholder={t('common.nameAr')}
              className="p-2 border rounded"
            />
          </div>
  
          <input
            value={form.price}
            onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
            placeholder={t('common.price')}
            className="p-2 border rounded w-full mb-4"
          />
  
          <select
            value={form.category_id}
            onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
            className="p-2 border rounded w-full mb-4"
          >
            <option value="">{t('common.selectCategory')}</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name_en}</option>
            ))}
          </select>
  
          <div className="flex flex-wrap gap-2 mb-4">
            {ingredients.map(ing => (
              <label key={ing.id} className="flex items-center gap-1 text-sm">
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
                />
                {ing.name_en}
              </label>
            ))}
          </div>
  
          <div {...getRootProps({ className: 'border-dashed border-2 p-4 rounded mb-4 text-center cursor-pointer' })}>
            <input {...getInputProps()} />
            {isDragActive ? <p>{t('admin.dropHere')}</p> : <p>{imageFile ? imageFile.name : t('admin.dragDrop')}</p>}
          </div>
  
          <div className="flex gap-2">
            <button onClick={handleSubmit} disabled={formLoading} className="bg-emerald-600 text-white px-4 py-2 rounded">
              {form.id ? t('admin.updateItem') : t('admin.addItem')}
            </button>
            <button onClick={() => setFormOpen(false)} className="bg-gray-400 text-white px-4 py-2 rounded">
              {t('common.cancel')}
            </button>
          </div>
        </Modal>
      )}
    </main>
  )
}

export default DigitalMenu;