// Super Admin Service for API calls

interface SuperAdminStats {
    totalRestaurants: number;
    activeRestaurants: number;
    totalRevenue: number;
    growth: number;
}

interface Restaurant {
    id: string;
    email: string;
    restaurant_name?: string;
    subscription_plan: string;
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
        const response = await fetch('http://localhost:3000/api/super-admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Login failed');
        }

        return response.json();
    },

    async getRestaurants(token: string): Promise<Restaurant[]> {
        const response = await fetch('http://localhost:3000/api/super-admin/restaurants', {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        if (!response.ok) throw new Error('Failed to fetch restaurants');
        return response.json();
    },

    async getStats(token: string): Promise<SuperAdminStats> {
        const response = await fetch('http://localhost:3000/api/super-admin/stats', {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        if (!response.ok) throw new Error('Failed to fetch stats');
        return response.json();
    },

    async updateRestaurantPlan(
        token: string,
        restaurantId: string,
        plan: string,
        status?: string,
        subscription_end?: string
    ) {
        const response = await fetch(`http://localhost:3000/api/super-admin/restaurants/${restaurantId}/plan`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ plan, status, subscription_end }),
        });

        if (!response.ok) throw new Error('Failed to update plan');
        return response.json();
    },
};
