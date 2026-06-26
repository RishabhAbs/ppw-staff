import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getOrderById, getOrderDetails, deleteOrder, syncOrderToTally } from '../api';
import { ChevronLeft, User, Trash2, Share2, CheckCircle2, Edit, MessageSquare, X } from 'lucide-react';

interface Order {
    id: number;
    bill_number: string;
    date: string;
    total_amount: string;
    ledger?: {
        name: string;
        tally_guid?: string;
        address?: string;
        phone_number?: string;
        gstin?: string;
    };
    status: 'inedit' | 'pending' | 'fetched';
    customer_name?: string;
    customer_address?: string;
    customer_phone?: string;
    customer_gstin?: string;
    order_type?: string;
    remark?: string;
    amount_given?: string | number;
}

interface OrderDetail {
    id: number;
    stock_item: {
        name: string;
        default_mrp?: string;
    };
    item_name?: string;
    quantity: string;
    unit: string;
    rate: string;
    amount: string;
    gst: string;
    selected_scheme: string;
    discount_percentage: string;
    livestock_type?: string;
}

export default function OrderDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [order, setOrder] = useState<Order | null>(null);
    const [items, setItems] = useState<OrderDetail[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [showRemark, setShowRemark] = useState(false);
    const [showSettlementPopup, setShowSettlementPopup] = useState(false);
    const [selectedItemForDetail, setSelectedItemForDetail] = useState<OrderDetail | null>(null);

    useEffect(() => {
        if (id) {
            loadOrder(parseInt(id));
        }
    }, [id]);

    const loadOrder = async (orderId: number) => {
        setLoading(true);
        try {
            const [orderData, detailsData] = await Promise.all([
                getOrderById(orderId),
                getOrderDetails(orderId)
            ]);
            setOrder(orderData);

            setItems(detailsData);
        } catch (error) {
            console.error('Failed to load order', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (window.confirm('Are you sure you want to delete this order?')) {
            try {
                if (order) {
                    await deleteOrder(order.id);
                    navigate('/orders'); // Go back to history
                }
            } catch (error) {
                console.error('Failed to delete order', error);
                alert('Failed to delete order');
            }
        }
    };

    const handleSyncTally = async () => {
        if (!order) return;
        setSyncing(true);
        try {
            const result = await syncOrderToTally(order.id);
            if (result.success) {
                setOrder(prev => prev ? { ...prev, status: 'pending', ...result.data } : null);
                alert(`Synced! Status: Pending`);
            }
        } catch (error) {
            console.error('Failed to sync', error);
            alert('Failed to sync with Tally');
        } finally {
            setSyncing(false);
        }
    };



    if (loading) return <div className="p-6 text-center text-slate-500">Loading details...</div>;
    if (!order) return <div className="p-6 text-center text-slate-500">Order not found.</div>;



    // Lock actions if not in 'inedit' (Draft) status
    const isLocked = order.status !== 'inedit';

    return (
        <div className="flex flex-col h-full bg-slate-50 min-h-screen relative">
            {/* Header - Compact */}
            <div className="bg-white border-b border-slate-200 px-3 py-2 sticky top-0 z-20 shadow-sm flex items-center gap-2">
                <button onClick={() => navigate(-1)} className="p-1 rounded hover:bg-slate-100 -ml-1">
                    <ChevronLeft size={20} className="text-slate-600" />
                </button>
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <h1 className="text-sm font-bold text-slate-800 leading-none">Order #{order.bill_number || order.id}</h1>
                        <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded uppercase border border-indigo-100">
                            {order.order_type || 'Tax Invoice'}
                        </span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-medium">
                        {new Date(order.date).toLocaleDateString()}
                    </span>
                </div>
                {order.status === 'fetched' ? (
                    <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border border-emerald-200">
                        <CheckCircle2 size={10} /> Synced
                    </span>
                ) : order.status === 'pending' ? (
                     <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border border-amber-200">
                        <Share2 size={10} /> Pending
                    </span>
                ) : (
                    <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border border-slate-200">
                        <Edit size={10} /> Draft
                    </span>
                )}
            </div>

            <div className="p-2 space-y-2 pb-44">
                {/* 1. Customer Card - Compact */}
                <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 bg-indigo-50 rounded-full text-indigo-600">
                             <User size={14} strokeWidth={2.5} />
                        </div>
                        <h2 className="text-sm font-bold text-slate-900 truncate flex-1">{order.ledger?.name}</h2>
                         {order.ledger?.tally_guid ? (
                            <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">Synced</span>
                        ) : (
                            <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">Local</span>
                        )}
                    </div>
                    
                    {/* Customer Details */}
                    <div className="pl-7 space-y-1">
                        {(order.customer_address || order.ledger?.address) && (
                            <p className="text-[10px] text-slate-500 leading-snug">
                                {order.customer_address || order.ledger?.address}
                            </p>
                        )}
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                            {(order.customer_phone || order.ledger?.phone_number) && (
                                <p className="text-[10px] text-slate-600 font-medium flex items-center gap-1">
                                    <span className="text-slate-400">Ph:</span> {order.customer_phone || order.ledger?.phone_number}
                                </p>
                            )}
                            {(order.customer_gstin || order.ledger?.gstin) && (
                                <p className="text-[10px] text-slate-600 font-medium flex items-center gap-1">
                                    <span className="text-slate-400">GST:</span> {order.customer_gstin || order.ledger?.gstin}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* 2. Items List - Dense */}
                <div className="space-y-1.5">
                    <h3 className="px-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Items ({items.length})</h3>
                    {items.map((item, index) => (
                        <div 
                            key={item.id} 
                            onClick={() => setSelectedItemForDetail(item)}
                            className="bg-white p-2.5 rounded-lg border border-slate-200 flex items-start gap-2 active:scale-[0.98] transition-all hover:border-slate-300 cursor-pointer shadow-sm"
                        >
                            <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 h-fit mt-0.5">
                                {index + 1}
                            </span>
                            <div className="flex-1 pr-2 min-w-0">
                                <div className="flex items-start gap-1.5 flex-wrap">
                                    <h4 className="font-bold text-slate-800 text-xs leading-snug">
                                        {item.item_name || item.stock_item?.name || "Unknown Item"}
                                    </h4>
                                    {item.livestock_type && (
                                        <span className="text-[8px] font-bold text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded border border-indigo-100 whitespace-nowrap">
                                            {['Pb', 'Pan'].includes(item.livestock_type) ? 'PB' : item.livestock_type}
                                        </span>
                                    )}
                                </div>
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[10px] text-slate-500 font-medium">
                                        <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-bold">{item.quantity} {item.unit}</span>
                                        <span>x</span>
                                        <span>₹{parseFloat(item.rate).toLocaleString('en-IN')}</span>
                                        {item.selected_scheme && (
                                            <span className="text-slate-400 bg-slate-50 px-1 rounded border border-slate-100">
                                                ({item.selected_scheme})
                                            </span>
                                        )}
                                        {item.stock_item?.default_mrp && (
                                            <span className="text-indigo-600 bg-indigo-50 px-1 rounded border border-indigo-100 ml-1">
                                                MRP: {item.stock_item.default_mrp}
                                            </span>
                                        )}
                                        {parseFloat(item.discount_percentage) > 0 && (
                                            <span className="text-emerald-600 bg-emerald-50 px-1 rounded">-{item.discount_percentage}%</span>
                                        )}
                                    </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                                <span className="block font-bold text-slate-900 text-sm">₹{Math.round(parseFloat(item.amount)).toLocaleString('en-IN')}</span>
                                <span className="text-[10px] text-slate-500 font-bold bg-slate-50 px-1 rounded border border-slate-100">
                                    {parseFloat(item.gst) > 0 ? `${item.gst}% GST` : 'GST Exempt'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* 3. Footer - Compact & Fixed above Nav */}
            <div className="fixed bottom-[56px] left-0 right-0 bg-white border-t border-slate-200 p-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-30">
                <div 
                    onClick={() => order?.amount_given && setShowSettlementPopup(true)}
                    className={`flex justify-between items-end mb-3 p-2 -mx-2 rounded-xl transition-colors ${order?.amount_given ? 'hover:bg-slate-50 cursor-pointer' : ''}`}
                >
                    <div className="space-y-0.5">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                            Total Amount
                            {order?.amount_given && parseFloat(order.amount_given.toString()) > 0 && (
                                <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">Settled</span>
                            )}
                        </span>
                        {order?.amount_given && parseFloat(order.amount_given.toString()) > 0 && (
                            <p className="text-[10px] font-black text-slate-400">Tap to view settlement</p>
                        )}
                    </div>
                    <div className="text-xl font-black text-slate-900 leading-none">
                        ₹{Math.round(parseFloat(order?.total_amount || '0')).toLocaleString('en-IN')}
                    </div>
                </div>

                <div className={`gap-2 ${isLocked ? 'flex' : 'grid grid-cols-[1fr_1fr_1.5fr]'}`}>
                    {!isLocked && (
                        <>
                            <button
                                onClick={handleDelete}
                                className="py-2.5 font-bold rounded-lg active:scale-95 transition-transform flex items-center justify-center gap-1.5 bg-red-50 text-red-600 hover:bg-red-100"
                            >
                                <Trash2 size={16} />
                                <span className="text-[10px] uppercase">Delete</span>
                            </button>
                            <button
                                onClick={() => navigate(`/orders/edit/${order?.id}`)}
                                className="py-2.5 font-bold rounded-lg active:scale-95 transition-transform flex items-center justify-center gap-1.5 bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200"
                            >
                                <Edit size={16} />
                                <span className="text-[10px] uppercase">Edit</span>
                            </button>
                        </>
                    )}
                    <button
                        onClick={handleSyncTally}
                        disabled={syncing || isLocked}
                        className={`py-2.5 font-bold rounded-lg active:scale-95 transition-transform flex items-center justify-center gap-1.5 shadow-sm text-white flex-1 ${isLocked ? 'bg-slate-400 shadow-none cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                    >
                        {syncing ? <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> : <Share2 size={16} />}
                        <span className="text-[10px] uppercase">{order?.status === 'pending' ? 'Shared with Tally' : order?.status === 'fetched' ? 'Synced with Tally' : 'Share Tally'}</span>
                    </button>
                </div>
            </div>


            {/* Remark Modal */}
            {showRemark && (
                <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowRemark(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm relative" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setShowRemark(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={20} /></button>
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-full"><MessageSquare size={24} /></div>
                                <h3 className="text-lg font-bold text-slate-800">Order Remark</h3>
                            </div>
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-slate-700 font-medium leading-relaxed">{order?.remark}</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Settlement Popup */}
            {showSettlementPopup && order && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowSettlementPopup(false)}>
                    <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl p-6 pb-8 w-full max-w-md relative animate-in slide-in-from-bottom-5 mb-[56px] sm:mb-0" onClick={e => e.stopPropagation()}>
                        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6 sm:hidden" />
                        <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-6">Settlement Details</h3>
                        
                        <div className="space-y-4">
                            <div className="flex justify-between items-center text-sm font-bold p-4 bg-slate-50 rounded-xl border border-slate-100 text-slate-500">
                                <span>Bill Amount</span>
                                <span className="text-slate-900">₹{Math.round(parseFloat(order.total_amount)).toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm font-bold p-4 bg-slate-50 rounded-xl border border-slate-100 text-slate-500">
                                <span>AMOUNT Taken</span>
                                <span className="text-slate-900">₹{parseFloat(order.amount_given?.toString() || '0').toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between items-center text-lg font-black p-5 bg-emerald-50 rounded-xl border-2 border-emerald-100 text-emerald-600 shadow-sm shadow-emerald-100/50">
                                <span>RETURN TO CUSTOMER</span>
                                <span>₹{Math.abs(Math.round(parseFloat(order.amount_given?.toString() || '0') - parseFloat(order.total_amount))).toLocaleString('en-IN')}</span>
                            </div>
                        </div>
                        
                        <button onClick={() => setShowSettlementPopup(false)} className="w-full mt-6 py-4 bg-slate-900 text-white font-black rounded-xl">GOT IT</button>
                    </div>
                </div>
            )}

            {/* Item Detail Modal */}
            {selectedItemForDetail && (
                <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setSelectedItemForDetail(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                        <div className="bg-[#A36E4E] p-4 flex justify-between items-center">
                            <h3 className="text-white font-black uppercase text-xs tracking-widest">Item Details</h3>
                            <button onClick={() => setSelectedItemForDetail(null)} className="text-white/80 hover:text-white"><X size={20} /></button>
                        </div>
                        
                        <div className="p-5 space-y-6">
                            <div>
                                <h4 className="text-lg font-black text-slate-800 leading-tight mb-1">{selectedItemForDetail.item_name || selectedItemForDetail.stock_item?.name}</h4>
                                <div className="flex gap-2">
                                    {selectedItemForDetail.livestock_type && (
                                        <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 uppercase tracking-tight">
                                            {selectedItemForDetail.livestock_type} Stock
                                        </span>
                                    )}
                                    {parseFloat(selectedItemForDetail.discount_percentage) > 0 && (
                                        <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                            {selectedItemForDetail.discount_percentage}% OFF
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Quantity</span>
                                    <span className="text-base font-black text-slate-800">{selectedItemForDetail.quantity} {selectedItemForDetail.unit}</span>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Rate</span>
                                    <span className="text-base font-black text-slate-800">₹{parseFloat(selectedItemForDetail.rate).toLocaleString('en-IN')}</span>
                                </div>
                                {selectedItemForDetail.stock_item?.default_mrp && (
                                    <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100 col-span-2">
                                        <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest block mb-1">MRP Reference</span>
                                        <span className="text-base font-black text-indigo-600">₹{selectedItemForDetail.stock_item.default_mrp}</span>
                                    </div>
                                )}
                            </div>

                            <div className="border-t border-slate-100 pt-5">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-bold text-slate-500">Item Total</span>
                                    <span className="text-xl font-black text-slate-900">₹{Math.round(parseFloat(selectedItemForDetail.amount)).toLocaleString('en-IN')}</span>
                                </div>
                                <p className="text-[10px] text-right font-black text-slate-400 mt-1 uppercase tracking-widest">
                                    {parseFloat(selectedItemForDetail.gst) > 0 ? `${selectedItemForDetail.gst}% GST Included` : 'Tax Free / Exempted'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
