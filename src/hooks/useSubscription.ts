import { useMemo, useCallback } from 'react';
import { AdminWithSubscription, PLAN_CONFIG, Feature, SubscriptionPlan } from '../types/subscription';

interface UseSubscriptionReturn {
    // Plan checks
    isPro: boolean;
    isBasic: boolean;
    isStandard: boolean;
    currentPlan: SubscriptionPlan;
    planName: string;
    planPrice: number;

    // Status checks
    isActive: boolean;
    isPastDue: boolean;
    isTrial: boolean;
    isCancelled: boolean;
    daysUntilExpiration: number | null;

    // Limits
    maxTables: number;
    maxMenuItems: number;
    maxStaffAccounts: number;

    // Feature access
    canAccessAnalytics: boolean;
    canAccessAdvancedAnalytics: boolean;
    canAccessKDS: boolean;
    canUseCustomBranding: boolean;
    canUseAPIAccess: boolean;
    canUseMultiLocation: boolean;
    canUseCustomQRStyling: boolean;

    // Helper functions
    checkFeature: (feature: Feature) => boolean;
    canAddTable: (currentCount: number) => boolean;
    canAddMenuItem: (currentCount: number) => boolean;
    needsUpgrade: (feature: Feature) => boolean;
}

export const useSubscription = (adminProfile: AdminWithSubscription | null): UseSubscriptionReturn => {
    const plan = adminProfile?.subscription_plan || 'STANDARD';
    const status = adminProfile?.subscription_status || 'ACTIVE';
    const planConfig = PLAN_CONFIG[plan];

    // Plan checks
    const isPro = plan === 'PRO';
    const isBasic = plan === 'BASIC';
    const isStandard = plan === 'STANDARD';

    // Status checks
    const isActive = status === 'ACTIVE';
    const isPastDue = status === 'PAST_DUE';
    const isTrial = status === 'TRIAL';
    const isCancelled = status === 'CANCELLED';

    // Calculate days until expiration
    const daysUntilExpiration = useMemo(() => {
        if (!adminProfile?.subscription_end) return null;
        const end = new Date(adminProfile.subscription_end);
        const now = new Date();
        const diff = end.getTime() - now.getTime();
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
    }, [adminProfile?.subscription_end]);

    // Limits
    const maxTables = adminProfile?.max_tables || planConfig.maxTables;
    const maxMenuItems = adminProfile?.max_menu_items || planConfig.maxMenuItems;
    const maxStaffAccounts = adminProfile?.max_staff_accounts || planConfig.maxStaffAccounts;

    // Feature access (only active subscriptions have full access)
    const hasFullAccess = isActive || isTrial;
    const canAccessAnalytics = hasFullAccess && planConfig.hasAnalytics;
    const canAccessAdvancedAnalytics = hasFullAccess && planConfig.hasAdvancedAnalytics;
    const canAccessKDS = hasFullAccess && planConfig.hasKDS;
    const canUseCustomBranding = hasFullAccess && planConfig.hasCustomBranding;
    const canUseAPIAccess = hasFullAccess && planConfig.hasAPIAccess;
    const canUseMultiLocation = hasFullAccess && planConfig.hasMultiLocation;
    const canUseCustomQRStyling = hasFullAccess && planConfig.hasCustomQRStyling;

    // Check if a specific feature is available
    const checkFeature = useCallback((feature: Feature): boolean => {
        if (!hasFullAccess) return false;

        switch (feature) {
            case 'analytics':
                return planConfig.hasAnalytics;
            case 'advanced_analytics':
                return planConfig.hasAdvancedAnalytics;
            case 'kds':
                return planConfig.hasKDS;
            case 'custom_branding':
                return planConfig.hasCustomBranding;
            case 'api_access':
                return planConfig.hasAPIAccess;
            case 'multi_location':
                return planConfig.hasMultiLocation;
            case 'custom_qr_styling':
                return planConfig.hasCustomQRStyling;
            default:
                return false;
        }
    }, [hasFullAccess, planConfig]);

    // Check if user can add more tables
    const canAddTable = useCallback((currentCount: number): boolean => {
        return currentCount < maxTables;
    }, [maxTables]);

    // Check if user can add more menu items
    const canAddMenuItem = useCallback((currentCount: number): boolean => {
        return currentCount < maxMenuItems;
    }, [maxMenuItems]);

    // Check if feature requires an upgrade
    const needsUpgrade = useCallback((feature: Feature): boolean => {
        return !checkFeature(feature);
    }, [checkFeature]);

    return {
        // Plan checks
        isPro,
        isBasic,
        isStandard,
        currentPlan: plan,
        planName: planConfig.name,
        planPrice: planConfig.price,

        // Status checks
        isActive,
        isPastDue,
        isTrial,
        isCancelled,
        daysUntilExpiration,

        // Limits
        maxTables,
        maxMenuItems,
        maxStaffAccounts,

        // Feature access
        canAccessAnalytics,
        canAccessAdvancedAnalytics,
        canAccessKDS,
        canUseCustomBranding,
        canUseAPIAccess,
        canUseMultiLocation,
        canUseCustomQRStyling,

        // Helper functions
        checkFeature,
        canAddTable,
        canAddMenuItem,
        needsUpgrade,
    };
};
