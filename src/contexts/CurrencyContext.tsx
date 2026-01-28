import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { adminService } from '../services/adminService';
import { DEFAULT_PRICING, type PricingPrefs, type CurrencyCode, CURRENCIES } from '../pricing/types';
import { formatCurrency, roundAmount } from '../pricing/money';
import { useAuth } from '../providers/AuthProvider';

interface CurrencyContextType {
    prefs: PricingPrefs;
    loading: boolean;
    formatPrice: (amount: number, useSymbol?: boolean) => string;
    refreshPrefs: () => Promise<void>;
    updatePrefs: (newPrefs: PricingPrefs) => void;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export const CurrencyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const [prefs, setPrefs] = useState<PricingPrefs>(DEFAULT_PRICING);
    const [loading, setLoading] = useState(true);

    const fetchPrefs = useCallback(async () => {
        if (!user) {
            setLoading(false);
            return;
        }
        try {
            const settings = await adminService.getAdminMonetarySettings(user.id);
            if (settings?.pricing_prefs && Object.keys(settings.pricing_prefs).length > 0) {
                setPrefs(settings.pricing_prefs);
            }
        } catch (error) {
            console.error('Failed to load currency prefs:', error);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        fetchPrefs();
    }, [fetchPrefs]);

    const refreshPrefs = async () => {
        await fetchPrefs();
    };

    const updatePrefs = (newPrefs: PricingPrefs) => {
        setPrefs(newPrefs);
    };

    const getFormatLocale = () => {
        // Decoupled from language as requested.
        // If we strictly want to support locale-based digits (e.g. Arabic numerals) later,
        // we can add a specific setting for it, but for now defaults to standard digits.
        return 'en-US';
    };

    const formatPrice = useCallback((amount: number, useSymbol: boolean = true) => {
        const currency = CURRENCIES.find(c => c.code === prefs.baseCurrency);
        if (!currency) return `${amount}`;

        const rounded = roundAmount(amount, prefs.rounding);

        // Use the comprehensive formatCurrency helper which handles symbol/code placement
        return formatCurrency(
            rounded,
            prefs.baseCurrency,
            currency.symbol,
            useSymbol ? prefs.priceDisplay : 'code' // fallback or override
        );
    }, [prefs]);

    return (
        <CurrencyContext.Provider value={{ prefs, loading, formatPrice, refreshPrefs, updatePrefs }}>
            {children}
        </CurrencyContext.Provider>
    );
};

export const useCurrency = () => {
    const context = useContext(CurrencyContext);
    if (context === undefined) {
        throw new Error('useCurrency must be used within a CurrencyProvider');
    }
    return context;
};
