import axios from 'axios';

const isCapacitor = (window as any).Capacitor !== undefined;
// Priority: 
// 1. Env Var (Production/Custom)
// 2. Capacitor Fallback (Local Network)
// 3. Proxy Fallback (Development)
const API_URL = import.meta.env.VITE_API_URL || (isCapacitor ? 'http://192.168.1.19:3000' : '/api');

const api = axios.create({
    baseURL: API_URL,
});

// Add a request interceptor to inject the token
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Add a response interceptor to handle 401 errors.
//
// Only force a logout when the request was actually sent WITHOUT a token, or
// when the token has been rejected on a real request. A blanket
// "any 401 => wipe session + redirect" is too aggressive: right after login a
// data call (e.g. /reports/orders draft check) could momentarily race the
// service worker / token and return 401, which would instantly bounce the
// freshly-logged-in user back to /login. We also never redirect when already
// on /login (avoids a reload loop on the login screen itself).
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            const hadToken = !!localStorage.getItem('token');
            const onLoginPage = window.location.pathname === '/login';
            const sentToken = !!error.config?.headers?.Authorization;
            // Real auth failure: the server rejected a request we DID send a
            // token with (expired/invalid), or there was never a token at all.
            if (!onLoginPage && (!hadToken || sentToken)) {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

// Dashboard stats
export const getDashboardStats = async () => {
    const response = await api.get('/dashboard/stats');
    return response.data;
};

// Separate sync endpoints
export const syncLedgers = async () => {
    const response = await api.post('/sync/ledgers');
    return response.data;
};

export const syncStockItems = async () => {
    const response = await api.post('/sync/stock-items');
    return response.data;
};

export const getStockGroups = async (search = '') => {
    const response = await api.get('/stock-items/groups', {
        params: { search },
    });
    return response.data;
};

export const getStockParents = async (search = '') => {
    const response = await api.get('/stock-items/parents', {
        params: { search },
    });
    return response.data;
};

export const getStockCategories = async (search = '') => {
    const response = await api.get('/stock-items/categories', {
        params: { search },
    });
    return response.data;
};

// Combined sync (legacy)
export const syncData = async () => {
    const response = await api.post('/sync');
    return response.data;
};

// Paginated endpoints
export const createLedger = async (ledgerData: any) => {
    const response = await api.post('/ledgers', ledgerData);
    return response.data;
};

export const getLedgers = async (page = 1, limit = 50, search = '') => {
    const response = await api.get('/reports/ledgers', {
        params: { page, limit, search },
    });
    return response.data;
};

export const getStockItems = async (page = 1, limit = 50, search = '', category = '', parent = '') => {
    const response = await api.get('/reports/stock-items', {
        params: { page, limit, search, category, parent },
    });
    return response.data;
};

export const createOrder = async (orderData: any) => {
    const user = getUser();
    const response = await api.post('/orders', { ...orderData, created_by: user.id });
    return response.data;
};

export const updateOrder = async (id: number, orderData: any) => {
    const response = await api.put(`/orders/${id}`, orderData);
    return response.data;
};

export const getItemByBarcode = async (barcode: string) => {
    const response = await api.get(`/stock-items/barcode/${barcode}`);
    return response.data;
};

export const getLiveStock = async (id: string) => {
    const response = await api.get('/stock-items/live-stock', {
        params: { masterid: id }
    });
    return response.data;
};

export const updateItemBarcode = async (masterid: string, barcode: string) => {
    const response = await api.put(`/stock-items/${masterid}/barcode`, { barcode });
    return response.data;
};

export const getOrders = async (page = 1, limit = 50, search = '', orderType = '', userIdOverride?: number, date?: string, range?: string, status = '', source = '') => {
    const user = getUser();
    const response = await api.get('/reports/orders', {
        params: {
            page,
            limit,
            search,
            // Scoping: Admin and Manager see all orders by default. Employee only sees their own.
            user_id: userIdOverride || (['admin', 'manager'].includes(user.role) ? undefined : user.id),
            role: user.role,
            show_all: 'true',
            order_type: orderType || undefined,
            date: date || undefined,
            range: range || undefined,
            status: status || undefined,
            source: source || undefined
        },
    });
    return response.data;
};

export const getDraftOrders = async () => {
    const user = getUser();
    const response = await api.get('/reports/orders', {
        params: {
            // No limit/page for now, seeing latest 50 drafts is usually enough
            drafts_only: 'true',
            user_id: user.id,
            role: user.role
        },
    });
    return response.data;
};

export const getOrderById = async (id: number) => {
    const response = await api.get(`/orders/${id}`);
    return response.data;
};

export const getOrderDetails = async (id: number) => {
    const response = await api.get(`/orders/${id}/details`);
    return response.data;
};

export const deleteOrder = async (id: number) => {
    const response = await api.delete(`/orders/${id}`);
    return response.data;
};

export const syncOrderToTally = async (id: number) => {
    const response = await api.post(`/orders/${id}/sync`);
    return response.data;
};

// User Management
export const getUsers = async () => {
    const response = await api.get('/users');
    return response.data;
};

export const createUser = async (userData: any) => {
    const response = await api.post('/users', userData);
    return response.data;
};

export interface Ledger {
    id: number;
    name: string;
    tally_guid?: string;
}
export const updateUser = async (id: number, userData: any) => {
    const response = await api.patch(`/users/${id}`, userData);
    return response.data;
};

export const deleteUser = async (id: number) => {
    const response = await api.delete(`/users/${id}`);
    return response.data;
};

// Godown
export const createGodownEntry = async (entryData: any) => {
    const response = await api.post('/godown/entries', entryData);
    return response.data;
};

export const getGodownEntries = async (page = 1, limit = 50, search = '') => {
    const response = await api.get('/godown/entries', {
        params: { page, limit, search }
    });
    return response.data;
};

export const updateGodownEntry = async (id: number, entryData: any) => {
    const response = await api.post(`/godown/entries/${id}`, entryData);
    return response.data;
};

// Safe User Parser
// Normalize a stored permissions value WITHOUT destroying its shape. The admin
// UI saves a structured object { system: string[], orderTypes, godowns, ... };
// hasPermission()/getDefaultRoute read either a flat string[] OR
// permissions.system, so both shapes are valid and must be preserved. Mirror of
// the backend's AuthService.normalizePermissions — only cleans genuine garbage.
const normalizePermissions = (value: any): string[] | Record<string, any> => {
    if (Array.isArray(value)) return value.filter((p) => typeof p === 'string');
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return [];
        try {
            // Recurse so a JSON-encoded object keeps its structure.
            return normalizePermissions(JSON.parse(trimmed));
        } catch {
            // not JSON — treat as comma-separated
        }
        return trimmed.split(',').map((p) => p.trim()).filter(Boolean);
    }
    if (value && typeof value === 'object') {
        const system = Array.isArray(value.system)
            ? value.system.filter((p: any) => typeof p === 'string')
            : [];
        return { ...value, system };
    }
    return [];
};

export const getUser = () => {
    try {
        const userStr = localStorage.getItem('user');
        if (!userStr || userStr === 'undefined' || userStr === 'null') return {};
        const user = JSON.parse(userStr);
        if (user && typeof user === 'object') {
            user.permissions = normalizePermissions(user.permissions);
        }
        return user;
    } catch (e) {
        return {};
    }
};
// Item Details
export const getItemDetails = async (masterid: string) => {
    const response = await api.get(`/item-details/${masterid}`);
    return response.data;
};

export const saveItemDetails = async (masterid: string, formData: FormData) => {
    const response = await api.post(`/item-details/${masterid}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
};

export const deleteItemMedia = async (masterid: string, slot: string) => {
    const response = await api.delete(`/item-details/${masterid}/media/${slot}`);
    return response.data;
};

export default api;
