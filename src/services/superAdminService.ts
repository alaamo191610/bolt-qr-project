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
    subscription_end?: Date;
    trial_ends_at?: Date;
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

export const superAdminService = {
    async login(email: string, password: string) {
        return api.postPublic<{ token: string; user: { name?: string } }>('/super-admin/login', { email, password });
    },

    async getRestaurants(): Promise<Restaurant[]> {
        return api.get<Restaurant[]>('/super-admin/restaurants', undefined, 'superAdmin');
    },

    async getStats(): Promise<SuperAdminStats> {
        return api.get<SuperAdminStats>('/super-admin/stats', undefined, 'superAdmin');
    },

    async updateRestaurantPlan(
        restaurantId: string,
        plan: string,
        status?: string,
        subscription_end?: string
    ) {
        return api.put(`/super-admin/restaurants/${restaurantId}/plan`, { plan, status, subscription_end }, 'superAdmin');
    },
};
