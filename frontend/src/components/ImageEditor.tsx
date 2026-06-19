import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Check, RotateCw, RotateCcw, Loader } from 'lucide-react';

interface Props {
    // Source can be a File (fresh upload) or an existing image URL (edit in place).
    source: File | string;
    onConfirm: (file: File) => void;
    onClose: () => void;
}

// On-screen area the image is fitted into (the image is shown fully inside this).
const STAGE = 320;
const MIN_CROP = 32; // smallest crop box edge in stage px
const HANDLE = 14;   // hit area for resize handles

type Handle = 'move' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
interface Rect { x: number; y: number; w: number; h: number; }

export default function ImageEditor({ source, onConfirm, onClose }: Props) {
    const [img, setImg] = useState<HTMLImageElement | null>(null);
    const [displayUrl, setDisplayUrl] = useState('');
    const [loadError, setLoadError] = useState(false);
    const [rotation, setRotation] = useState(0); // degrees, multiples of 90
    const [exporting, setExporting] = useState(false);

    // Geometry of the fully-fitted image inside the STAGE box (in stage px).
    const [fit, setFit] = useState<Rect>({ x: 0, y: 0, w: STAGE, h: STAGE });
    // Crop rectangle in stage px (relative to the stage box top-left).
    const [crop, setCrop] = useState<Rect>({ x: 0, y: 0, w: STAGE, h: STAGE });

    const stageRef = useRef<HTMLDivElement>(null);
    const drag = useRef<{ handle: Handle; sx: number; sy: number; start: Rect } | null>(null);

    // Load source -> HTMLImageElement.
    useEffect(() => {
        let blobUrl: string | null = null;
        let cancelled = false;
        const el = new window.Image();
        let src: string;
        if (typeof source === 'string') {
            src = source;
            try {
                const u = new URL(source, window.location.origin);
                if (u.pathname.startsWith('/api/')) src = u.pathname + u.search;
                else if (u.origin !== window.location.origin) el.crossOrigin = 'anonymous';
            } catch { /* use as-is */ }
        } else {
            blobUrl = URL.createObjectURL(source);
            src = blobUrl;
        }
        el.onload = () => { if (!cancelled) { setImg(el); setDisplayUrl(src); } };
        el.onerror = () => { if (!cancelled) setLoadError(true); };
        el.src = src;
        return () => { cancelled = true; if (blobUrl) URL.revokeObjectURL(blobUrl); };
    }, [source]);

    // Whenever the image or rotation changes, fit the (rotated) image fully inside
    // the stage. Reset the crop to the whole image only when the IMAGE changes —
    // NOT on rotation (rotation rotates the existing crop along with the image, so
    // a crop made before rotating is preserved).
    const prevRotation = useRef(rotation);
    useEffect(() => {
        if (!img) return;
        const swap = rotation % 180 !== 0;
        const natW = swap ? img.height : img.width;
        const natH = swap ? img.width : img.height;
        const scale = Math.min(STAGE / natW, STAGE / natH);
        const w = natW * scale;
        const h = natH * scale;
        const x = (STAGE - w) / 2;
        const y = (STAGE - h) / 2;
        const newFit = { x, y, w, h };
        setFit(newFit);
        setCrop({ x, y, w, h });
        prevRotation.current = rotation;
    }, [img]); // eslint-disable-line react-hooks/exhaustive-deps

    // On rotation: re-fit the stage AND rotate the existing crop rect by the same
    // 90° step so it keeps framing the same part of the image.
    useEffect(() => {
        if (!img) return;
        const delta = (((rotation - prevRotation.current) % 360) + 360) % 360;
        prevRotation.current = rotation;

        const swap = rotation % 180 !== 0;
        const natW = swap ? img.height : img.width;
        const natH = swap ? img.width : img.height;
        const scale = Math.min(STAGE / natW, STAGE / natH);
        const w = natW * scale;
        const h = natH * scale;
        const x = (STAGE - w) / 2;
        const y = (STAGE - h) / 2;
        const newFit = { x, y, w, h };

        // Rotate the current crop rect around the OLD fit center into the new fit.
        setCrop(prev => {
            if (delta === 0) return prev;
            // Normalize crop relative to old fit box (0..1).
            const relX = (prev.x - fit.x) / fit.w;
            const relY = (prev.y - fit.y) / fit.h;
            const relW = prev.w / fit.w;
            const relH = prev.h / fit.h;
            let nx = relX, ny = relY, nw = relW, nh = relH;
            const steps = delta / 90;
            for (let i = 0; i < steps; i++) {
                // 90° clockwise within a unit square: (x,y,w,h) -> (1-y-h, x, h, w)
                const px = nx, py = ny, pw = nw, ph = nh;
                nx = 1 - py - ph;
                ny = px;
                nw = ph;
                nh = pw;
            }
            return { x: x + nx * w, y: y + ny * h, w: nw * w, h: nh * h };
        });
        setFit(newFit);
    }, [rotation]); // eslint-disable-line react-hooks/exhaustive-deps

    // Clamp the crop rect to stay inside the fitted image and above MIN_CROP.
    const clampRect = useCallback((r: Rect): Rect => {
        let { x, y, w, h } = r;
        w = Math.max(MIN_CROP, w);
        h = Math.max(MIN_CROP, h);
        if (x < fit.x) x = fit.x;
        if (y < fit.y) y = fit.y;
        if (x + w > fit.x + fit.w) { if (w > fit.w) w = fit.w; x = fit.x + fit.w - w; }
        if (y + h > fit.y + fit.h) { if (h > fit.h) h = fit.h; y = fit.y + fit.h - h; }
        if (x < fit.x) x = fit.x;
        if (y < fit.y) y = fit.y;
        return { x, y, w, h };
    }, [fit]);

    const onPointerDown = (handle: Handle) => (e: React.PointerEvent) => {
        e.stopPropagation();
        e.preventDefault();
        drag.current = { handle, sx: e.clientX, sy: e.clientY, start: { ...crop } };
    };

    // Track the drag on window so movement is followed no matter where the cursor
    // goes (handles/box capture would otherwise swallow the events).
    useEffect(() => {
        const move = (e: PointerEvent) => {
            if (!drag.current) return;
            const { handle, sx, sy, start } = drag.current;
            const dx = e.clientX - sx;
            const dy = e.clientY - sy;
            const r: Rect = { ...start };
            if (handle === 'move') {
                r.x = start.x + dx;
                r.y = start.y + dy;
                r.x = Math.min(Math.max(r.x, fit.x), fit.x + fit.w - r.w);
                r.y = Math.min(Math.max(r.y, fit.y), fit.y + fit.h - r.h);
                setCrop(r);
                return;
            }
            if (handle.includes('w')) { r.x = start.x + dx; r.w = start.w - dx; }
            if (handle.includes('e')) { r.w = start.w + dx; }
            if (handle.includes('n')) { r.y = start.y + dy; r.h = start.h - dy; }
            if (handle.includes('s')) { r.h = start.h + dy; }
            if (r.w < MIN_CROP) { if (handle.includes('w')) r.x = start.x + start.w - MIN_CROP; r.w = MIN_CROP; }
            if (r.h < MIN_CROP) { if (handle.includes('n')) r.y = start.y + start.h - MIN_CROP; r.h = MIN_CROP; }
            setCrop(clampRect(r));
        };
        const up = () => { drag.current = null; };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
        return () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
        };
    }, [fit, clampRect]);

    const handleConfirm = async () => {
        if (!img) return;
        setExporting(true);
        try {
            // Map the crop rect (stage px) back to source pixels.
            const swap = rotation % 180 !== 0;
            const natW = swap ? img.height : img.width;
            const natH = swap ? img.width : img.height;
            const scale = natW / fit.w; // stage px -> rotated-source px
            const cropW = Math.round(crop.w * scale);
            const cropH = Math.round(crop.h * scale);
            const cropX = Math.round((crop.x - fit.x) * scale);
            const cropY = Math.round((crop.y - fit.y) * scale);

            // Draw the rotated source into a canvas sized to the rotated image, then
            // copy out just the crop region.
            const full = document.createElement('canvas');
            full.width = natW;
            full.height = natH;
            const fctx = full.getContext('2d');
            if (!fctx) throw new Error('no ctx');
            fctx.save();
            fctx.translate(natW / 2, natH / 2);
            fctx.rotate((rotation * Math.PI) / 180);
            fctx.drawImage(img, -img.width / 2, -img.height / 2);
            fctx.restore();

            const out = document.createElement('canvas');
            out.width = cropW;
            out.height = cropH;
            const octx = out.getContext('2d');
            if (!octx) throw new Error('no ctx');
            octx.fillStyle = '#ffffff';
            octx.fillRect(0, 0, cropW, cropH);
            octx.drawImage(full, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

            const blob: Blob = await new Promise((resolve, reject) =>
                out.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/jpeg', 0.9),
            );
            const name = (typeof source !== 'string' && source.name) ? source.name.replace(/\.\w+$/, '') : 'edited';
            onConfirm(new File([blob], `${name}_${Date.now()}.jpg`, { type: 'image/jpeg' }));
        } catch (err) {
            console.error('Image export failed', err);
            alert('Could not process the image. Please try again.');
        } finally {
            setExporting(false);
        }
    };

    const handleStyle = (h: Handle): React.CSSProperties => {
        const s: React.CSSProperties = { position: 'absolute', width: HANDLE, height: HANDLE };
        const edge = -HANDLE / 2;
        const mid = `calc(50% - ${HANDLE / 2}px)`;
        const map: Record<string, React.CSSProperties> = {
            nw: { left: edge, top: edge, cursor: 'nwse-resize' },
            ne: { right: edge, top: edge, cursor: 'nesw-resize' },
            se: { right: edge, bottom: edge, cursor: 'nwse-resize' },
            sw: { left: edge, bottom: edge, cursor: 'nesw-resize' },
            n: { left: mid, top: edge, cursor: 'ns-resize' },
            s: { left: mid, bottom: edge, cursor: 'ns-resize' },
            e: { right: edge, top: mid, cursor: 'ew-resize' },
            w: { left: edge, top: mid, cursor: 'ew-resize' },
        };
        return { ...s, ...map[h] };
    };

    return (
        <div className="fixed inset-0 z-[1002] flex items-center justify-center p-4">
            <style>{`@keyframes fadeInUp { from { transform: translateY(8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
            <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" onClick={onClose} />

            <div className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden" style={{ animation: 'fadeInUp 0.2s ease-out' }}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <h2 className="text-lg font-bold text-slate-800">Edit Image</h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <X size={20} className="text-slate-400" />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    {loadError ? (
                        <div className="flex items-center justify-center text-sm font-medium text-red-500 bg-red-50 rounded-2xl p-8" style={{ height: STAGE }}>
                            Could not load image.
                        </div>
                    ) : !img ? (
                        <div className="flex items-center justify-center bg-slate-50 rounded-2xl" style={{ height: STAGE }}>
                            <Loader className="animate-spin text-indigo-400" size={28} />
                        </div>
                    ) : (
                        <>
                            <div className="flex justify-center">
                                <div
                                    ref={stageRef}
                                    className="relative rounded-xl overflow-hidden bg-slate-100 touch-none select-none"
                                    style={{ width: STAGE, height: STAGE }}
                                >
                                    {/* Full image, fitted (letterboxed) and rotated.
                                        When rotated 90/270 the image's own w/h are the
                                        swapped fit dims, then rotate() spins it to fill
                                        the fit box. */}
                                    {(() => {
                                        const swap = rotation % 180 !== 0;
                                        const imgW = swap ? fit.h : fit.w;
                                        const imgH = swap ? fit.w : fit.h;
                                        return (
                                            <img
                                                src={displayUrl}
                                                alt="Editing"
                                                draggable={false}
                                                className="absolute pointer-events-none select-none max-w-none"
                                                style={{
                                                    left: fit.x + fit.w / 2,
                                                    top: fit.y + fit.h / 2,
                                                    width: imgW,
                                                    height: imgH,
                                                    transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                                                }}
                                            />
                                        );
                                    })()}
                                    {/* Dim outside the crop area (4 overlays) */}
                                    <div className="absolute inset-0 pointer-events-none">
                                        <div className="absolute bg-black/45" style={{ left: 0, top: 0, right: 0, height: crop.y }} />
                                        <div className="absolute bg-black/45" style={{ left: 0, top: crop.y + crop.h, right: 0, bottom: 0 }} />
                                        <div className="absolute bg-black/45" style={{ left: 0, top: crop.y, width: crop.x, height: crop.h }} />
                                        <div className="absolute bg-black/45" style={{ left: crop.x + crop.w, top: crop.y, right: 0, height: crop.h }} />
                                    </div>
                                    {/* Crop box */}
                                    <div
                                        className="absolute border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.3)] cursor-move"
                                        style={{ left: crop.x, top: crop.y, width: crop.w, height: crop.h }}
                                    >
                                        {/* Transparent interior surface that grabs the move drag. */}
                                        <div
                                            className="absolute inset-0 cursor-move"
                                            style={{ background: 'transparent' }}
                                            onPointerDown={onPointerDown('move')}
                                        />
                                        {/* thirds grid */}
                                        <div className="absolute inset-0 pointer-events-none">
                                            <div className="absolute top-1/3 left-0 right-0 border-t border-white/40" />
                                            <div className="absolute top-2/3 left-0 right-0 border-t border-white/40" />
                                            <div className="absolute left-1/3 top-0 bottom-0 border-l border-white/40" />
                                            <div className="absolute left-2/3 top-0 bottom-0 border-l border-white/40" />
                                        </div>
                                        {/* handles */}
                                        {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as Handle[]).map(h => (
                                            <div
                                                key={h}
                                                onPointerDown={onPointerDown(h)}
                                                style={handleStyle(h)}
                                            >
                                                <div className="w-full h-full rounded-sm bg-white border border-indigo-500 shadow" />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Rotate controls */}
                            <div className="flex justify-center gap-3">
                                <button onClick={() => setRotation(r => (r - 90 + 360) % 360)} className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-[13px] hover:bg-slate-200 transition-all active:scale-95">
                                    <RotateCcw size={16} /> Rotate L
                                </button>
                                <button onClick={() => setRotation(r => (r + 90) % 360)} className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-[13px] hover:bg-slate-200 transition-all active:scale-95">
                                    <RotateCw size={16} /> Rotate R
                                </button>
                            </div>
                        </>
                    )}
                </div>

                <div className="flex gap-3 px-6 pb-6">
                    <button onClick={onClose} className="flex-1 flex items-center justify-center gap-2 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all active:scale-95">
                        <X size={18} /> Cancel
                    </button>
                    <button onClick={handleConfirm} disabled={!img || exporting} className="flex-1 flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-40 transition-all active:scale-95 shadow-lg shadow-indigo-200">
                        {exporting ? <Loader className="animate-spin" size={18} /> : <Check size={18} />} Apply
                    </button>
                </div>
            </div>
        </div>
    );
}
