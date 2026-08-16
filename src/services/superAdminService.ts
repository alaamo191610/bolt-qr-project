// Super Admin Service for API calls

import { api } from './api';

export interface SuperAdminStats {
    totalRestaurants: number;
    activeRestaurants: number;
    totalRevenue: number;
    growth: number;
}

export type SubscriptionPlan = 'STANDARD' | 'BASIC' | 'PRO';

export interface Restaurant {
    id: string;
    email: string;
    restaurant_name?: string;
    subscription_plan: SubscriptionPlan;
    subscription_status: string;
    subscription_end?: string | null;
    trial_ends_at?: string | null;
    activation_status: 'ACTIVE' | 'INVITED' | 'SUSPENDED' | 'UNKNOWN';
    max_tables: number;
    max_menu_items: number;
    max_staff_accounts: number;
    created_at: Date;
    _count: {
        menus: number;
        tables: number;
        orders: number;
    };
}

export interface RestaurantPage {
    items: Restaurant[];
    pagination: { limit: number; hasMore: boolean; nextCursor: string | null };
}

export interface SuperAdminMfaChallenge {
    mfaRequired: true;
    enrollmentRequired: boolean;
    challengeToken: string;
    enrollment?: {
        secret: string;
        otpauthUri: string;
    };
}

export interface SuperAdminSession {
    user: { id: string; email: string; name?: string; role: 'SUPER_ADMIN' };
    recoveryCodes?: string[];
}

export interface RestaurantInvitationResponse {
    restaurant: {
        id: string;
        organizationId: string;
        ownerEmail: string;
        restaurantName: string;
        plan: SubscriptionPlan;
        status: 'ACTIVE' | 'TRIAL';
        subscriptionEnd: string | null;
        trialEndsAt: string | null;
        maxTables: number;
        maxMenuItems: number;
        maxStaffAccounts: number;
    };
    invitation: { token: string; expiresAt: string; activationPath: string };
}

export const superAdminService = {
    async login(email: string, password: string): Promise<SuperAdminMfaChallenge> {
        return api.postPublic<SuperAdminMfaChallenge>('/super-admin/login', { email, password });
    },

    async verifyMfa(challengeToken: string, value: string, recovery = false): Promise<SuperAdminSession> {
        return api.postPublic<SuperAdminSession>('/super-admin/mfa/verify', {
            challengeToken,
            ...(recovery ? { recoveryCode: value } : { code: value }),
        });
    },

    async logout(): Promise<void> {
        await api.post('/super-admin/logout', {}, 'superAdmin');
    },

    async getRestaurantsPage(input: {
        cursor?: string;
        limit?: number;
        search?: string;
        plan?: 'ALL' | SubscriptionPlan;
    } = {}): Promise<RestaurantPage> {
        return api.get<RestaurantPage>('/super-admin/restaurants', {
            ...(input.cursor ? { cursor: input.cursor } : {}),
            ...(input.limit ? { limit: String(input.limit) } : {}),
            ...(input.search ? { search: input.search } : {}),
            ...(input.plan && input.plan !== 'ALL' ? { plan: input.plan } : {}),
        }, 'superAdmin');
    },

    async getRestaurants(): Promise<Restaurant[]> {
        return (await this.getRestaurantsPage()).items;
    },

    async getStats(): Promise<SuperAdminStats> {
        return api.get<SuperAdminStats>('/super-admin/stats', undefined, 'superAdmin');
    },

    async provisionRestaurant(input: {
        ownerEmail: string;
        restaurantName: string;
        plan: SubscriptionPlan;
        status: 'ACTIVE' | 'TRIAL';
        subscriptionEnd?: string;
        trialEndsAt?: string;
    }): Promise<RestaurantInvitationResponse> {
        return api.post<RestaurantInvitationResponse>('/super-admin/restaurants', input, 'superAdmin');
    },

    async rotateRestaurantInvitation(restaurantId: string): Promise<RestaurantInvitationResponse['invitation']> {
        const response = await api.post<{ invitation: RestaurantInvitationResponse['invitation'] }>(
            `/super-admin/restaurants/${restaurantId}/invitations`,
            {},
            'superAdmin',
        );
        return response.invitation;
    },

    async updateRestaurantPlan(
        restaurantId: string,
        plan: string,
        status?: string,
        subscription_end?: string,
        trial_ends_at?: string,
    ): Promise<{
        id: string
        subscription_plan: SubscriptionPlan
        subscription_status: string
        subscription_end: string | null
        max_tables: number
        max_menu_items: number
        max_staff_accounts: number
    }> {
        return api.put(`/super-admin/restaurants/${restaurantId}/plan`, {
            plan,
            status,
            subscription_end,
            trial_ends_at,
        }, 'superAdmin');
    },
};
