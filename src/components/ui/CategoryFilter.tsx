import React from 'react';
import { useLanguage } from '../../contexts/LanguageContext';

interface Category {
  id: string;
  name_en: string;
  name_ar: string;
}

interface Props {
  categories: Category[];
  selectedCategory: string;
  onSelectCategory: (categoryId: string) => void;
}



const CategoryFilter: React.FC<Props> = ({
  categories,
  selectedCategory,
  onSelectCategory,
}) => {
  const { t, isRTL } = useLanguage();

  return (
    <div className="relative overflow-x-auto scrollbar-hide">
      <div className={`flex space-x-2 ${isRTL ? 'space-x-reverse' : ''} pb-2`}>
        {/* All button */}
        <button
          onClick={() => onSelectCategory('All')}
          className={`px-4 py-2 rounded-xl whitespace-nowrap transition-all duration-200 ${selectedCategory === 'All'
              ? 'bg-gradient-to-r from-emerald-600 to-emerald-700 text-white shadow-lg'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
            }`}
        >
          {t('menu.all')}
        </button>

        {/* Actual categories */}
        {categories.map((category) => {
          const label = isRTL ? category.name_ar : category.name_en;
          return (
            <button
              key={category.id}
              onClick={() => onSelectCategory(category.id)} // use ID!
              className={`px-4 py-2 rounded-xl whitespace-nowrap transition-all duration-200 ${selectedCategory === category.id
                ? 'bg-gradient-to-r from-emerald-600 to-emerald-700 text-white shadow-lg'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
            >
              {label}
            </button>
          );
        })}


      </div>

      {/* Optional scroll fade */}
      <div
        className="pointer-events-none absolute top-0 bottom-0 w-8 z-10 bg-gradient-to-r from-transparent to-white dark:to-slate-800"
        style={{ [isRTL ? 'left' : 'right']: 0 }}
      />
    </div>
  );
};

export default CategoryFilter;