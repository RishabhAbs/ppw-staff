import { useEffect, useState, useCallback } from 'react';
import { getStockItems, syncStockItems, getUser } from '../api';
import { Loader, Search, ChevronDown, Tag, Scan, RefreshCw, Plus, Image as ImageIcon, Video } from 'lucide-react';
import ItemDetailsPage from '../components/ItemDetailsPage';

interface StockItem {
    masterid: string;
    name: string;
    parent: string;
    base_units: string;
    hsn: string;
    closing_balance: string;
    opening_balance: string;
    gst: string;
    default_mrp: string;
    ats_barcode: string;
    rate_1: string;
    rate_2: string;
    rate_3: string;
    rate_3a: string;
    rate_4: string;
    imageCount?: number;
    videoCount?: number;
}

interface Pagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

// Sync Modal Component
function SyncModal() {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm relative">
                <div className="flex flex-col items-center text-center space-y-4">
                    <div className="relative">
                        <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-500 rounded-full animate-spin"></div>
                        <RefreshCw className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-600" size={24} />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">Syncing Items</h3>
                        <p className="text-sm text-slate-500 mt-1">Fetching latest stock data...</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function StockReport() {
    const [items, setItems] = useState<StockItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 });
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [isSyncing, setIsSyncing] = useState(false);
    const [showItemDetails, setShowItemDetails] = useState(false);
    const isAdmin = getUser()?.role === 'admin';

    const fetchData = useCallback(async (page: number, search: string) => {
        setLoading(true);
        try {
            const result = await getStockItems(page, 50, search);
            setItems(result.data);
            setPagination(result.pagination);
            setExpandedIds(new Set());
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, []);

    // Initial fetch and Search change
    useEffect(() => {
        fetchData(1, searchTerm);
    }, [fetchData, searchTerm]);



    const handleSearch = () => {
        fetchData(1, searchTerm);
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSearch();
    };

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            await syncStockItems();
            await fetchData(1, '');
        } catch (error) {
            console.error('Sync failed', error);
            alert('Sync Failed');
        } finally {
            setIsSyncing(false);
        }
    };

    const goToPage = (page: number) => {
        if (page >= 1 && page <= pagination.totalPages) {
            fetchData(page, searchTerm);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    const toggleExpand = (id: string) => {
        const newExpanded = new Set(expandedIds);
        if (newExpanded.has(id)) {
            newExpanded.delete(id);
        } else {
            newExpanded.add(id);
        }
        setExpandedIds(newExpanded);
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 min-h-screen pb-20 relative">
            {isSyncing && <SyncModal />}
            {showItemDetails && <ItemDetailsPage onClose={() => setShowItemDetails(false)} />}


            {/* FAB for Item Details */}
            <button
                onClick={() => setShowItemDetails(true)}
                className="fixed bottom-24 right-5 w-14 h-14 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:bg-indigo-700 active:scale-95 transition-all z-40 group border-4 border-white"
                title="Add / Manage Item Details"
            >
                <Plus size={24} strokeWidth={3} className="group-hover:rotate-90 transition-transform" />
            </button>

            {/* Simple Header */}
            <div className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-20 shadow-sm space-y-3">
                <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                        <img src="/ppw-logo.png" alt="Logo" className="w-8 h-8 object-contain" />
                        <h1 className="text-xl font-bold text-slate-800">Inventory</h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-xs font-medium text-slate-500">
                            {pagination.total.toLocaleString()} Items
                        </span>
                        {isAdmin && (
                            <button
                                onClick={handleSync}
                                disabled={isSyncing}
                                className="flex items-center gap-2 bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-100 disabled:opacity-50"
                            >
                                <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
                                {isSyncing ? 'Syncing...' : 'Sync Now'}
                            </button>
                        )}
                    </div>
                </div>
                {/* Search Bar - Dense */}
                <div className="relative">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                    <input
                        type="text"
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="Search name, barcode, category..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={handleKeyPress}
                    />
                </div>
            </div>

            {/* List */}
            <div className="p-3 space-y-2 flex-1">
                {loading ? (
                    <div className="flex justify-center py-10">
                        <Loader className="animate-spin text-indigo-500" />
                    </div>
                ) : items.length === 0 ? (
                    <div className="text-center py-10 text-slate-400">No products found.</div>
                ) : (
                    items.map(item => {
                        const isExpanded = expandedIds.has(item.masterid);
                        return (
                            <div key={item.masterid} className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                                <div
                                    className="p-3 flex justify-between items-start cursor-pointer hover:bg-slate-50 relative"
                                    onMouseDown={() => toggleExpand(item.masterid)}
                                >
                                    <div className="flex-1 min-w-0 pr-2">
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded uppercase">{item.parent || 'Item'}</span>
                                            {item.gst && <span className="text-[10px] font-bold bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded border border-orange-100">GST {item.gst}%</span>}
                                        </div>
                                        <h4 className="font-bold text-slate-800 text-sm truncate">{item.name}</h4>
                                        <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
                                            <span className="flex items-center gap-1 font-medium bg-slate-50 px-1.5 py-0.5 rounded">
                                                <Tag size={12} /> ₹{item.default_mrp}
                                            </span>
                                            <span className="flex items-center gap-1 text-slate-400">
                                                <Scan size={12} /> {item.ats_barcode}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="text-right flex flex-col items-end gap-2">
                                        {/* Media badge: X/4 images, X/2 videos uploaded for this item */}
                                        <div className="flex items-center gap-1">
                                            <span className="flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
                                                <ImageIcon size={10} /> {item.imageCount ?? 0}/4
                                            </span>
                                            <span className="flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-100">
                                                <Video size={10} /> {item.videoCount ?? 0}/2
                                            </span>
                                        </div>
                                        <div className="font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-1 rounded text-sm min-w-[60px] text-center">
                                            {item.closing_balance || '0'} <span className="text-[10px] text-slate-400 font-normal">{item.base_units}</span>
                                        </div>
                                        <ChevronDown size={16} className={`text-slate-300 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                    </div>
                                </div>

                                {/* Expanded Details */}
                                {isExpanded && (
                                    <div className="bg-slate-50 border-t border-slate-100 p-3 text-xs">
                                        <div className="grid grid-cols-2 gap-4 mb-3">
                                            <div>
                                                <span className="font-bold text-slate-400 uppercase tracking-wide block mb-1">HSN Code</span>
                                                <span className="font-mono text-slate-700">{item.hsn || '-'}</span>
                                            </div>
                                        </div>

                                        <div className="mb-3">
                                            <span className="font-bold text-slate-400 uppercase tracking-wide block mb-1">Rates</span>
                                            <div className="grid grid-cols-4 gap-2">
                                                {[
                                                    { l: 'R1', v: item.rate_1 },
                                                    { l: 'R2', v: item.rate_2 },
                                                    { l: 'R3', v: item.rate_3 },
                                                    { l: 'R3a', v: item.rate_3a },
                                                    { l: 'R4', v: item.rate_4 },
                                                ].map((r, i) => (
                                                    <div key={i} className="bg-white border border-slate-200 rounded p-1.5 text-center">
                                                        <div className="text-[10px] text-slate-400 font-bold">{r.l}</div>
                                                        <div className="font-bold text-slate-700">₹{r.v || '-'}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                    </div>
                                )}
                            </div>
                        )
                    })
                )}
            </div>

            {/* Pagination Controls - Static Footer */}
            {!loading && items.length > 0 && (
                <div className="bg-white border-t border-slate-200 p-3 flex items-center justify-between shadow-sm mt-auto">
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
