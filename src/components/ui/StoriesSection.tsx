import React, { useRef, useEffect } from 'react';
import { ChefHat, Clock, Sparkles, Plus } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { MenuBadgeStack } from './MenuBadge';

// Import MenuItem from the parent component
interface Ingredient {
    id: string;
    name_en: string;
    name_ar: string;
}

interface MenuItem {
    id: string;
    name_en: string;
    name_ar?: string;
    description_en?: string;
    description_ar?: string;
    price: number;
    image_url?: string;
    available?: boolean;
    created_at?: string;
    category_id?: string;
    ingredients_details?: { ingredient: Ingredient }[];
    categories?: { id: string; name_en: string; name_ar: string };
    tags?: string[];
    is_featured?: boolean;
    has_modifiers?: boolean;
}

interface StoriesSectionProps {
    featuredItems: MenuItem[];
    onAddToCart: (item: MenuItem) => void;
}

const StoriesSection: React.FC<StoriesSectionProps> = ({ featuredItems, onAddToCart }) => {
    const { t, isRTL } = useLanguage();
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const scrollContainer = scrollRef.current;
        if (!scrollContainer || featuredItems.length <= 3) return;

        let scrollPos = 0;
        const scrollSpeed = 0.5;
        let animationId: number;

        const autoScroll = () => {
            if (!scrollContainer) return;

            scrollPos += scrollSpeed;
            const maxScroll = scrollContainer.scrollWidth - scrollContainer.clientWidth;

            if (scrollPos >= maxScroll) {
                scrollPos = 0;
            }

            scrollContainer.scrollLeft = scrollPos;
            animationId = requestAnimationFrame(autoScroll);
        };

        // Start auto-scroll after 2 seconds
        const timeoutId = setTimeout(() => {
            animationId = requestAnimationFrame(autoScroll);
        }, 2000);

        // Pause on hover
        const handleMouseEnter = () => {
            cancelAnimationFrame(animationId);
        };

        const handleMouseLeave = () => {
            animationId = requestAnimationFrame(autoScroll);
        };

        scrollContainer.addEventListener('mouseenter', handleMouseEnter);
        scrollContainer.addEventListener('mouseleave', handleMouseLeave);

        return () => {
            clearTimeout(timeoutId);
            cancelAnimationFrame(animationId);
            scrollContainer?.removeEventListener('mouseenter', handleMouseEnter);
            scrollContainer?.removeEventListener('mouseleave', handleMouseLeave);
        };
    }, [featuredItems.length]);

    if (!featuredItems || featuredItems.length === 0) return null;

    return (
        <div className="mb-6 animate-slide-up">
            {/* Section Header */}
            <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center shadow-md">
                        <ChefHat className="w-5 h-5 text-white" />
                    </div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                        {isRTL ? 'مميزات اليوم' : "Today's Specials"}
                    </h2>
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                    <Clock className="w-3 h-3" />
                    <span>{isRTL ? 'عرض محدود' : 'Limited Time'}</span>
                </div>
            </div>

            {/* Horizontal Scrolling Stories */}
            <div
                ref={scrollRef}
                className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
                {featuredItems.map((item, idx) => (
                    <StoryCard
                        key={item.id}
                        item={item}
                        index={idx}
                        onAddToCart={onAddToCart}
                        isRTL={isRTL}
                    />
                ))}
            </div>
        </div>
    );
};

interface StoryCardProps {
    item: MenuItem;
    index: number;
    onAddToCart: (item: MenuItem) => void;
    isRTL: boolean;
}

const StoryCard: React.FC<StoryCardProps> = ({ item, index, onAddToCart, isRTL }) => {
    const name = isRTL ? item.name_ar || item.name_en : item.name_en;
    const desc = isRTL ? item.description_ar || item.description_en : item.description_en;

    return (
        <div
            className="relative flex-shrink-0 w-32 h-48 snap-start group cursor-pointer"
            onClick={() => onAddToCart(item)}
            style={{ animationDelay: `${index * 100}ms` }}
        >
            {/* Story Card */}
            <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-xl ring-2 ring-amber-500/20 hover:ring-amber-500/50 transition-all duration-300 group-hover:scale-105">
                {/* Background Image */}
                <img
                    src={item.image_url || '/images/placeholder.png'}
                    alt={name}
                    className="w-full h-full object-cover"
                />

                {/* Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

                {/* Badges */}
                {item.tags && item.tags.length > 0 && (
                    <div className="absolute top-2 left-2 right-2">
                        <MenuBadgeStack tags={item.tags as string[]} maxVisible={1} />
                    </div>
                )}

                {/* Content */}
                <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                    <h3 className="font-bold text-sm mb-1 line-clamp-2">{name}</h3>
                    {desc && (
                        <p className="text-xs text-white/80 line-clamp-1 mb-1">{desc}</p>
                    )}
                    <div className="flex items-center justify-between">
                        <span className="font-bold text-amber-400">
                            {item.price} {isRTL ? 'ر.ق' : 'QAR'}
                        </span>
                        <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Plus className="w-4 h-4 text-amber-600" />
                        </div>
                    </div>
                </div>

                {/* "NEW" Sparkle Animation */}
                {item.tags?.includes?.('new') && (
                    <div className="absolute top-2 right-2">
                        <Sparkles className="w-5 h-5 text-yellow-300 animate-pulse" />
                    </div>
                )}
            </div>

            {/* Active Ring (Instagram-style) */}
            <div className="absolute inset-0 rounded-2xl ring-2 ring-gradient-to-r from-amber-500 via-orange-500 to-pink-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
        </div>
    );
};

export default StoriesSection;
