import React from 'react';
import { Search } from 'lucide-react';
import MenuItemCard, { MenuItem } from './MenuItemCard';
import { useLanguage } from '../../contexts/LanguageContext';

interface Props {
  items: MenuItem[];
  quantityMap: Record<string, number>; // itemId -> quantity
  onAdd: (item: MenuItem) => void;
  onRemove: (itemId: string) => void;
}

const MenuGrid: React.FC<Props> = ({ items, quantityMap, onAdd, onRemove }) => {
  const { t, isRTL } = useLanguage();

  return (
    <div className="space-y-4">
      {items.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8 text-slate-400 dark:text-slate-500" />
          </div>
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">{t('menu.noItemsFound')}</h3>
          <p className="text-slate-600 dark:text-slate-400">{t('menu.noItemsDescription')}</p>
        </div>
      ) : (
        items.map((item) => (
          <MenuItemCard
            key={item.id}
            item={item}
            quantity={quantityMap[item.id] || 0}
            onAdd={onAdd}
            onRemove={onRemove}
          />
        ))
      )}
    </div>
  );
};

export default MenuGrid;