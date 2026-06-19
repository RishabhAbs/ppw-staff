import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, ScanLine, Package, CheckCircle, AlertCircle, RefreshCw, X } from 'lucide-react';
import { getStockItems, updateItemBarcode, getItemByBarcode } from '../api';
import BarcodeScanner from '../components/BarcodeScanner';

interface StockItem {
    id: number;
    masterid: string;
    name: string;
    ats_barcode: string | null;
    closing_balance: string;
    base_units: string;
}

export default function AttachBarcode() {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [items, setItems] = useState<StockItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' });
    const [updating, setUpdating] = useState(false);

    // Debounce search
    useEffect(() => {
        const fetchItems = async () => {
            if (searchTerm.length < 4) {
                setItems([]);
                return;
            }
            setLoading(true);
            try {
                // Using existing getStockItems API
                const data = await getStockItems(1, 20, searchTerm);
                setItems(data.data || []);
            } catch (error) {
                console.error("Search failed:", error);
                setStatus({ type: 'error', message: 'Failed to search items' });
                setTimeout(() => setStatus({ type: null, message: '' }), 3000);
            } finally {
                setLoading(false);
            }
        };

        const timer = setTimeout(fetchItems, 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const handleResult = async (decodedText: string) => {
        setIsScanning(false);
        if (!selectedItem) return;

        setUpdating(true);
        try {
            try {
                const existingItem = await getItemByBarcode(decodedText);
                if (existingItem && typeof existingItem === 'object' && existingItem.masterid) {
                    if (existingItem.masterid !== selectedItem.masterid) {
                        setStatus({ 
                            type: 'error', 
                            message: `This QR code already exists for item: ${existingItem.name}` 
                        });
                        setTimeout(() => setStatus({ type: null, message: '' }), 5000);
                        setUpdating(false);
                        return;
                    }
                }
            } catch (e) {
                // Ignore API failures for pre-checking
            }

            await updateItemBarcode(selectedItem.masterid, decodedText);
            setStatus({ type: 'success', message: 'Barcode updated successfully!' });
            setSelectedItem({ ...selectedItem, ats_barcode: decodedText });
            
            // Optionally clear status
            setTimeout(() => setStatus({ type: null, message: '' }), 3000);
        } catch (error: any) {
            console.error("Failed to update barcode:", error);
            setStatus({ 
                type: 'error', 
                message: error.response?.data?.message || 'Failed to update barcode' 
            });
            setTimeout(() => setStatus({ type: null, message: '' }), 5000);
        } finally {
            setUpdating(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 min-h-screen">
            {/* Header */}
            <header className="bg-white px-4 py-4 sticky top-0 z-30 shadow-sm border-b border-slate-100">
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => navigate(-1)} 
                        className="p-2 -ml-2 rounded-full hover:bg-slate-100 active:bg-slate-200 transition-colors text-slate-600"
                    >
                        <ArrowLeft size={22} />
                    </button>
                    <div>
                        <h1 className="text-xl font-black text-slate-800 tracking-tight leading-none">Attach Barcode</h1>
                        <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">Database Sync</p>
                    </div>
                </div>
            </header>

            <main className="p-4 flex-1 overflow-y-auto space-y-6 pb-24">
                
                {/* Search Bar - only show if no item is selected */}
                {!selectedItem ? (
                    <div className="space-y-4">
                        <div className="relative">
                            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-400">
                                <Search size={18} />
                            </div>
                            <input
                                type="text"
                                placeholder="Search item (min 4 letters)..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-11 pr-4 py-3.5 bg-white border border-slate-200 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 placeholder:text-slate-400"
                            />
                            {loading && (
                                <div className="absolute inset-y-0 right-4 flex items-center">
                                    <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                                </div>
                            )}
                        </div>

                        {/* Search Results */}
                        {items.length > 0 && searchTerm.length >= 4 && (
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden divide-y divide-slate-50 animate-fade-in">
                                {items.map((item) => (
                                    <button
                                        key={item.masterid}
                                        onClick={() => setSelectedItem(item)}
                                        className="w-full text-left p-4 hover:bg-slate-50 active:bg-slate-100 transition-colors flex items-start gap-3"
                                    >
                                        <div className="p-2 bg-indigo-50 text-indigo-500 rounded-xl mt-0.5">
                                            <Package size={18} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-bold text-slate-800 text-sm leading-tight mb-1">{item.name}</h3>
                                            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                                <span>{item.closing_balance}</span>
                                                {item.ats_barcode && (
                                                    <>
                                                        <span>•</span>
                                                        <span className="text-emerald-500 flex items-center gap-1">
                                                            <CheckCircle size={10} /> Has Barcode
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}

                        {items.length === 0 && searchTerm.length >= 4 && !loading && (
                            <div className="text-center py-8 text-slate-400 font-medium bg-white rounded-2xl border border-slate-100 border-dashed">
                                No items found
                            </div>
                        )}
                        
                        {searchTerm.length < 4 && (
                            <div className="text-center py-8 text-slate-400 text-sm font-medium bg-white rounded-2xl border border-slate-100 border-dashed">
                                Enter at least 4 characters to search.
                            </div>
                        )}
                    </div>
                ) : (
                    // Selected Item View
                    <div className="space-y-6 animate-slide-up">
                         <button 
                            onClick={() => { setSelectedItem(null); setIsScanning(false); }}
                            className="text-xs font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-1 hover:text-indigo-700 active:scale-95 transition-all w-fit"
                        >
                            <ArrowLeft size={14} /> Back to Search
                        </button>

                        <div className="bg-white p-5 rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-slate-100">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                                    <Package size={24} />
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Item Details</p>
                                    <h2 className="text-lg font-black text-slate-800 leading-tight">{selectedItem.name}</h2>
                                </div>
                            </div>

                            <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-100 mt-4 text-center space-y-2">
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Current Barcode Value</p>
                                <p className={`text-xl font-black ${selectedItem.ats_barcode ? 'text-emerald-600' : 'text-slate-400'}`}>
                                    {selectedItem.ats_barcode || 'None attached'}
                                </p>
                            </div>
                        </div>

                        {!isScanning ? (
                            <button
                                onClick={() => setIsScanning(true)}
                                disabled={updating}
                                className="w-full flex items-center justify-center gap-2 p-4 bg-slate-900 active:bg-slate-800 text-white rounded-2xl font-bold shadow-xl shadow-slate-900/20 disabled:opacity-70 transition-all active:scale-[0.98]"
                            >
                                {updating ? (
                                    <><RefreshCw size={20} className="animate-spin" /> Updating...</>
                                ) : (
                                    <><ScanLine size={20} /> Scan Barcode</>
                                )}
                            </button>
                        ) : (
                            <div className="animate-fade-in">
                                <p className="text-center text-sm font-bold text-slate-500 mb-2 uppercase tracking-wide">
                                    Point camera at barcode
                                </p>
                                <BarcodeScanner
                                    onResult={handleResult}
                                    onClose={() => setIsScanning(false)}
                                />
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* Status Notification */}
            {status.message && (
                <div className={`fixed bottom-24 left-4 right-4 z-50 p-4 rounded-2xl shadow-xl flex items-center gap-3 animate-slide-up-fade ${
                    status.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
                }`}>
                    <div className="p-2 bg-white/20 rounded-full backdrop-blur-sm">
                        {status.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                    </div>
                    <span className="font-bold text-sm">
                        {status.message}
                    </span>
                    <button 
                        onClick={() => setStatus({ type: null, message: '' })}
                        className="ml-auto p-1 bg-white/20 rounded-full active:scale-95"
                    >
                        <X size={16} />
                    </button>
                </div>
            )}
        </div>
    );
}
