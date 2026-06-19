import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader, Search, FileText, Calendar, ArrowRight, Trash2, LogOut, X, User as UserIcon, ChevronDown } from 'lucide-react';
import { getOrders, deleteOrder, syncOrderToTally, getUser } from '../api';

// Define interfaces locally if not exported from api
interface Order {
    id: number;
    bill_number: string;
    date: string;
    total_amount: string;
    status: string;
    ledger?: { name: string };
    creator?: { username: string };
    order_type?: string;
}

const ORDER_FILTERS = [
    { label: 'All', value: '', category: 'all' },
    { label: 'InEdit', value: 'inedit', category: 'status' },
    { label: 'Pending', value: 'pending', category: 'status' },
    { label: 'Completed', value: 'fetched', category: 'status' },
    { label: 'Tax Invoice', value: 'Tax Invoice', category: 'type' },
    { label: 'Quotation', value: 'Quotation', category: 'type' },
];

export default function OrderReport() {
    const [searchParams, setSearchParams] = useSearchParams();
    const userId = searchParams.get('userId');
    const userName = searchParams.get('userName');
    const userRole = getUser()?.role;
    const isAdmin = userRole === 'admin';

    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedDate, setSelectedDate] = useState<string>(() => {
        const query = new URLSearchParams(window.location.search);
        if (query.get('range') === 'fy') return '';
        
        const d = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000;
        const istTime = new Date(d.getTime() + istOffset);
        return `${istTime.getUTCFullYear()}-${String(istTime.getUTCMonth() + 1).padStart(2, '0')}-${String(istTime.getUTCDate()).padStart(2, '0')}`;
    });
    const [activeFilter, setActiveFilter] = useState({ value: '', category: 'all' });
    const [pagination, setPagination] = useState({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0
    });

    const fetchOrders = async (page = 1, search = '', filter = activeFilter, date = selectedDate) => {
        setLoading(true);
        try {
            const data = await getOrders(
                page, 
                pagination.limit, 
                search, 
                filter.category === 'type' ? filter.value : '', 
                userId ? parseInt(userId) : undefined,
                date,
                searchParams.get('range') || '',
                filter.category === 'status' ? filter.value : ''
            );
            
            setOrders(data.data);
            setPagination({
                page: data.pagination.page,
                limit: data.pagination.limit,
                total: data.pagination.total,
                totalPages: data.pagination.totalPages
            });
        } catch (error) {
            console.error('Failed to fetch orders', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const range = searchParams.get('range');
        if (range === 'fy') {
            fetchOrders(1, searchTerm, activeFilter, '');
        } else {
            fetchOrders(1, searchTerm, activeFilter, selectedDate);
        }
    }, [userId, selectedDate, activeFilter, searchParams]);

    // Whenever we land on the plain Day Book (no staff drill-down), snap the date
    // filter back to the current IST day. So after viewing a staff member's older
    // entries and coming back, it auto-returns to "today" without the user having to
    // re-select it. Manual date picks on the normal view are preserved (this only
    // runs when the userId drill-down param changes). Applies to every role.
    useEffect(() => {
        if (!userId && searchParams.get('range') !== 'fy') {
            const istTime = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
            setSelectedDate(`${istTime.getUTCFullYear()}-${String(istTime.getUTCMonth() + 1).padStart(2, '0')}-${String(istTime.getUTCDate()).padStart(2, '0')}`);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            fetchOrders(1, searchTerm);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const updateDate = (date: string) => {
        if (searchParams.get('range')) {
            const newParams = new URLSearchParams(searchParams);
            newParams.delete('range');
            setSearchParams(newParams);
        }
        setSelectedDate(date);
    };

    const handleFilterChange = (filter: { value: string, category: string }) => {
        setActiveFilter(filter);
    };

    const clearUserFilter = () => {
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('userId');
        newParams.delete('userName');
        setSearchParams(newParams);
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            fetchOrders(1, searchTerm);
        }
    };

    const goToPage = (page: number) => {
        if (page >= 1 && page <= pagination.totalPages) {
            fetchOrders(page, searchTerm);
        }
    };

    const handleSync = async (e: React.MouseEvent, id: number) => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm('Mark this order as Pending for Tally sync?')) return;
        try {
            await syncOrderToTally(id);
            alert('Order marked as Pending for Tally!');
            fetchOrders(pagination.page, searchTerm);
        } catch (error) {
            console.error('Failed to sync order', error);
            alert('Failed to sync order');
        }
    };

    const handleDelete = async (e: React.MouseEvent, id: number) => {
        e.preventDefault(); // Prevent link navigation
        if (!confirm('Are you sure you want to delete this order?')) return;

        try {
            await deleteOrder(id);
            // Refresh list
            fetchOrders(pagination.page, searchTerm);
        } catch (error) {
            console.error('Failed to delete order', error);
            alert('Failed to delete order');
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 min-h-screen pb-20">
            {/* Refined Header */}
            <div className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-20 shadow-sm space-y-3">
                {/* Row 1: Logo and Logout */}
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center">
                            <img src="/ppw-logo.png" alt="Logo" className="w-5 h-5 object-contain" />
                        </div>
                        <h1 className="text-xl font-extrabold text-slate-800 tracking-tight">Day Book</h1>
                    </div>
                    <button
                        onClick={() => {
                            if (confirm('Are you sure you want to log out?')) {
                                localStorage.removeItem('token');
                                localStorage.removeItem('user');
                                window.location.href = '/login';
                            }
                        }}
                        className="w-10 h-10 flex items-center justify-center bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-all border border-red-100/50 shadow-sm active:scale-90"
                    >
                        <LogOut size={18} />
                    </button>
                </div>

                {/* Row 2: Filter + Date Selector and Order Count */}
                <div className="flex items-center gap-2">
                    {/* Status Filter Dropdown */}
                    <div className="relative flex-shrink-0">
                        <select 
                            className="appearance-none bg-orange-50/50 border border-orange-100 text-orange-700 text-[11px] font-black pl-3 pr-8 py-2 rounded-xl outline-none focus:ring-2 focus:ring-orange-100 transition-all uppercase tracking-tight shadow-sm"
                            value={JSON.stringify(activeFilter)}
                            onChange={(e) => {
                                try {
                                    const val = JSON.parse(e.target.value);
                                    handleFilterChange(val);
                                } catch (e) {
                                    console.error('Failed to parse filter value', e);
                                }
                            }}
                        >
                            {ORDER_FILTERS.map(f => (
                                <option key={`${f.category}-${f.value}`} value={JSON.stringify({ value: f.value, category: f.category })}>
                                    {f.label}
                                </option>
                            ))}
                        </select>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-orange-400">
                             <ChevronDown size={14} />
                        </div>
                    </div>

                    {isAdmin && (
                        <div className="flex items-center bg-white border border-slate-200 rounded-xl px-2 py-1.5 gap-2 shadow-sm flex-1 min-w-0">
                            <button 
                                onClick={() => {
                                    const d = new Date();
                                    const istOffset = 5.5 * 60 * 60 * 1000;
                                    const istTime = new Date(d.getTime() + istOffset);
                                    const today = `${istTime.getUTCFullYear()}-${String(istTime.getUTCMonth() + 1).padStart(2, '0')}-${String(istTime.getUTCDate()).padStart(2, '0')}`;
                                    updateDate(today);
                                }}
                                className="text-[10px] font-black text-amber-600 bg-amber-50 px-2 py-1 rounded-lg border border-amber-100 hover:bg-amber-100 transition-colors uppercase flex-shrink-0 shadow-sm"
                            >
                                Today
                            </button>
                            <div className="flex items-center flex-1 min-w-0 pr-1">
                                <input
                                    type="date"
                                    className="bg-transparent text-[11px] font-bold text-slate-700 outline-none w-full"
                                    value={selectedDate}
                                    onChange={(e) => updateDate(e.target.value)}
                                />
                                {selectedDate && (
                                    <button onClick={() => updateDate('')} className="ml-1 p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full">
                                        <X size={12} />
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="bg-slate-900 text-white rounded-xl flex-shrink-0 flex items-center gap-1.5 px-3 py-2 shadow-sm">
                        <span className="text-sm font-black tracking-tighter">{pagination.total}</span>
                        <span className="text-[9px] font-bold opacity-60 uppercase tracking-widest">Bills</span>
                    </div>
                </div>

                {/* Row 3: Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                        type="text"
                        className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-100 outline-none shadow-inner"
                        placeholder="Search Bill or Customer..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={handleKeyPress}
                    />
                </div>

                {/* Staff Filter Chip */}
                {userId && (
                    <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 px-3 py-2 rounded-xl">
                        <UserIcon size={14} className="text-indigo-600" />
                        <span className="text-[10px] font-black text-indigo-700 uppercase tracking-tight">
                            Viewing: {userName || 'Selected User'}
                        </span>
                        <button 
                            onClick={clearUserFilter}
                            className="ml-auto p-1 bg-white text-indigo-400 hover:text-indigo-600 rounded-full shadow-sm"
                        >
                            <X size={12} />
                        </button>
                    </div>
                )}
            </div>

            {/* List */}
            <div className="p-3 space-y-2 flex-1">
                {loading ? (
                    <div className="flex justify-center py-10">
                        <Loader className="animate-spin text-indigo-500" />
                    </div>
                ) : orders.length === 0 ? (
                    <div className="text-center py-10 text-slate-400">No orders found.</div>
                ) : (
                    orders.map(order => (
                        <Link
                            to={order.status === 'inedit' ? `/orders/edit/${order.id}` : `/orders/${order.id}`}
                            key={order.id}
                            className="block bg-white border border-slate-200 rounded-lg p-2.5 hover:border-indigo-300 hover:shadow-sm active:scale-[0.99] transition-all group relative"
                        >
                            <div className="flex justify-between items-start">
                                {/* Left Content */}
                                <div className="min-w-0 flex-1 pr-2">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="font-bold text-slate-800 text-sm truncate">
                                            {order.ledger?.name || 'Unknown Customer'}
                                        </h3>
                                        {/* Status moved next to name for compactness */}
                                        {order.status === 'pending' && (
                                            <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded uppercase tracking-wide">Pending</span>
                                        )}
                                        {order.status === 'fetched' && (
                                            <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded uppercase tracking-wide">Synced</span>
                                        )}
                                        {/* Order Type Badge */}
                                        <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded uppercase tracking-wide border border-indigo-100">
                                            {order.order_type || 'Tax Invoice'}
                                        </span>
                                    </div>

                                    {/* Meta Row - Single Line if possible */}
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                                        <span className="flex items-center gap-1 font-medium bg-slate-50 px-1.5 py-0.5 rounded">
                                            <FileText size={10} className="text-slate-400" />
                                            <span className="truncate max-w-[80px]">{order.bill_number || '-'}</span>
                                        </span>
                                        <span className="flex items-center gap-1 font-medium bg-slate-50 px-1.5 py-0.5 rounded">
                                            <Calendar size={10} className="text-slate-400" />
                                            {new Date(order.date).toLocaleDateString()}
                                        </span>
                                        {order.creator && (
                                            <span className="text-[10px] font-semibold text-slate-400">
                                                By {order.creator.username}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Right: Amount & Actions */}
                                <div className="text-right flex-shrink-0">
                                    <div className="text-base font-black text-slate-800 tracking-tight leading-none">
                                        ₹{Math.round(parseFloat(order.total_amount)).toLocaleString('en-IN')}
                                    </div>

                                    <div className="flex items-center justify-end gap-1.5 mt-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                        {order.status === 'inedit' && (
                                            <div className="flex gap-1">
                                                <button
                                                    onClick={(e) => handleSync(e, order.id)}
                                                    className="p-1 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors flex items-center gap-1 border border-slate-100"
                                                    title="Mark for Tally Sync"
                                                >
                                                    <ArrowRight size={14} className="rotate-[-45deg]" />
                                                    <span className="text-[10px] font-bold uppercase pr-1">Sync</span>
                                                </button>
                                                <button
                                                    onClick={(e) => handleDelete(e, order.id)}
                                                    className="p-1 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded transition-colors border border-slate-100"
                                                    title="Delete Order"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        )}
                                        <span className="p-1 text-slate-200 group-hover:text-indigo-500 transition-colors">
                                            <ArrowRight size={16} strokeWidth={2.5} />
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </Link>
                    ))
                )}
            </div>

            {/* Pagination Controls - Fixed Bottom */}
            {!loading && orders.length > 0 && (
                <div className="fixed bottom-[56px] left-0 right-0 bg-white border-t border-slate-200 p-2 px-4 flex items-center justify-between shadow-up-lg z-10">
                    <span className="text-xs font-bold text-slate-500">
                        Page {pagination.page} of {pagination.totalPages}
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={() => goToPage(pagination.page - 1)}
                            disabled={pagination.page <= 1}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 rounded text-xs font-bold transition-colors"
                        >
                            Previous
                        </button>
                        <button
                            onClick={() => goToPage(pagination.page + 1)}
                            disabled={pagination.page >= pagination.totalPages}
                            className="px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 rounded text-xs font-bold transition-colors"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
