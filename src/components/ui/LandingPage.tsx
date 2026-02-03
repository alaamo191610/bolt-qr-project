import React from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Utensils, ShoppingBag } from 'lucide-react';

interface LandingPageProps {
    onSelect: (type: 'dine_in' | 'take_away') => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onSelect }) => {
    const { t, isRTL } = useLanguage();

    return (
        <div className="fixed inset-0 z-50 bg-white dark:bg-slate-900 flex flex-col items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="w-full max-w-md space-y-12">
                <div className="text-center space-y-4">
                    <div className="text-6xl mb-4">👋</div>
                    <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
                        {t('landing.welcome')}
                    </h1>
                    <p className="text-xl text-slate-500 dark:text-slate-400">
                        {t('landing.selectDiningMode')}
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-6">
                    <button
                        onClick={() => onSelect('dine_in')}
                        className="group relative overflow-hidden bg-white dark:bg-slate-800 border-2 border-emerald-100 dark:border-emerald-900/50 hover:border-emerald-500 dark:hover:border-emerald-500 rounded-3xl p-8 text-left transition-all duration-300 shadow-sm hover:shadow-xl hover:-translate-y-1"
                    >
                        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Utensils className={`w-32 h-32 text-emerald-500 ${isRTL ? 'transform scale-x-[-1]' : ''}`} />
                        </div>
                        <div className="relative z-10">
                            <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center mb-6 text-3xl">
                                🍽️
                            </div>
                            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                                {t('landing.dineIn')}
                            </h3>
                        </div>
                    </button>

                    <button
                        onClick={() => onSelect('take_away')}
                        className="group relative overflow-hidden bg-white dark:bg-slate-800 border-2 border-blue-100 dark:border-blue-900/50 hover:border-blue-500 dark:hover:border-blue-500 rounded-3xl p-8 text-left transition-all duration-300 shadow-sm hover:shadow-xl hover:-translate-y-1"
                    >
                        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                            <ShoppingBag className={`w-32 h-32 text-blue-500 ${isRTL ? 'transform scale-x-[-1]' : ''}`} />
                        </div>
                        <div className="relative z-10">
                            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center mb-6 text-3xl">
                                🥡
                            </div>
                            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                                {t('landing.takeAway')}
                            </h3>
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );
};
