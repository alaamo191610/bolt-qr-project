import React from 'react';
import { Plus, Minus } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

interface Ingredient {
  id: string
  name_en: string
  name_ar: string
}

export interface MenuItem {
  id: string;
  name_en: string;
  name_ar?: string;
  price: number;
  image_url?: string;
  available?: boolean;
  created_at?: string;
  category_id?: string;
  ingredients_details?: {
    ingredient: Ingredient;
  }[];
  categories?: {
    id: string;
    name_en: string;
    name_ar: string;
  };
}

interface Props {
  item: MenuItem;
  quantity: number;
  onAdd: (item: MenuItem) => void;
  onRemove: (id: string) => void;
}

const MenuItemCard: React.FC<Props> = ({ item, quantity, onAdd, onRemove }) => {
  const { t, isRTL } = useLanguage();
  console.log('Ingredients:', item.ingredients_details);
  console.log('Full item:', item);
  const ingredients = item.ingredients_details ?? [];
  const hasIngredients = ingredients.length > 0;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-md border border-slate-200 dark:border-slate-700 overflow-hidden hover:shadow-lg hover:scale-[1.01] transition-all duration-200 card-hover">
      <div className="flex">
        {/* Image */}
        <img
          src={item.image_url || 'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=400'}
          alt={item.name_en}
          className="w-24 h-24 sm:w-32 sm:h-32 object-cover flex-shrink-0 rounded-l-2xl"
        />

        {/* Info */}
        <div className="flex-1 p-4">
          <div className="flex justify-between items-start mb-2">
            <div className="flex-1 pr-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
                {isRTL ? item.name_ar || item.name_en : item.name_en}
              </h3>
              {hasIngredients && (
                <div className="flex flex-wrap gap-1 mb-2 max-h-20 overflow-visible">
                  {ingredients.map(({ ingredient }) => (
                    <span
                      key={ingredient.id}
                      className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full"
                    >
                      {isRTL ? ingredient.name_ar : ingredient.name_en}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                  ${item.price}
                </span>
                {item.categories && (
                  <span className="...">
                    {isRTL ? item.categories.name_ar : item.categories.name_en}
                  </span>
                )}
              </div>
            </div>

            {/* Cart Controls */}
            <div className="flex-shrink-0">
              {quantity > 0 ? (
                <div className={`flex items-center space-x-2 ${isRTL ? 'space-x-reverse' : ''}`}>
                  <button
                    onClick={() => onRemove(item.id)}
                    className="w-8 h-8 bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-300 rounded-full flex items-center justify-center transition-colors duration-200"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="font-bold text-lg min-w-[2rem] text-center text-slate-900 dark:text-white">
                    {quantity}
                  </span>
                  <button
                    onClick={() => onAdd(item)}
                    className="w-8 h-8 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white rounded-full flex items-center justify-center transition-all duration-200 shadow-lg"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => onAdd(item)}
                  className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white rounded-xl transition-all duration-200 font-medium text-sm shadow-lg"
                >
                  {t('menu.addToCart')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MenuItemCard;