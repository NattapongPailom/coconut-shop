// REST API service for the Coconut Shop dashboard

const BASE_URL = '/api';

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(error?.error?.message || `HTTP ${res.status}`);
  }

  return res.json();
}

export interface ApiOrder {
  id: string;
  queueNumber: string;
  customerName: string | null;
  customerLineId: string | null;
  items: ApiOrderItem[];
  totalPrice: number;
  pickupTime: string | null;
  status: 'waiting' | 'making' | 'done' | 'cancelled';
  priorityScore: number;
  note: string | null;
  source: 'line' | 'manual';
  rawMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiOrderItem {
  name: string;
  quantity: number;
  unit: string;
  pricePerUnit: number;
  totalPrice: number;
}

export interface DailyStats {
  totalOrders: number;
  completedOrders: number;
  activeOrders: number;
  dailyRevenue: number;
  date: string;
}

export interface CreateOrderPayload {
  customerName?: string;
  items: {
    name: string;
    quantity: number;
    unit: string;
    pricePerUnit: number;
  }[];
  pickupTime?: string;
  note?: string;
}

export const api = {
  // Fetch all active orders
  getOrders(): Promise<ApiOrder[]> {
    return request<ApiOrder[]>('/orders');
  },

  // Fetch completed/cancelled orders history
  getHistory(): Promise<ApiOrder[]> {
    return request<ApiOrder[]>('/orders/history');
  },

  // Fetch daily statistics
  getStats(): Promise<DailyStats> {
    return request<DailyStats>('/orders/stats');
  },

  // Update order status
  updateStatus(
    id: string,
    status: 'waiting' | 'making' | 'done' | 'cancelled'
  ): Promise<ApiOrder> {
    return request<ApiOrder>(`/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  // Create a new manual order
  createOrder(payload: CreateOrderPayload): Promise<ApiOrder> {
    return request<ApiOrder>('/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Cancel an order
  cancelOrder(id: string): Promise<{ success: boolean; id: string }> {
    return request<{ success: boolean; id: string }>(`/orders/${id}`, {
      method: 'DELETE',
    });
  },

  // Health check
  health(): Promise<{ status: string; version: string }> {
    return request<{ status: string; version: string }>('/health');
  },
};
