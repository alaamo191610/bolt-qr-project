import React from 'react';
import { Flame, Leaf, Star, Sparkles, TrendingUp } from 'lucide-react';

type BadgeType = 'spicy' | 'vegan' | 'best_seller' | 'new' | 'popular';

interface MenuBadgeProps {
    type: BadgeType;
    className?: string;
}

const badgeConfig: Record<BadgeType, {
    label: string;
    labelAr: string;
    icon: React.ComponentType<{ className?: string }>;
    bgClass: string;
    textClass: string;
    iconClass: string;
}> = {
    spicy: {
        label: 'Spicy',
        labelAr: 'حار',
        icon: Flame,
        bgClass: 'bg-red-500/90',
        textClass: 'text-white',
        iconClass: 'text-white',
    },
    vegan: {
        label: 'Vegan',
        labelAr: 'نباتي',
        icon: Leaf,
        bgClass: 'bg-emerald-500/90',
        textClass: 'text-white',
        iconClass: 'text-white',
    },
    best_seller: {
        label: 'Best Seller',
        labelAr: 'الأكثر مبيعاً',
        icon: Star,
        bgClass: 'bg-amber-500/90',
        textClass: 'text-white',
        iconClass: 'text-white',
    },
    new: {
        label: 'New',
        labelAr: 'جديد',
        icon: Sparkles,
        bgClass: 'bg-blue-500/90',
        textClass: 'text-white',
        iconClass: 'text-white',
    },
    popular: {
        label: 'Popular',
        labelAr: 'مشهور',
        icon: TrendingUp,
        bgClass: 'bg-orange-500/90',
        textClass: 'text-white',
        iconClass: 'text-white',
    },
};

export const MenuBadge: React.FC<MenuBadgeProps> = ({ type, className = '' }) => {
    const config = badgeConfig[type];
    if (!config) return null;

    const Icon = config.icon;

    return (
        <div
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full backdrop-blur-sm shadow-lg ${config.bgClass} ${config.textClass} ${className}`}
            title={config.label}
        >
            <Icon className={`w-3 h-3 ${config.iconClass}`} />
            <span className="text-xs font-semibold">{config.label}</span>
        </div>
    );
};

interface MenuBadgeStackProps {
    tags: string[];
    maxVisible?: number;
    className?: string;
}

export const MenuBadgeStack: React.FC<MenuBadgeStackProps> = ({
    tags,
    maxVisible = 2,
    className = ''
}) => {
    if (!tags || tags.length === 0) return null;

    const visibleTags = tags.slice(0, maxVisible);
    const remainingCount = Math.max(0, tags.length - maxVisible);

    return (
        <div className={`flex flex-wrap gap-1.5 ${className}`}>
            {visibleTags.map((tag, idx) => (
                <MenuBadge key={idx} type={tag as BadgeType} />
            ))}
            {remainingCount > 0 && (
                <div className="inline-flex items-center px-2 py-1 rounded-full bg-slate-500/90 text-white text-xs font-semibold">
                    +{remainingCount}
                </div>
            )}
        </div>
    );
};

export default MenuBadge;
