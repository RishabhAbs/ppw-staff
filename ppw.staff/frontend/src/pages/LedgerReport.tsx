import { useEffect, useState, useCallback } from 'react';
import { getLedgers, syncLedgers } from '../api';
import { Loader, Search, User, RefreshCw } from 'lucide-react';

interface Ledger {
    id: number;
    name: string;
    gstin?: string;
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
                        <h3 className="text-lg font-bold text-slate-800">Syncing Ledgers</h3>
                        <p className="text-sm text-slate-500 mt-1">Fetching latest data from Tally...</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function LedgerReport() {
    const [ledgers, setLedgers] = useState<Ledger[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 });
    const [isSyncing, setIsSyncing] = useState(false);

    const fetchData = useCallback(async (page: number, search: string) => {
        setLoading(true);
        try {
            const result = await getLedgers(page, 50, search);
            setLedgers(result.data);
            setPagination(result.pagination || { page: 1, limit: 50, total: 0, totalPages: 0 });
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData(1, '');
    }, [fetchData]);

    // Auto-search with debounce (no need to press Enter)
    useEffect(() => {
        const timer = setTimeout(() => {
            fetchData(1, searchTerm);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm, fetchData]);

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') fetchData(1, searchTerm);
    };

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            await syncLedgers();
            await fetchData(1, ''); // Refresh data after sync
            // alert('Sync Complete'); // Optional: Modal handles "busy" state nicely
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

    return (
        <div className="flex flex-col h-full bg-slate-50 min-h-screen pb-20">
            {isSyncing && <SyncModal />}

            {/* Simple Header */}
            <div className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-20 shadow-sm space-y-3">
                <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                        <img src="/ppw-logo.png" alt="Logo" className="w-8 h-8 object-contain" />
                        <h1 className="text-xl font-bold text-slate-800">Ledger Report</h1>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-xs font-medium text-slate-500">
                            {pagination.total.toLocaleString()} Records
                        </span>
                        <button
                            onClick={handleSync}
                            disabled={isSyncing}
                            className="flex items-center gap-2 bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-100 disabled:opacity-50"
                        >
                            <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
                            {isSyncing ? 'Syncing...' : 'Sync Now'}
                        </button>
                    </div>
                </div>
                {/* Search Bar - Dense */}
                <div className="relative">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                    <input
                        type="text"
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="Search by Name, Phone or GST..."
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
                ) : ledgers.length === 0 ? (
                    <div className="text-center py-10 text-slate-400">No ledgers found.</div>
                ) : (
                    ledgers.map((l, i) => (
                        <div key={l.id} className="bg-white border border-slate-200 rounded-lg p-3 hover:bg-slate-50 shadow-sm flex items-center gap-3">
                            <div className="bg-indigo-50 text-indigo-600 font-bold text-xs h-8 w-8 flex items-center justify-center rounded-lg">
                                {(pagination.page - 1) * pagination.limit + i + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="font-bold text-slate-800 text-sm truncate">{l.name}</h4>
                                <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                                    <User size={10} /> {l.gstin || 'No GSTIN'}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Pagination Controls - Static Footer */}
            {!loading && ledgers.length > 0 && (
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
