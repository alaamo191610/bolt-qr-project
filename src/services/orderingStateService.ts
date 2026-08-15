import { api } from './api';

// See docs/contracts/public-order-availability.md.
export type OrderingState = 'OPEN' | 'PAUSED' | 'CLOSED' | 'OVERLOADED';

export interface OrderingStateResponse {
  branchId: string;
  state: OrderingState;
  updatedAt: string;
}

export const orderingStateService = {
  async get(branchId: string): Promise<OrderingStateResponse> {
    return await api.get(`/branches/${branchId}/ordering-state`);
  },

  async set(branchId: string, state: OrderingState): Promise<OrderingStateResponse> {
    return await api.put(`/branches/${branchId}/ordering-state`, { state });
  },
};
