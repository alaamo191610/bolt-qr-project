// Subscription plan types
export type SubscriptionPlan = 'STANDARD' | 'BASIC' | 'PRO';
export type SubscriptionStatus = 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'TRIAL';

// Plan features and limits
export interface PlanLimits {
    maxTables: number;
    maxMenuItems: number;
    maxStaffAccounts: number;
    hasAnalytics: boolean;
    hasAdvancedAnalytics: boolean;
    hasKDS: boolean;
    hasCustomBranding: boolean;
    hasAPIAccess: boolean;
    hasMultiLocation: boolean;
    hasCustomQRStyling: boolean;
}

// Admin profile with subscription data
export interface AdminWithSubscription {
    id: string;
    email: string;
    restaurant_name?: string;
    subscription_plan: SubscriptionPlan;
    subscription_status: SubscriptionStatus;
    subscription_end?: Date;
    trial_ends_at?: Date;
    max_tables: number;
    max_menu_items: number;
    max_staff_accounts: number;
    created_at: Date;
}

// Plan configurations
export const PLAN_CONFIG: Record<SubscriptionPlan, PlanLimits & { price: number; name: string }> = {
    STANDARD: {
        name: 'Standard',
        price: 10,
        maxTables: 10,
        maxMenuItems: 50,
        maxStaffAccounts: 1,
        hasAnalytics: true,
        hasAdvancedAnalytics: false,
        hasKDS: false,
        hasCustomBranding: false,
        hasAPIAccess: false,
        hasMultiLocation: false,
        hasCustomQRStyling: false,
    },
    BASIC: {
        name: 'Basic',
        price: 29,
        maxTables: 25,
        maxMenuItems: 150,
        maxStaffAccounts: 3,
        hasAnalytics: true,
        hasAdvancedAnalytics: true,
        hasKDS: false,
        hasCustomBranding: false,
        hasAPIAccess: false,
        hasMultiLocation: false,
        hasCustomQRStyling: true,
    },
    PRO: {
        name: 'Pro',
        price: 79,
        maxTables: Infinity,
        maxMenuItems: Infinity,
        maxStaffAccounts: 10,
        hasAnalytics: true,
        hasAdvancedAnalytics: true,
        hasKDS: true,
        hasCustomBranding: true,
        hasAPIAccess: true,
        hasMultiLocation: true,
        hasCustomQRStyling: true,
    },
};

// Features that can be checked
export type Feature =
    | 'analytics'
    | 'advanced_analytics'
    | 'kds'
    | 'custom_branding'
    | 'api_access'
    | 'multi_location'
    | 'custom_qr_styling';
