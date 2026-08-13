// Super Admin Service for API calls

import { handleResponse } from './api';

const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const fallbackProtocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
const fallbackApiUrl = import.meta.env.PROD
    ? `${fallbackProtocol}//${hostname}/api`
    : `${fallbackProtocol}//${hostname}:3000/api`;
const API_URL = (import.meta.env.VITE_API_URL || fallbackApiUrl).replace(/\/$/, '');

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
        const response = await fetch(`${API_URL}/super-admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        return handleResponse<{ token: string; user: { name?: string } }>(response);
    },

    async getRestaurants(token: string): Promise<Restaurant[]> {
        const response = await fetch(`${API_URL}/super-admin/restaurants`, {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        return handleResponse<Restaurant[]>(response);
    },

    async getStats(token: string): Promise<SuperAdminStats> {
        const response = await fetch(`${API_URL}/super-admin/stats`, {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        return handleResponse<SuperAdminStats>(response);
    },

    async updateRestaurantPlan(
        token: string,
        restaurantId: string,
        plan: string,
        status?: string,
        subscription_end?: string
    ) {
        const response = await fetch(`${API_URL}/super-admin/restaurants/${restaurantId}/plan`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ plan, status, subscription_end }),
        });

        return handleResponse(response);
    },
};
