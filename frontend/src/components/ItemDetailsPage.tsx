import { useState, useEffect, useCallback, useRef } from 'react';
import { getStockItems, getItemDetails, saveItemDetails, getUser } from '../api';
import { ArrowLeft, Save, Undo2, Loader, Search, ImagePlus, Trash2, Pencil, Camera, Video, Crop, RefreshCw, Eye, X } from 'lucide-react';
import BarcodeScanner from './BarcodeScanner';
import MediaPicker from './MediaPicker';
import ImageEditor from './ImageEditor';
import ZoomableImage from './ZoomableImage';

interface StockItem {
    masterid: string;
    name: string;
    parent: string;
    ats_barcode: string;
    default_mrp: string;
    gst: string;
    base_units: string;
    hsn: string;
    closing_balance: string;
    rate_1: string;
    rate_2: string;
    rate_3: string;
    rate_3a: string;
    rate_4: string;
    photo_count?: number;
    video_count?: number;
}

interface ImageSlot {
    slot: number;
    file: File | null;
    previewUrl: string | null;
    serverUrl: string | null;
    originalName: string | null;
}

interface VideoSlot {
    slot: number;
    file: File | null;
    previewUrl: string | null;
    serverUrl: string | null;
    originalName: string | null;
    duration: number | null;
}

interface Props {
    onClose: () => void;
}

const emptyImageSlots = () => [1, 2, 3, 4].map(slot => ({ slot, file: null, previewUrl: null, serverUrl: null, originalName: null }));
const emptyVideoSlots = () => [1, 2].map(slot => ({ slot, file: null, previewUrl: null, serverUrl: null, originalName: null, duration: null }));

export default function ItemDetailsPage({ onClose }: Props) {
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<StockItem[]>([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
    const [description, setDescription] = useState('');
    const [savedDescription, setSavedDescription] = useState('');
    const [imageSlots, setImageSlots] = useState<ImageSlot[]>(emptyImageSlots());
    const [savedImageSlots, setSavedImageSlots] = useState<ImageSlot[]>(emptyImageSlots());
    const [videoSlots, setVideoSlots] = useState<VideoSlot[]>(emptyVideoSlots());
    const [savedVideoSlots, setSavedVideoSlots] = useState<VideoSlot[]>(emptyVideoSlots());
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [searchLoading, setSearchLoading] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [isEditingDesc, setIsEditingDesc] = useState(false);
    const [itemName, setItemName] = useState('');
    const [savedItemName, setSavedItemName] = useState('');
    const [isEditingName, setIsEditingName] = useState(false);
    const [showScanner, setShowScanner] = useState(false);
    const [activePicker, setActivePicker] = useState<{ type: 'image' | 'video', index: number } | null>(null);
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    // Per-slot "Edit" menu (Replace / Edit) and the in-place crop editor.
    const [editMenuIndex, setEditMenuIndex] = useState<number | null>(null);
    const [editImageIndex, setEditImageIndex] = useState<number | null>(null);
    const [viewImageUrl, setViewImageUrl] = useState<string | null>(null);
    const [viewVideoUrl, setViewVideoUrl] = useState<string | null>(null);
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const videoInputRefs = useRef<(HTMLInputElement | null)[]>([null, null]);

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    const searchItems = useCallback(async (term: string) => {
        if (term.length < 1) { setSearchResults([]); return; }
        setSearchLoading(true);
        try {
            const result = await getStockItems(1, 20, term);
            setSearchResults(result.data);
        } catch (e) { console.error(e); }
        finally { setSearchLoading(false); }
    }, []);

    useEffect(() => {
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = setTimeout(() => searchItems(searchTerm), 300);
        return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
    }, [searchTerm, searchItems]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    useEffect(() => {
        if (!selectedItem) return;
        const nameChanged = itemName !== savedItemName;
        const descChanged = description !== savedDescription;
        const imgChanged = imageSlots.some((s, i) => s.file !== null || s.serverUrl !== savedImageSlots[i].serverUrl);
        const vidChanged = videoSlots.some((s, i) => s.file !== null || s.serverUrl !== savedVideoSlots[i].serverUrl);
        setHasChanges(nameChanged || descChanged || imgChanged || vidChanged);
    }, [itemName, savedItemName, description, savedDescription, imageSlots, savedImageSlots, videoSlots, savedVideoSlots, selectedItem]);

    const loadItemDetails = useCallback(async (masterid: string) => {
        setLoading(true);
        try {
            const data = await getItemDetails(masterid);
            const desc = data.detail?.description || '';
            setDescription(desc);
            setSavedDescription(desc);

            const toUrl = (u: string) => (u.startsWith('http') || u.startsWith('/')) ? u : `/${u}`;
            // Media filenames are deterministic (e.g. <code>img3.webp), so after a
            // re-save the URL is unchanged and the browser serves the cached OLD
            // image. Append a per-load version param to force a fresh fetch.
            const v = Date.now();
            const bust = (u: string) => u + (u.includes('?') ? '&' : '?') + 'v=' + v;
            const rawSlots: ImageSlot[] = [1, 2, 3, 4].map(n => {
                const m = data.media?.find((x: any) => x.slot === `img${n}`);
                const url = m ? bust(toUrl(m.url)) : null;
                return { slot: n, file: null, previewUrl: url, serverUrl: url, originalName: m?.url_name || null };
            });
            const slots = compactImageSlots(rawSlots);
            setImageSlots(slots);
            setSavedImageSlots(JSON.parse(JSON.stringify(slots)));

            const vslots: VideoSlot[] = [1, 2].map(n => {
                const m = data.media?.find((x: any) => x.slot === `vid${n}`);
                const url = m ? bust(toUrl(m.url)) : null;
                return { slot: n, file: null, previewUrl: url, serverUrl: url, originalName: m?.url_name || null, duration: null };
            });
            setVideoSlots(vslots);
            setSavedVideoSlots(JSON.parse(JSON.stringify(vslots)));
            setIsEditingDesc(false);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, []);

    // Pack filled image slots toward the front (1, 2, 3...) so there are never
    // gaps between images. Slot numbers stay fixed; only the payloads move.
    const compactImageSlots = (slots: ImageSlot[]): ImageSlot[] => {
        const filled = slots.filter(s => s.previewUrl || s.file);
        const empties = slots.filter(s => !(s.previewUrl || s.file));
        const ordered = [...filled, ...empties];
        return slots.map((s, i) => ({
            slot: s.slot,
            file: ordered[i].file,
            previewUrl: ordered[i].previewUrl,
            serverUrl: ordered[i].serverUrl,
            originalName: ordered[i].originalName,
        }));
    };

    const handleSelectItem = (item: StockItem) => {
        setSelectedItem(item);
        setItemName(item.name);
        setSavedItemName(item.name);
        setSearchTerm(item.name);
        setShowDropdown(false);
        loadItemDetails(item.masterid);
    };

    const handleImageUpload = (slotIndex: number, file: File) => {
        const newSlots = [...imageSlots];
        newSlots[slotIndex] = { ...newSlots[slotIndex], file, previewUrl: URL.createObjectURL(file) };
        setImageSlots(newSlots);
    };

    // Result of the in-place crop/rotate editor: replace the slot's content with
    // the edited file so it re-uploads on save.
    const handleEditedImage = (slotIndex: number, file: File) => {
        const newSlots = [...imageSlots];
        if (newSlots[slotIndex].previewUrl && newSlots[slotIndex].file) {
            URL.revokeObjectURL(newSlots[slotIndex].previewUrl!);
        }
        newSlots[slotIndex] = { ...newSlots[slotIndex], file, previewUrl: URL.createObjectURL(file) };
        setImageSlots(newSlots);
    };

    const handleRemoveImage = (slotIndex: number) => {
        const newSlots = [...imageSlots];
        if (newSlots[slotIndex].previewUrl && newSlots[slotIndex].file) {
            URL.revokeObjectURL(newSlots[slotIndex].previewUrl!);
        }
        newSlots[slotIndex] = { ...newSlots[slotIndex], file: null, previewUrl: null, serverUrl: null, originalName: null };
        setImageSlots(compactImageSlots(newSlots));
    };

    // Move the content of one image slot into another position (slot numbers stay
    // fixed 1-4; only the file/preview/server payload travels). Items shift, they
    // don't swap, so dragging slot 1 onto slot 3 pushes 2 and 3 left by one.
    const reorderImages = (from: number, to: number) => {
        // Dropping onto an empty slot means "move to the end of the images" —
        // clamp the target to the last filled position so no gap is created.
        const filledCount = imageSlots.filter(s => s.previewUrl || s.file).length;
        const clampedTo = Math.min(to, Math.max(0, filledCount - 1));
        if (from === clampedTo) return;
        const payloads = imageSlots.map(s => ({
            file: s.file,
            previewUrl: s.previewUrl,
            serverUrl: s.serverUrl,
            originalName: s.originalName,
        }));
        const [moved] = payloads.splice(from, 1);
        payloads.splice(clampedTo, 0, moved);
        // Re-attach the fixed slot numbers, then compact so no gaps remain
        // (e.g. dropping onto an empty far slot snaps next to existing images).
        const newSlots = imageSlots.map((s, i) => ({ slot: s.slot, ...payloads[i] }));
        setImageSlots(compactImageSlots(newSlots));
    };

    const handleVideoUpload = (slotIndex: number, file: File) => {
        if (!file.type.startsWith('video/')) {
            alert('Please select a valid video file.');
            return;
        }
        const objectUrl = URL.createObjectURL(file);
        const vid = document.createElement('video');
        vid.preload = 'metadata';
        vid.onloadedmetadata = () => {
            URL.revokeObjectURL(vid.src);
            if (vid.duration > 15) {
                alert(`Video is ${vid.duration.toFixed(1)}s — maximum allowed is 15 seconds.`);
                return;
            }
            const previewUrl = URL.createObjectURL(file);
            const newSlots = [...videoSlots];
            newSlots[slotIndex] = { ...newSlots[slotIndex], file, previewUrl, originalName: file.name, duration: vid.duration };
            setVideoSlots(newSlots);
        };
        vid.src = objectUrl;
    };

    const handleRemoveVideo = (slotIndex: number) => {
        const newSlots = [...videoSlots];
        if (newSlots[slotIndex].previewUrl && newSlots[slotIndex].file) {
            URL.revokeObjectURL(newSlots[slotIndex].previewUrl!);
        }
        newSlots[slotIndex] = { ...newSlots[slotIndex], file: null, previewUrl: null, serverUrl: null, originalName: null, duration: null };
        setVideoSlots(newSlots);
    };

    const handleSave = async () => {
        if (!selectedItem) return;
        setSaving(true);
        try {
            const user = getUser();
            const formData = new FormData();
            formData.append('description', description);
            if (itemName !== savedItemName) formData.append('name', itemName);
            formData.append('user_id', user.id?.toString() || '0');

            const removedSlots = savedImageSlots
                .filter((s, i) => s.serverUrl && !imageSlots[i].serverUrl && !imageSlots[i].file)
                .map(s => s.slot);
            formData.append('removed_slots', JSON.stringify(removedSlots));

            // New uploads selected by the user.
            imageSlots.forEach(s => { if (s.file) formData.append(`image_${s.slot}`, s.file); });

            // Reordered server images: a slot now holds a server image different from
            // what was saved there (and isn't a fresh upload). Re-fetch it and send it
            // to its new slot so the backend rewrites the file under the correct name.
            const movedServerSlots = imageSlots.filter((s, i) =>
                s.serverUrl && !s.file && s.serverUrl !== savedImageSlots[i].serverUrl
            );
            await Promise.all(movedServerSlots.map(async (s) => {
                try {
                    const res = await fetch(s.serverUrl!);
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const blob = await res.blob();
                    // Guard: only re-upload if we actually got an image back. A proxy
                    // miss returns the HTML index page, which the backend would reject.
                    if (!blob.type.startsWith('image/')) {
                        throw new Error(`Unexpected content-type "${blob.type}"`);
                    }
                    const ext = (blob.type.split('/')[1] || 'jpg').split('+')[0];
                    const file = new File([blob], s.originalName || `slot${s.slot}.${ext}`, { type: blob.type });
                    formData.append(`image_${s.slot}`, file);
                } catch (err) {
                    console.error(`Failed to move image into slot ${s.slot}`, err);
                    throw new Error(`Could not move image into position ${s.slot}. Please try re-uploading it.`);
                }
            }));

            const removedVideoSlots = savedVideoSlots
                .filter((s, i) => s.serverUrl && !videoSlots[i].serverUrl && !videoSlots[i].file)
                .map(s => s.slot);
            formData.append('removed_video_slots', JSON.stringify(removedVideoSlots));

            videoSlots.forEach(s => { if (s.file) formData.append(`video_${s.slot}`, s.file); });

            await saveItemDetails(selectedItem.masterid, formData);
            await loadItemDetails(selectedItem.masterid);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 2500);
        } catch (e) {
            console.error(e);
            alert('Failed to save. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleDiscard = () => {
        setItemName(savedItemName);
        setDescription(savedDescription);
        setImageSlots(JSON.parse(JSON.stringify(savedImageSlots)));
        setVideoSlots(JSON.parse(JSON.stringify(savedVideoSlots)));
        setIsEditingDesc(false);
        setIsEditingName(false);
        setHasChanges(false);
    };

    return (
        <div className="fixed inset-0 z-[999] bg-slate-50 flex flex-col" style={{ animation: 'slideInRight 0.25s ease-out' }}>
            <style>{`
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes fadeInUp {
                    from { transform: translateY(8px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                @keyframes pulse-success {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
                    50% { box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
                }
            `}</style>

            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 shadow-sm shrink-0">
                <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 active:scale-90 transition-all">
                    <ArrowLeft size={20} className="text-slate-600" />
                </button>
                <div className="flex-1 min-w-0">
                    <h1 className="text-lg font-bold text-slate-800 leading-tight">Item Details</h1>
                    <p className="text-[11px] text-slate-400 font-medium">Manage item images & description</p>
                </div>
                {saveSuccess && (
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg" style={{ animation: 'fadeInUp 0.3s ease-out, pulse-success 1s ease-in-out 2' }}>
                        ✓ Saved
                    </span>
                )}
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto">
                <div className="p-4 space-y-4 pb-24">

                    {/* Item Selector */}
                    <div ref={dropdownRef} className="relative">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Select Item</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 text-slate-400" size={15} />
                            <input
                                type="text"
                                className="w-full pl-9 pr-12 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none shadow-sm transition-all"
                                placeholder="Search by name, barcode..."
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    setShowDropdown(true);
                                    if (!e.target.value) {
                                        setSelectedItem(null);
                                        setDescription(''); setSavedDescription('');
                                        setImageSlots(emptyImageSlots()); setSavedImageSlots(emptyImageSlots());
                                        setVideoSlots(emptyVideoSlots()); setSavedVideoSlots(emptyVideoSlots());
                                    }
                                }}
                                onFocus={() => searchTerm && setShowDropdown(true)}
                            />
                            <button onClick={() => setShowScanner(true)} className="absolute right-2 top-2 p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg transition-colors" title="Scan Barcode">
                                <Camera size={15} />
                            </button>
                            {searchLoading && <Loader className="absolute right-10 top-2.5 text-indigo-400 animate-spin" size={15} />}
                        </div>
                        {showScanner && (
                            <div className="z-50 relative">
                                <BarcodeScanner
                                    onResult={(text) => { setSearchTerm(text); searchItems(text); setShowDropdown(true); setShowScanner(false); }}
                                    onClose={() => setShowScanner(false)}
                                />
                            </div>
                        )}
                        {showDropdown && searchResults.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-56 overflow-y-auto z-30">
                                {searchResults.map((item) => (
                                    <button key={item.masterid} className="w-full px-3 py-2.5 text-left hover:bg-indigo-50 border-b border-slate-50 last:border-0 transition-colors" onClick={() => handleSelectItem(item)}>
                                        <div className="flex justify-between items-start gap-2">
                                            <div className="font-bold text-[13px] text-slate-800 truncate">{item.name}</div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <span className={`text-[9px] font-bold px-1 py-0.5 rounded border ${item.photo_count ? 'text-indigo-600 bg-indigo-50 border-indigo-100' : 'text-slate-300 bg-slate-50 border-slate-100'}`}>
                                                    {item.photo_count || 0}/4 P
                                                </span>
                                                <span className={`text-[9px] font-bold px-1 py-0.5 rounded border ${item.video_count ? 'text-violet-600 bg-violet-50 border-violet-100' : 'text-slate-300 bg-slate-50 border-slate-100'}`}>
                                                    {item.video_count || 0}/2 V
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-[10px] font-medium text-slate-400">{item.parent}</span>
                                            <span className="text-[10px] text-slate-300">•</span>
                                            <span className="text-[10px] font-mono text-slate-400">{item.ats_barcode}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Selected Item Info Card */}
                    {selectedItem && (
                        <div className="bg-gradient-to-r from-indigo-50 via-violet-50 to-purple-50 border border-indigo-100/60 rounded-2xl p-3.5" style={{ animation: 'fadeInUp 0.3s ease-out' }}>
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                        <span className="text-[9px] font-bold bg-white/80 text-indigo-600 px-1.5 py-0.5 rounded-full border border-indigo-100">{selectedItem.parent || 'Item'}</span>
                                        {selectedItem.gst && <span className="text-[9px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full border border-orange-100">GST {selectedItem.gst}%</span>}
                                    </div>
                                    <div className="flex items-start justify-between group mt-0.5">
                                        {isEditingName ? (
                                            <input type="text" autoFocus value={itemName} onChange={(e) => setItemName(e.target.value)} onBlur={() => { if (!itemName) setItemName(savedItemName); setIsEditingName(false); }} className="font-bold text-slate-800 text-[13px] leading-tight bg-white border border-indigo-200 rounded px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-indigo-500 w-full" />
                                        ) : (
                                            <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => setIsEditingName(true)}>
                                                <h3 className="font-bold text-slate-800 text-[13px] leading-tight">{itemName || selectedItem.name}</h3>
                                                <Pencil size={12} className="text-slate-400 group-hover:text-indigo-600 transition-colors shrink-0" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                                        <span className="font-semibold">₹{selectedItem.default_mrp}/{selectedItem.base_units}</span>
                                        <span className="font-mono text-slate-400 text-[10px]">{selectedItem.ats_barcode}</span>
                                    </div>
                                </div>
                                <div className="font-bold text-indigo-700 bg-white/80 px-2.5 py-1 rounded-lg text-[13px] border border-indigo-100 shrink-0">
                                    {selectedItem.closing_balance || '0'} <span className="text-[9px] text-indigo-400 font-medium">{selectedItem.base_units}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {loading && (
                        <div className="flex justify-center py-10">
                            <div className="w-10 h-10 border-3 border-indigo-100 border-t-indigo-500 rounded-full animate-spin"></div>
                        </div>
                    )}

                    {selectedItem && !loading && (
                        <>
                            {/* Description */}
                            <div style={{ animation: 'fadeInUp 0.3s ease-out 0.1s both' }}>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Item Description</label>
                                    {!isEditingDesc && (
                                        <button onClick={() => setIsEditingDesc(true)} className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-700 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-all active:scale-95">
                                            <Pencil size={12} /> Edit
                                        </button>
                                    )}
                                </div>
                                {isEditingDesc ? (
                                    <textarea autoFocus className="w-full bg-white border-2 border-indigo-200 rounded-xl p-3 text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-300 outline-none shadow-sm transition-all resize-none" rows={3} placeholder="Add a description about this item..." value={description} onChange={(e) => setDescription(e.target.value)} onBlur={() => { if (!description && !savedDescription) setIsEditingDesc(false); }} />
                                ) : (
                                    <div onClick={() => setIsEditingDesc(true)} className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm min-h-[48px] cursor-pointer hover:border-indigo-200 hover:bg-indigo-50/30 transition-all">
                                        {description ? <span className="text-slate-700 font-medium">{description}</span> : <span className="text-slate-400 italic text-[13px]">Tap to add description...</span>}
                                    </div>
                                )}
                            </div>

                            {/* Product Images */}
                            <div style={{ animation: 'fadeInUp 0.3s ease-out 0.2s both' }}>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Product Images</label>
                                    <span className="text-[10px] text-slate-400 font-medium">Drag to reorder</span>
                                </div>
                                <div className="grid grid-cols-4 gap-2">
                                    {imageSlots.map((slot, index) => (
                                        <div
                                            key={slot.slot}
                                            draggable={!!slot.previewUrl}
                                            onDragStart={(e) => { setDragIndex(index); e.dataTransfer.effectAllowed = 'move'; }}
                                            onDragOver={(e) => { if (dragIndex === null) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverIndex !== index) setDragOverIndex(index); }}
                                            onDragLeave={() => { if (dragOverIndex === index) setDragOverIndex(null); }}
                                            onDrop={(e) => { e.preventDefault(); if (dragIndex !== null) reorderImages(dragIndex, index); setDragIndex(null); setDragOverIndex(null); }}
                                            onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                                            className={`relative bg-white border-2 border-dashed rounded-xl aspect-square flex flex-col items-center justify-center overflow-hidden transition-all group ${slot.previewUrl ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${dragOverIndex === index ? 'border-indigo-500 ring-2 ring-indigo-300 scale-[1.03]' : 'border-slate-200 hover:border-indigo-300'} ${dragIndex === index ? 'opacity-40' : ''}`}
                                            onClick={() => { if (!slot.previewUrl) setActivePicker({ type: 'image', index }); }}
                                        >
                                            <div className="absolute top-1 left-1 w-4 h-4 rounded-full bg-slate-800/60 flex items-center justify-center z-10">
                                                <span className="text-[8px] font-bold text-white">{slot.slot}</span>
                                            </div>
                                            {slot.previewUrl ? (
                                                <>
                                                    <img src={slot.previewUrl} alt={`Image ${slot.slot}`} draggable={false} className="w-full h-full object-contain pointer-events-none" />
                                                    {/* View (open fullscreen zoomable viewer) */}
                                                    <button onClick={(e) => { e.stopPropagation(); setViewImageUrl(slot.previewUrl!); }} className="absolute top-1 right-[3.25rem] z-20 w-5 h-5 bg-indigo-600/80 text-white rounded-full flex items-center justify-center hover:bg-indigo-700 active:scale-90 transition-all shadow-md" title="View">
                                                        <Eye size={10} />
                                                    </button>
                                                    {/* Delete */}
                                                    <button onClick={(e) => { e.stopPropagation(); handleRemoveImage(index); }} className="absolute top-1 right-1 z-20 w-5 h-5 bg-red-500/90 text-white rounded-full flex items-center justify-center hover:bg-red-600 active:scale-90 transition-all shadow-md" title="Delete">
                                                        <Trash2 size={10} />
                                                    </button>
                                                    {/* Edit (opens Replace / Edit menu) */}
                                                    <button onClick={(e) => { e.stopPropagation(); setEditMenuIndex(editMenuIndex === index ? null : index); }} className="absolute top-1 right-7 z-20 w-5 h-5 bg-slate-800/70 text-white rounded-full flex items-center justify-center hover:bg-slate-900 active:scale-90 transition-all shadow-md" title="Edit">
                                                        <Pencil size={10} />
                                                    </button>
                                                    {editMenuIndex === index && (
                                                        <div className="absolute top-7 right-1 z-30 bg-white rounded-lg shadow-xl border border-slate-100 overflow-hidden w-28" onClick={(e) => e.stopPropagation()}>
                                                            <button onClick={() => { setEditMenuIndex(null); setViewImageUrl(slot.previewUrl!); }} className="w-full flex items-center gap-1.5 px-2.5 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                                                                <Eye size={12} className="text-indigo-500" /> View
                                                            </button>
                                                            <button onClick={() => { setEditMenuIndex(null); setActivePicker({ type: 'image', index }); }} className="w-full flex items-center gap-1.5 px-2.5 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50 transition-colors border-t border-slate-50">
                                                                <RefreshCw size={12} className="text-indigo-500" /> Replace
                                                            </button>
                                                            <button onClick={() => { setEditMenuIndex(null); setEditImageIndex(index); }} className="w-full flex items-center gap-1.5 px-2.5 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50 transition-colors border-t border-slate-50">
                                                                <Crop size={12} className="text-indigo-500" /> Edit
                                                            </button>
                                                        </div>
                                                    )}
                                                    {slot.file && (
                                                        <div className="absolute bottom-1 left-1">
                                                            <span className="text-[7px] font-bold text-white bg-emerald-500 px-1 py-0.5 rounded shadow">NEW</span>
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                <div className="flex flex-col items-center gap-0.5 text-slate-300">
                                                    <ImagePlus size={16} />
                                                    <span className="text-[8px] font-bold">Add</span>
                                                </div>
                                            )}

                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Product Videos */}
                            <div style={{ animation: 'fadeInUp 0.3s ease-out 0.3s both' }}>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Product Videos</label>
                                    <span className="text-[10px] text-slate-400 font-medium">Max 15 sec · MP4</span>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    {videoSlots.map((slot, index) => (
                                        <div
                                            key={slot.slot}
                                            className="relative bg-white border-2 border-dashed border-slate-200 rounded-xl overflow-hidden hover:border-violet-300 transition-all group cursor-pointer"
                                            style={{ aspectRatio: '16/10' }}
                                            onClick={() => { if (!slot.previewUrl) setActivePicker({ type: 'video', index }); }}
                                        >
                                            {/* Slot badge */}
                                            <div className="absolute top-1 left-1 w-4 h-4 rounded-full bg-slate-800/60 flex items-center justify-center z-10">
                                                <span className="text-[8px] font-bold text-white">{slot.slot}</span>
                                            </div>

                                            {slot.previewUrl ? (
                                                <>
                                                    <video
                                                        src={slot.previewUrl}
                                                        className="w-full h-full object-cover"
                                                        muted
                                                        playsInline
                                                        loop
                                                        onMouseEnter={e => (e.currentTarget as HTMLVideoElement).play()}
                                                        onMouseLeave={e => { const v = e.currentTarget as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                                                    />
                                                    {/* View (open fullscreen video player) */}
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setViewVideoUrl(slot.previewUrl!); }}
                                                        className="absolute top-1 right-7 w-5 h-5 bg-indigo-600/80 text-white rounded-full flex items-center justify-center hover:bg-indigo-700 active:scale-90 transition-all shadow-md z-10"
                                                        title="View"
                                                    >
                                                        <Eye size={10} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleRemoveVideo(index); }}
                                                        className="absolute top-1 right-1 w-5 h-5 bg-red-500/90 text-white rounded-full flex items-center justify-center hover:bg-red-600 active:scale-90 transition-all shadow-md z-10"
                                                    >
                                                        <Trash2 size={10} />
                                                    </button>
                                                    {/* Change overlay */}
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); videoInputRefs.current[index]?.click(); }}
                                                        className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-all flex items-center justify-center opacity-0 hover:opacity-100"
                                                    >
                                                        <span className="text-white text-[9px] font-bold bg-black/50 px-1.5 py-0.5 rounded">Change</span>
                                                    </button>
                                                    {slot.duration != null && (
                                                        <div className="absolute bottom-1 left-1 z-10">
                                                            <span className="text-[7px] font-bold text-white bg-black/60 px-1 py-0.5 rounded">{slot.duration.toFixed(1)}s</span>
                                                        </div>
                                                    )}
                                                    {slot.file && (
                                                        <div className="absolute bottom-1 right-1 z-10">
                                                            <span className="text-[7px] font-bold text-white bg-emerald-500 px-1 py-0.5 rounded shadow">NEW</span>
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-slate-300">
                                                    <Video size={18} />
                                                    <span className="text-[8px] font-bold">Add Video</span>
                                                </div>
                                            )}


                                        </div>
                                    ))}
                                </div>
                                {saving && videoSlots.some(s => s.file) && (
                                    <p className="text-[10px] text-violet-500 font-medium mt-1.5 flex items-center gap-1">
                                        <Loader size={10} className="animate-spin" /> Compressing video in background...
                                    </p>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Bottom Action Bar */}
            {selectedItem && !loading && (
                <div className="shrink-0 bg-white border-t border-slate-200 px-4 pt-3 pb-[5.5rem] flex gap-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]" style={{ animation: 'fadeInUp 0.3s ease-out' }}>
                    <button onClick={handleDiscard} disabled={!hasChanges || saving} className="flex-1 flex items-center justify-center gap-1.5 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold text-[13px] hover:bg-slate-200 disabled:opacity-30 transition-all active:scale-[0.97]">
                        <Undo2 size={15} /> Discard
                    </button>
                    <button onClick={handleSave} disabled={!hasChanges || saving} className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-600 text-white py-3 rounded-xl font-bold text-[13px] hover:bg-indigo-700 disabled:opacity-30 transition-all active:scale-[0.97] shadow-lg shadow-indigo-200/50">
                        {saving ? <Loader className="animate-spin" size={15} /> : <Save size={15} />}
                        {saving ? 'Saving...' : 'Save'}
                    </button>
                </div>
            )}

            {activePicker && (
                <MediaPicker
                    type={activePicker.type}
                    onFileSelect={(file) => {
                        if (activePicker.type === 'image') handleImageUpload(activePicker.index, file);
                        else handleVideoUpload(activePicker.index, file);
                    }}
                    onClose={() => setActivePicker(null)}
                />
            )}

            {editImageIndex !== null && imageSlots[editImageIndex]?.previewUrl && (
                <ImageEditor
                    source={imageSlots[editImageIndex].file || imageSlots[editImageIndex].previewUrl!}
                    onConfirm={(file) => { handleEditedImage(editImageIndex, file); setEditImageIndex(null); }}
                    onClose={() => setEditImageIndex(null)}
                />
            )}

            {/* Fullscreen image viewer — pinch / scroll / double-tap to zoom in and
                inspect the uploaded photo's clarity. */}
            {viewImageUrl && (
                <div className="fixed inset-0 z-[1003] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4" onClick={() => setViewImageUrl(null)}>
                    <button
                        onClick={() => setViewImageUrl(null)}
                        className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center bg-white/15 text-white rounded-full hover:bg-white/25 active:scale-90 transition-all"
                        title="Close"
                    >
                        <X size={22} />
                    </button>
                    <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
                        <ZoomableImage
                            src={viewImageUrl}
                            alt="Image preview"
                            className="w-full h-[75vh] rounded-2xl bg-black/40"
                        />
                    </div>
                </div>
            )}

            {/* Fullscreen video viewer — play the uploaded clip to review it. */}
            {viewVideoUrl && (
                <div className="fixed inset-0 z-[1003] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4" onClick={() => setViewVideoUrl(null)}>
                    <button
                        onClick={() => setViewVideoUrl(null)}
                        className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center bg-white/15 text-white rounded-full hover:bg-white/25 active:scale-90 transition-all"
                        title="Close"
                    >
                        <X size={22} />
                    </button>
                    <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
                        <video
                            src={viewVideoUrl}
                            className="w-full max-h-[80vh] rounded-2xl bg-black"
                            controls
                            autoPlay
                            playsInline
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
