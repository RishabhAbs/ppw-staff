import { useState, useEffect, useRef } from 'react';
import { Search, Save, Store, Warehouse, ArrowLeft, RefreshCw } from 'lucide-react';
import { getStockItems, createGodownEntry, getGodownEntries, updateGodownEntry } from '../api';

export default function Godown() {
    // Mode: 'select' = choose godown, 'entry' = enter items
    const [mode, setMode] = useState<'select' | 'entry'>('select');
    const [activeGodown, setActiveGodown] = useState<'shop' | 'pan' | null>(null);

    const [search, setSearch] = useState('');
    const [recentEntries, setRecentEntries] = useState<any[]>([]);
    const [editingEntryId, setEditingEntryId] = useState<number | null>(null);

    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [selectedItem, setSelectedItem] = useState<any | null>(null);
    const [quantity, setQuantity] = useState('');
    const [loading, setLoading] = useState(false);

    const searchInputRef = useRef<HTMLInputElement>(null);
    const quantityInputRef = useRef<HTMLInputElement>(null);

    // Fetch entries on mount
    useEffect(() => {
        fetchEntries();
    }, []);

    // Debounced Search
    useEffect(() => {
        const timer = setTimeout(() => {
            if (search.length >= 2) {
                fetchItems();
            } else {
                setSearchResults([]);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [search]);

    // Auto-focus search when entering "entry" mode or after save
    useEffect(() => {
        if (mode === 'entry' && !selectedItem) {
            // Small timeout to allow render
            setTimeout(() => searchInputRef.current?.focus(), 100);
        }
    }, [mode, selectedItem]);

    const fetchItems = async () => {
        try {
            const data = await getStockItems(1, 1000, search);
            const items = data?.data;
            if (Array.isArray(items)) {
                setSearchResults(items);
            } else {
                // Determine if data itself is array (old backend format?)
                if (Array.isArray(data)) {
                    setSearchResults(data);
                } else {
                    setSearchResults([]);
                }
            }
        } catch (error) {
            console.error(error);
            setSearchResults([]);
        }
    };




    // Godown Entry Search State
    const [entrySearch, setEntrySearch] = useState('');

    // Pagination State
    const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });

    const fetchEntries = async (page = 1, searchQuery = entrySearch) => {
        try {
            const result = await getGodownEntries(page, 10, searchQuery);
            // Defensive Check: Handle backend returning plain array OR paginated object
            if (Array.isArray(result)) {
                setRecentEntries(result);
                // If array, we don't have pagination info, so keep defaults or heuristic
            } else if (result && Array.isArray(result.data)) {
                setRecentEntries(result.data);
                setPagination(result.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
            } else {
                console.warn("Invalid API response format", result);
                setRecentEntries([]);
            }
        } catch (error) {
            console.error(error);
            setRecentEntries([]);
        }
    };

    // Initial fetch on mount
    useEffect(() => {
        fetchEntries(1, '');
    }, []);

    // Debounced Search for Entries
    useEffect(() => {
        const timer = setTimeout(() => {
            fetchEntries(1, entrySearch);
        }, 500);
        return () => clearTimeout(timer);
    }, [entrySearch]);


    const handleGodownSelect = (godown: 'shop' | 'pan') => {
        setActiveGodown(godown);
        setMode('entry');
    };

    const handleSelect = (item: any) => {
        setSelectedItem(item);
        setSearch(''); // Keep search empty to show item name clearly in a separate badge or just input
        setSearchResults([]);
        // Focus quantity immediately
        setTimeout(() => quantityInputRef.current?.focus(), 100);
    };

    const handleEdit = (entry: any) => {
        setEditingEntryId(entry.id);
        setActiveGodown(entry.godown);
        setSelectedItem({ masterid: entry.item_id, name: entry.item_name });
        setQuantity(entry.quantity.toString());
        setMode('entry');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleSave = async () => {
        if (!selectedItem || !quantity || !activeGodown) return;
        setLoading(true);
        try {
            const payload = {
                godown: activeGodown,
                item_id: selectedItem.masterid,
                item_name: selectedItem.name,
                quantity: Number(quantity)
            };

            if (editingEntryId) {
                await updateGodownEntry(editingEntryId, payload);
                alert('Entry updated!');
            } else {
                await createGodownEntry(payload);
            }

            // Reset
            setSelectedItem(null);
            setQuantity('');
            setEditingEntryId(null);
            fetchEntries(pagination.page); // Refresh list
        } catch (error) {
            alert('Failed to save');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    // Step 1: Selection Screen
    if (mode === 'select') {
        return (
            <div className="p-6 space-y-8 flex flex-col items-center justify-center min-h-[60vh]">
                <div className="text-center space-y-2">
                    <img src="/ppw-logo.png" alt="Logo" className="w-16 h-16 mx-auto mb-4 object-contain" />
                    <h2 className="text-3xl font-bold text-slate-900">Select Location</h2>
                    <p className="text-slate-500">Where are you adding stock?</p>
                </div>

                <div className="grid grid-cols-1 w-full max-w-sm gap-4">
                    <button
                        onClick={() => handleGodownSelect('shop')}
                        className="p-6 rounded-3xl bg-indigo-50 border-2 border-indigo-100 text-indigo-900 shadow-md hover:bg-indigo-100 hover:border-indigo-300 transition-all active:scale-95 flex flex-col items-center gap-3"
                    >
                        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm text-indigo-600">
                            <Store size={32} />
                        </div>
                        <span className="text-xl font-bold">Shop</span>
                    </button>
                    {/* Added PAN option if needed, usually just one logic but let's keep it robust */}
                </div>
            </div>
        );
    }

    // Step 2: Entry Screen (Continuous Loop)
    return (
        <div className="p-4 space-y-6 pb-24">
            {/* Header / Context */}
            <div className={`p-4 rounded-2xl flex items-center justify-between border ${editingEntryId ? 'bg-amber-50 border-amber-200' : (activeGodown === 'shop' ? 'bg-indigo-50 border-indigo-100 text-indigo-900' : 'bg-pink-50 border-pink-100 text-pink-900')}`}>
                <div className="flex items-center gap-3">
                    <button onClick={() => { setMode('select'); setEditingEntryId(null); setSelectedItem(null); setQuantity(''); }} className="p-2 rounded-full hover:bg-white/50 transition-colors">
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <p className="text-xs font-bold opacity-60 uppercase tracking-wider">{editingEntryId ? 'Editing Entry' : 'Adding To'}</p>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            {activeGodown === 'shop' ? <Store size={20} /> : <Warehouse size={20} />}
                            {activeGodown === 'shop' ? 'Shop' : 'Pan'}
                        </h2>
                    </div>
                </div>
            </div>

            {/* Entry Form */}
            <div className="space-y-4">
                {/* Search Bar - Always Visible if no item selected */}
                {!selectedItem ? (
                    <div className="relative z-20 animate-fade-in">
                        <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Search Item</label>
                        <div className="relative">
                            <input
                                ref={searchInputRef}
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Type item name..."
                                className="w-full p-4 pl-12 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:border-indigo-500 shadow-sm text-lg"
                            />
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={24} />
                        </div>

                        {/* Dropdown Results */}
                        {searchResults && Array.isArray(searchResults) && searchResults.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-slate-100 max-h-60 overflow-y-auto p-2 z-50">
                                {searchResults.map((item) => (
                                    <div
                                        key={item.masterid}
                                        onClick={() => handleSelect(item)}
                                        className="p-4 hover:bg-slate-50 rounded-xl cursor-pointer flex justify-between items-center group border-b border-slate-50 last:border-0"
                                    >
                                        <span className="font-bold text-slate-700 text-lg group-hover:text-indigo-600">{item.name}</span>
                                        <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-md mb-auto mt-1">{item.closing_balance} {item.units}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    /* Selected Item & Quantity Input */
                    <div className="animate-fade-in space-y-4">
                        {/* Selected Item Card */}
                        <div className="p-4 bg-white border border-indigo-100 rounded-2xl shadow-sm flex justify-between items-center relative overflow-hidden">
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500"></div>
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase">Selected Item</p>
                                <h3 className="text-xl font-bold text-slate-800">{selectedItem.name}</h3>
                            </div>
                            <button
                                onClick={() => { setSelectedItem(null); setSearch(''); }}
                                className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-red-500 rounded-full transition-colors"
                            >
                                <RefreshCw size={20} />
                            </button>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Enter Quantity</label>
                            <input
                                ref={quantityInputRef}
                                type="number"
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                                placeholder="Qty"
                                className="w-full p-4 bg-white border-2 border-indigo-500 rounded-2xl focus:outline-none shadow-lg shadow-indigo-50 font-bold text-2xl text-center"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-2">
                            <button
                                onClick={() => { setSelectedItem(null); setEditingEntryId(null); setQuantity(''); }}
                                className="py-4 rounded-xl font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={loading || !quantity}
                                className={`py-4 rounded-xl font-bold text-white shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform ${activeGodown === 'shop' ? 'bg-indigo-600 shadow-indigo-200' : 'bg-pink-600 shadow-pink-200'
                                    }`}
                            >
                                <Save size={20} />
                                {editingEntryId ? 'Update Entry' : 'Save & Next'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Recent Entries List */}
            {!selectedItem && (
                <div className="space-y-4 pt-4 border-t border-slate-200">

                    <div className="flex flex-col space-y-3">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-bold text-slate-800">Recent Entries</h3>
                            <span className="text-xs text-slate-500 font-bold">Page {pagination.page} / {pagination.totalPages || 1}</span>
                        </div>

                        {/* Entry Search Bar */}
                        <div className="relative">
                            <input
                                type="text"
                                value={entrySearch}
                                onChange={(e) => setEntrySearch(e.target.value)}
                                placeholder="Search recent entries..."
                                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                            />
                            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                        </div>
                    </div>
                    {recentEntries.length === 0 ? (
                        <p className="text-slate-400 text-sm text-center py-4">No entries found.</p>
                    ) : (
                        <div className="space-y-3">
                            {Array.isArray(recentEntries) && recentEntries.map((entry) => (
                                <div key={entry.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-center">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${entry.godown === 'shop' ? 'bg-indigo-50 text-indigo-600' : 'bg-pink-50 text-pink-600'}`}>
                                                {entry.godown}
                                            </span>
                                            <span className="text-xs text-slate-400 flex items-center gap-1">
                                                <span className="font-bold text-slate-600">{entry.user?.name || entry.user?.username || entry.user_name || 'Unknown'}</span>
                                            </span>
                                        </div>
                                        <h4 className="font-bold text-slate-800">{entry.item_name}</h4>
                                        <p className="text-sm font-bold text-slate-600">Qty: {entry.quantity}</p>
                                    </div>
                                    <button
                                        onClick={() => handleEdit(entry)}
                                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors"
                                    >
                                        <ArrowLeft size={18} className="rotate-180" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    {/* Pagination Controls */}
                    {pagination.totalPages > 1 && (
                        <div className="flex justify-between items-center pt-2">
                            <button
                                onClick={() => fetchEntries(pagination.page - 1)}
                                disabled={pagination.page <= 1}
                                className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs disabled:opacity-50 hover:bg-slate-200"
                            >
                                Previous
                            </button>
                            <button
                                onClick={() => fetchEntries(pagination.page + 1)}
                                disabled={pagination.page >= pagination.totalPages}
                                className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs disabled:opacity-50 hover:bg-slate-200"
                            >
                                Next
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
