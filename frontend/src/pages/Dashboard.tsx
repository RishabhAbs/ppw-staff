import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, AlertCircle, LogOut, Package, FileText, ClipboardList, RefreshCw, ShoppingCart, IndianRupee, Calendar, ArrowRight, ScanLine } from 'lucide-react';
import { getUser, getDashboardStats, syncLedgers, syncStockItems } from '../api';
import { canAccess, getDefaultRoute } from '../utils';

import { useNavigate } from 'react-router-dom';

interface DashboardStats {
    today: { orders: number; sales: number };
    staffActivity: { id: number; name: string; bills: number; sales: number }[];
    ledgerCount: number;
    stockCount: number;
    fyOrders: number;
    lastSync: { ledgers: string | null; stock: string | null };
}

export default function Dashboard() {
    const navigate = useNavigate();
    const [status, setStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' });
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loadingStats, setLoadingStats] = useState(true);
    const [syncingLedgers, setSyncingLedgers] = useState(false);
    const [syncingStock, setSyncingStock] = useState(false);

    // Redirect away ONLY if this user can't actually access the dashboard.
    // A non-admin who has been granted the 'dashboard' permission legitimately
    // sees the Home tab and must be allowed to stay here when they tap it —
    // previously every non-admin was bounced to /orders, so Home did nothing
    // for them. Users WITHOUT dashboard access are still routed to a page they
    // can see (the loop-guard the original code was added for).
    useEffect(() => {
        const user = getUser();
        if (canAccess(user, '/')) return; // admin, or has 'dashboard' — stay.
        // Prefer /orders if they can see it; otherwise their permission-based default.
        const target = canAccess(user, '/orders') ? '/orders' : getDefaultRoute(user);
        // Never navigate to '/' (this page) — that would loop straight back here.
        if (target && target !== '/') navigate(target, { replace: true });
    }, []);

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        try {
            setLoadingStats(true);
            const data = await getDashboardStats();
            setStats(data);
        } catch (e) {
            console.error('Failed to fetch dashboard stats', e);
        } finally {
            setLoadingStats(false);
        }
    };

    const handleSyncLedgers = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setSyncingLedgers(true);
        try {
            await syncLedgers();
            setStatus({ type: 'success', message: 'Ledgers synced successfully' });
            fetchStats();
        } catch {
            setStatus({ type: 'error', message: 'Failed to sync ledgers' });
        } finally {
            setSyncingLedgers(false);
            setTimeout(() => setStatus({ type: null, message: '' }), 3000);
        }
    };

    const handleSyncStock = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setSyncingStock(true);
        try {
            await syncStockItems();
            setStatus({ type: 'success', message: 'Stock items synced successfully' });
            fetchStats();
        } catch {
            setStatus({ type: 'error', message: 'Failed to sync stock items' });
        } finally {
            setSyncingStock(false);
            setTimeout(() => setStatus({ type: null, message: '' }), 3000);
        }
    };

    const handleLogout = () => {
        if (window.confirm('Are you sure you want to log out?')) {
            setStatus({ type: 'success', message: 'Logged out successfully' });
            setTimeout(() => {
                localStorage.removeItem('user');
                localStorage.removeItem('token');
                window.location.href = '/login';
            }, 1000);
        }
    };

    const getFYLabel = () => {
        const now = new Date();
        if (now.getMonth() >= 3) {
            return `FY ${now.getFullYear()}-${(now.getFullYear() + 1).toString().slice(2)}`;
        }
        return `FY ${now.getFullYear() - 1}-${now.getFullYear().toString().slice(2)}`;
    };

    const formatLastSync = (timestamp: string | null) => {
        if (!timestamp) return 'Never';
        const date = new Date(timestamp);
        return date.toLocaleString('en-IN', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric',
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true 
        }).toUpperCase();
    };

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="relative z-10 space-y-0.5">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <img src="/ppw-logo.png" alt="PPW" className="w-10 h-10 object-contain" />
                        <h2 className="text-3xl font-black text-slate-900 tracking-tighter">P.P.W.</h2>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="p-3 bg-white border border-slate-200 rounded-full text-slate-400 hover:text-red-500 hover:border-red-100 hover:bg-red-50 transition-colors shadow-sm active:scale-90"
                        title="Logout"
                    >
                        <LogOut size={20} />
                    </button>
                </div>
                <p className="text-slate-500 font-bold text-xs tracking-tight opacity-70 ml-[52px]">Purbanchal Papers & Works</p>
            </div>

            {/* Today's Stats */}
            <div className="grid grid-cols-2 gap-3">
                <div className="glass-card p-4 rounded-3xl relative overflow-hidden">
                    <div className="space-y-2">
                        <div className="w-9 h-9 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                            <ShoppingCart size={18} />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Today's Orders</p>
                            <p className="text-2xl font-black text-slate-800">
                                {loadingStats ? '...' : stats?.today.orders ?? 0}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="glass-card p-4 rounded-3xl relative overflow-hidden">
                    <div className="space-y-2">
                        <div className="w-9 h-9 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                            <IndianRupee size={18} />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Today's Sales</p>
                            <p className="text-2xl font-black text-slate-800">
                                {loadingStats ? '...' : `₹${Math.round(stats?.today.sales ?? 0).toLocaleString('en-IN')}`}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Staff Activity */}
            {stats && (
                <div className="space-y-2">
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest px-1">Staff Activity Today</p>
                    {stats.staffActivity.length > 0 ? (
                        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory" style={{ scrollbarWidth: 'none' }}>
                            {stats.staffActivity.map((staff) => (
                                <div 
                                    key={staff.id} 
                                    onClick={() => navigate(`/orders?userId=${staff.id}&userName=${encodeURIComponent(staff.name)}`)}
                                    className="min-w-[160px] snap-start bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex-shrink-0 cursor-pointer hover:border-indigo-200 hover:shadow-md active:scale-95 transition-all"
                                >
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-8 h-8 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 font-bold text-sm uppercase">
                                            {(staff.name || '?').charAt(0)}
                                        </div>
                                        <span className="font-bold text-slate-800 text-sm truncate">{staff.name}</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-slate-500">{staff.bills} bills</span>
                                        <span className="font-bold text-slate-700">₹{Math.round(staff.sales).toLocaleString('en-IN')}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center text-slate-500 text-xs font-semibold">
                            No bills generated today.
                        </div>
                    )}
                </div>
            )}

            {/* Reports Section */}
            <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Reports</p>
                    <span className="text-[10px] font-black text-indigo-400 bg-indigo-50 px-2 py-0.5 rounded-full uppercase">Real-time</span>
                </div>
                
                <div className="grid grid-cols-1 gap-4">
                    {/* Ledgers Card */}
                    <Link to="/ledgers" className="group relative block p-5 bg-white rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-slate-100 active:scale-[0.98] transition-all overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50/30 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-indigo-100/40 transition-colors"></div>
                        <div className="relative flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200 group-hover:scale-110 transition-transform">
                                    <FileText size={22} />
                                </div>
                                <div>
                                    <h3 className="font-black text-slate-800 text-lg tracking-tight">Ledgers</h3>
                                    <p className={`text-xs font-bold tracking-tight uppercase ${stats?.lastSync?.ledgers ? 'text-indigo-500' : 'text-slate-400'}`}>
                                        Synced: {loadingStats ? '...' : formatLastSync(stats?.lastSync?.ledgers || null)}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="text-right">
                                    <p className="text-xl font-black text-slate-900 tracking-tighter leading-none">
                                        {loadingStats ? '...' : (stats?.ledgerCount ?? 0).toLocaleString()}
                                    </p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Total</p>
                                </div>
                                <button
                                    onClick={handleSyncLedgers}
                                    disabled={syncingLedgers}
                                    className="p-2.5 bg-slate-50 text-slate-400 hover:text-indigo-600 hover:bg-white hover:shadow-md border border-slate-100 rounded-xl transition-all disabled:opacity-50 active:scale-90"
                                    title="Sync Ledgers"
                                >
                                    <RefreshCw size={18} className={syncingLedgers ? 'animate-spin' : ''} />
                                </button>
                            </div>
                        </div>
                    </Link>

                    {/* Stock Card */}
                    <Link to="/stock-items" className="group relative block p-5 bg-white rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-slate-100 active:scale-[0.98] transition-all overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50/30 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-emerald-100/40 transition-colors"></div>
                        <div className="relative flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-200 group-hover:scale-110 transition-transform">
                                    <Package size={22} />
                                </div>
                                <div>
                                    <h3 className="font-black text-slate-800 text-lg tracking-tight">Inventory</h3>
                                    <p className={`text-xs font-bold tracking-tight uppercase ${stats?.lastSync?.stock ? 'text-emerald-500' : 'text-slate-400'}`}>
                                        Updated: {loadingStats ? '...' : formatLastSync(stats?.lastSync?.stock || null)}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="text-right">
                                    <p className="text-xl font-black text-slate-900 tracking-tighter leading-none">
                                        {loadingStats ? '...' : (stats?.stockCount ?? 0).toLocaleString()}
                                    </p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Items</p>
                                </div>
                                <button
                                    onClick={handleSyncStock}
                                    disabled={syncingStock}
                                    className="p-2.5 bg-slate-50 text-slate-400 hover:text-emerald-600 hover:bg-white hover:shadow-md border border-slate-100 rounded-xl transition-all disabled:opacity-50 active:scale-90"
                                    title="Sync Stock Items"
                                >
                                    <RefreshCw size={18} className={syncingStock ? 'animate-spin' : ''} />
                                </button>
                            </div>
                        </div>
                    </Link>

                    {/* Day Book Card */}
                    <Link to="/orders" className="group relative block p-5 bg-white rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-slate-100 active:scale-[0.98] transition-all overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-orange-50/30 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-orange-100/40 transition-colors"></div>
                        <div className="relative flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white shadow-lg shadow-orange-200 group-hover:scale-110 transition-transform">
                                    <ClipboardList size={22} />
                                </div>
                                <div>
                                    <h3 className="font-black text-slate-800 text-lg tracking-tight">Day Book</h3>
                                    <p className="text-[10px] font-bold text-slate-400 tracking-tight uppercase">Today's Transactions</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 mr-1">
                                <div className="text-right">
                                    <p className="text-xl font-black text-orange-600 tracking-tighter leading-none transition-transform group-hover:scale-110">
                                        {loadingStats ? '...' : stats?.today.orders ?? 0}
                                    </p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Orders</p>
                                </div>
                                <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center text-orange-500 group-hover:bg-orange-600 group-hover:text-white transition-all">
                                    <ArrowRight size={16} strokeWidth={3} />
                                </div>
                            </div>
                        </div>
                    </Link>

                    {/* FY Card */}
                    <Link to="/orders?range=fy" className="group relative block p-5 bg-slate-900 rounded-3xl shadow-xl active:scale-[0.98] transition-all overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-indigo-500/10 to-transparent"></div>
                        <div className="absolute bottom-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -mr-10 -mb-10 group-hover:bg-indigo-500/20 transition-colors"></div>
                        <div className="relative flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-indigo-400 border border-white/10 group-hover:scale-110 transition-transform">
                                    <Calendar size={22} />
                                </div>
                                <div>
                                    <h3 className="font-black text-white text-lg tracking-tight group-hover:text-indigo-300 transition-colors">{getFYLabel()}</h3>
                                    <p className="text-[10px] font-bold text-slate-500 tracking-tight uppercase">Full Financial Year</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 mr-1">
                                <div className="text-right">
                                    <p className="text-xl font-black text-indigo-400 tracking-tighter leading-none group-hover:text-white transition-colors">
                                        {loadingStats ? '...' : (stats?.fyOrders ?? 0).toLocaleString()}
                                    </p>
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Orders</p>
                                </div>
                                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-slate-500 group-hover:bg-indigo-500 group-hover:text-white transition-all">
                                    <ArrowRight size={16} strokeWidth={3} />
                                </div>
                            </div>
                        </div>
                    </Link>

                    {/* Attach Barcode Card */}
                    <Link to="/attach-barcode" className="group relative block p-5 bg-indigo-50 rounded-3xl shadow-sm border border-indigo-100 active:scale-[0.98] transition-all overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-100/50 rounded-full blur-3xl -mr-10 -mb-10 group-hover:bg-indigo-200/50 transition-colors"></div>
                        <div className="relative flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-indigo-600 shadow-sm border border-indigo-50 group-hover:scale-110 transition-transform">
                                    <ScanLine size={22} />
                                </div>
                                <div>
                                    <h3 className="font-black text-slate-800 text-lg tracking-tight group-hover:text-indigo-600 transition-colors">Attach Barcode</h3>
                                    <p className="text-[10px] font-bold text-slate-500 tracking-tight uppercase">Database Sync</p>
                                </div>
                            </div>
                            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-indigo-500 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm">
                                <ArrowRight size={16} strokeWidth={3} />
                            </div>
                        </div>
                    </Link>
                </div>
            </div>

            {/* Status Notification */}
            {
                status.message && (
                    <div className={`fixed top-4 left-4 right-4 z-50 p-4 rounded-2xl shadow-xl flex items-center gap-3 animate-fade-in ${status.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
                        }`}>
                        <div className="p-2 bg-white/20 rounded-full backdrop-blur-sm">
                            {status.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                        </div>
                        <span className="font-bold text-sm">
                            {status.message}
                        </span>
                        <button
                            onClick={() => setStatus({ type: null, message: '' })}
                            className="ml-auto p-1 bg-white/20 rounded-full"
                        >
                            <AlertCircle size={16} className="opacity-0" />
                        </button>
                    </div>
                )
            }
        </div>
    );
}
