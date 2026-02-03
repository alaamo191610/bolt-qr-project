import React, { useState } from 'react';
import { Database } from 'lucide-react';
import { menuService } from '../../services/menuService';
import { api } from '../../services/api';
import { useLanguage } from '../../contexts/LanguageContext';
import toast from 'react-hot-toast';

interface SeedDataButtonProps {
    userId?: string;
    onComplete?: () => void;
}

const dummyCategories = [
    { name_en: 'Appetizers', name_ar: 'مقبلات' },
    { name_en: 'Main Course', name_ar: 'الطبق الرئيسي' },
    { name_en: 'Desserts', name_ar: 'حلويات' },
    { name_en: 'Drinks', name_ar: 'مشروبات' },
];

const dummyIngredients = [
    { name_en: 'Tomato', name_ar: 'طماطم' },
    { name_en: 'Lettuce', name_ar: 'خس' },
    { name_en: 'Cheese', name_ar: 'جبنة' },
    { name_en: 'Onion', name_ar: 'بصل' },
    { name_en: 'Garlic', name_ar: 'ثوم' },
    { name_en: 'Chicken', name_ar: 'دجاج' },
    { name_en: 'Beef', name_ar: 'لحم بقر' },
    { name_en: 'Mushroom', name_ar: 'فطر' },
    { name_en: 'Rice', name_ar: 'أرز' },
    { name_en: 'Potato', name_ar: 'بطاطا' },
    { name_en: 'Olive', name_ar: 'زيتون' },
    { name_en: 'Olive Oil', name_ar: 'زيت زيتون' },
];

const dummyItems = [
    // Appetizers
    {
        name_en: 'Hummus & Pita',
        name_ar: 'حمص وخبز',
        price: 15,
        category_en: 'Appetizers',
        description_en: 'Creamy chickpea dip with olive oil and spices',
        description_ar: 'حمص كريمي مع زيت زيتون وتوابل',
        image_url: 'https://images.unsplash.com/photo-1577906096429-f7bad7da526c?auto=format&fit=crop&q=80&w=800',
        ingredients: ['Garlic', 'Olive Oil'],
        modifiers: [
            {
                name_en: 'Extra Bread',
                name_ar: 'خبز إضافي',
                selection_type: 'single',
                max_select: 1,
                options: [
                    { name_en: '1 Piece', price_delta: 2 },
                    { name_en: '2 Pieces', price_delta: 3 },
                    { name_en: 'Basket', price_delta: 5 },
                ]
            }
        ]
    },
    {
        name_en: 'Greek Salad',
        name_ar: 'سلطة يونانية',
        price: 25,
        category_en: 'Appetizers',
        description_en: 'Fresh vegetables with feta cheese and olives',
        description_ar: 'خضار طازجة مع جبنة فيتا وزيتون',
        image_url: 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&q=80&w=800',
        ingredients: ['Tomato', 'Lettuce', 'Cheese', 'Onion', 'Olive'],
        modifiers: []
    },
    // Main Course
    {
        name_en: 'Grilled Chicken',
        name_ar: 'دجاج مشوي',
        price: 45,
        category_en: 'Main Course',
        description_en: 'Herb-marinated chicken breast with sides',
        description_ar: 'صدر دجاج متبل بالأعشاب مع مقبلات',
        image_url: 'https://images.unsplash.com/photo-1532550907401-a500c9a57435?auto=format&fit=crop&q=80&w=800',
        ingredients: ['Chicken', 'Garlic', 'Rice'],
        modifiers: [
            {
                name_en: 'Side Dish',
                name_ar: 'طبق جانبي',
                selection_type: 'single',
                required: true,
                options: [
                    { name_en: 'Fries', price_delta: 0 },
                    { name_en: 'Rice', price_delta: 0 },
                    { name_en: 'Salad', price_delta: 5 },
                ]
            }
        ]
    },
    {
        name_en: 'Beef Burger',
        name_ar: 'برجر لحم',
        price: 55,
        category_en: 'Main Course',
        description_en: 'Juicy beef patty with cheese and fresh veggies',
        description_ar: 'شريحة لحم عصارية مع جبنة وخضار طازجة',
        image_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&q=80&w=800',
        ingredients: ['Beef', 'Cheese', 'Lettuce', 'Tomato', 'Onion'],
        modifiers: [
            {
                name_en: 'Cooking Level',
                name_ar: 'درجة الاستواء',
                selection_type: 'single',
                required: true,
                options: [
                    { name_en: 'Well Done', price_delta: 0 },
                    { name_en: 'Medium', price_delta: 0 },
                    { name_en: 'Rare', price_delta: 0 },
                ]
            },
            {
                name_en: 'Add-ons',
                name_ar: 'إضافات',
                selection_type: 'multi',
                max_select: 3,
                options: [
                    { name_en: 'Extra Cheese', price_delta: 5 },
                    { name_en: 'Mushroom Sauce', price_delta: 7 },
                    { name_en: 'Bacon', price_delta: 10 },
                ]
            }
        ]
    },
    // Desserts
    {
        name_en: 'Chocolate Cake',
        name_ar: 'كيكة الشوكولاتة',
        price: 30,
        category_en: 'Desserts',
        description_en: 'Rich tasty chocolate layer cake',
        description_ar: 'كيكة شوكولاتة غنية ولذيذة',
        image_url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&q=80&w=800',
        ingredients: [],
        modifiers: []
    },
    // Drinks
    {
        name_en: 'Fresh Orange Juice',
        name_ar: 'عصير برتقال طازج',
        price: 20,
        category_en: 'Drinks',
        description_en: 'Squeezed daily from fresh oranges',
        description_ar: 'معصور يومياً من برتقال طازج',
        image_url: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&q=80&w=800',
        ingredients: [],
        modifiers: [
            {
                name_en: 'Size',
                name_ar: 'الحجم',
                selection_type: 'single',
                required: true,
                options: [
                    { name_en: 'Small', price_delta: 0 },
                    { name_en: 'Medium', price_delta: 5 },
                    { name_en: 'Large', price_delta: 10 },
                ]
            }
        ]
    }
];

export const SeedDataButton: React.FC<SeedDataButtonProps> = ({ userId, onComplete }) => {
    const [loading, setLoading] = useState(false);
    const { t } = useLanguage();

    const handleSeed = async () => {
        if (!userId) {
            toast.error('User ID is required');
            return;
        }

        if (!window.confirm('This will seed Categories, Ingredients, Items, and Modifiers. Continue?')) {
            return;
        }

        setLoading(true);
        const toastId = toast.loading('Seeding data...');

        try {
            // 1. Fetch or Create Categories
            const existingCategories = await menuService.getCategories();
            const categoryMap = new Map<string, string>(); // Name -> ID
            existingCategories?.forEach((c: any) => categoryMap.set(c.name_en, c.id));

            for (const cat of dummyCategories) {
                if (!categoryMap.has(cat.name_en)) {
                    try {
                        const newCat = await menuService.addCategory(cat);
                        if (newCat?.id) categoryMap.set(cat.name_en, newCat.id);
                    } catch (e) {
                        console.error(`Failed cat: ${cat.name_en}`, e);
                    }
                }
            }

            // 2. Fetch or Create Ingredients
            const existingIngredients = await menuService.getIngredients();
            const ingredientMap = new Map<string, string>(); // Name -> ID
            existingIngredients?.forEach((i: any) => ingredientMap.set(i.name_en, i.id));

            for (const ing of dummyIngredients) {
                if (!ingredientMap.has(ing.name_en)) {
                    try {
                        const newIng = await menuService.addIngredient(ing);
                        if (newIng?.id) ingredientMap.set(ing.name_en, newIng.id);
                    } catch (e) {
                        console.error(`Failed ing: ${ing.name_en}`, e);
                    }
                }
            }

            // 3. Add Items with Relations
            let addedCount = 0;
            for (const item of dummyItems) {
                const catId = categoryMap.get(item.category_en);
                if (catId) {
                    try {
                        // A. Create Item
                        const createdItem = await menuService.addMenuItem({
                            name_en: item.name_en,
                            name_ar: item.name_ar,
                            price: item.price,
                            category_id: catId,
                            user_id: userId,
                            available: true,
                            image_url: item.image_url,
                        });

                        if (createdItem && createdItem.id) {
                            addedCount++;
                            const menuId = createdItem.id;

                            // B. Link Ingredients
                            if (item.ingredients && item.ingredients.length > 0) {
                                const ingPayload = item.ingredients
                                    .map(name => {
                                        const iId = ingredientMap.get(name);
                                        if (!iId) return null;
                                        return {
                                            ingredient_id: iId,
                                            removable: true,
                                            extra_available: true,
                                            max_extra: 2,
                                            extra_price_override: null
                                        };
                                    })
                                    .filter(Boolean);

                                if (ingPayload.length > 0) {
                                    await api.post(`/menus/${menuId}/ingredients`, { ingredients: ingPayload });
                                }
                            }

                            // C. Create Modifier Groups
                            if (item.modifiers && item.modifiers.length > 0) {
                                const groupsPayload = item.modifiers.map(mod => ({
                                    name_en: mod.name_en,
                                    name_ar: mod.name_ar,
                                    selection_type: mod.selection_type,
                                    max_select: mod.max_select || 1,
                                    required: mod.required || false,
                                    options: mod.options
                                }));

                                await api.post(`/menus/${menuId}/modifiers`, { groups: groupsPayload });
                            }
                        }

                    } catch (e) {
                        console.error(`Failed to add item ${item.name_en}`, e);
                    }
                }
            }

            toast.success(`Seeded ${addedCount} items with deep data!`, { id: toastId });
            if (onComplete) onComplete();
        } catch (error) {
            console.error('Seeding error:', error);
            toast.error('Failed to seed data', { id: toastId });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center space-x-2">
            <button
                onClick={handleSeed}
                disabled={loading}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg flex items-center space-x-2 transition-colors border border-slate-300 dark:border-slate-600"
                title="Seed Advanced Data"
            >
                <Database className="w-4 h-4" />
                <span className="hidden lg:inline">Seed Data</span>
            </button>

            <button
                onClick={async () => {
                    if (window.confirm('⚠️ WARNING: This will PERMANENTLY DELETE ALL your menu items. This cannot be undone.\n\nAre you sure?')) {
                        setLoading(true);
                        const toastId = toast.loading('Clearing all data...');
                        try {
                            await menuService.clearAllMenuData();
                            toast.success('All menu items cleared', { id: toastId });
                            if (onComplete) onComplete();
                        } catch (e) {
                            console.error(e);
                            toast.error('Failed to clear data', { id: toastId });
                        } finally {
                            setLoading(false);
                        }
                    }
                }}
                disabled={loading}
                className="px-4 py-2 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 rounded-lg flex items-center space-x-2 transition-colors border border-red-200 dark:border-red-800"
                title="Clear All Menu Data"
            >
                <span className="font-bold">×</span>
                <span className="hidden lg:inline">Clear Data</span>
            </button>
        </div>
    );
};
