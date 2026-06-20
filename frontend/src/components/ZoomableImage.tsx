import { useRef, useState, useCallback, useEffect } from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface Props {
    src: string;
    alt?: string;
    /** Tailwind classes for the outer frame (aspect ratio, rounding, etc.). */
    className?: string;
}

const MAX_SCALE = 5;
const MIN_SCALE = 1;

/**
 * Pinch-to-zoom (touch) + wheel / double-click zoom (desktop) with drag-to-pan.
 * Lets the user inspect a captured photo's clarity before using it. The image
 * is shown fully (object-contain) at scale 1 and can be magnified up to 5x.
 */
export default function ZoomableImage({ src, alt, className = '' }: Props) {
    const frameRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);
    const [tx, setTx] = useState(0);
    const [ty, setTy] = useState(0);

    // Active gesture state kept in refs so listeners read the latest values.
    const pan = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
    const pinch = useRef<{ dist: number; scale: number } | null>(null);

    // Keep pan within bounds so the image can't be dragged completely away.
    const clampPan = useCallback((nx: number, ny: number, s: number) => {
        const el = frameRef.current;
        if (!el) return { x: nx, y: ny };
        const { width, height } = el.getBoundingClientRect();
        const maxX = (width * (s - 1)) / 2;
        const maxY = (height * (s - 1)) / 2;
        return {
            x: Math.min(maxX, Math.max(-maxX, nx)),
            y: Math.min(maxY, Math.max(-maxY, ny)),
        };
    }, []);

    const applyScale = useCallback((next: number) => {
        const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
        setScale(s);
        setTx(prev => clampPan(prev, ty, s).x);
        setTy(prev => clampPan(tx, prev, s).y);
        if (s === 1) { setTx(0); setTy(0); }
    }, [clampPan, tx, ty]);

    const reset = () => { setScale(1); setTx(0); setTy(0); };

    // Wheel zoom (desktop / trackpad).
    const onWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        applyScale(scale + (e.deltaY < 0 ? 0.3 : -0.3));
    };

    const onDoubleClick = () => {
        if (scale > 1) reset();
        else applyScale(2.5);
    };

    // ---- Touch: 1 finger = pan, 2 fingers = pinch ----
    const dist = (t: React.TouchList) =>
        Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const onTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 2) {
            pinch.current = { dist: dist(e.touches), scale };
            pan.current = null;
        } else if (e.touches.length === 1 && scale > 1) {
            pan.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, tx, ty };
        }
    };

    const onTouchMove = (e: React.TouchEvent) => {
        if (pinch.current && e.touches.length === 2) {
            e.preventDefault();
            const ratio = dist(e.touches) / pinch.current.dist;
            applyScale(pinch.current.scale * ratio);
        } else if (pan.current && e.touches.length === 1) {
            e.preventDefault();
            const dx = e.touches[0].clientX - pan.current.x;
            const dy = e.touches[0].clientY - pan.current.y;
            const c = clampPan(pan.current.tx + dx, pan.current.ty + dy, scale);
            setTx(c.x); setTy(c.y);
        }
    };

    const onTouchEnd = (e: React.TouchEvent) => {
        if (e.touches.length === 0) { pinch.current = null; pan.current = null; }
        else if (e.touches.length === 1) pinch.current = null;
    };

    // ---- Mouse drag-to-pan (desktop) ----
    const onMouseDown = (e: React.MouseEvent) => {
        if (scale <= 1) return;
        pan.current = { x: e.clientX, y: e.clientY, tx, ty };
    };
    useEffect(() => {
        const move = (e: MouseEvent) => {
            if (!pan.current) return;
            const dx = e.clientX - pan.current.x;
            const dy = e.clientY - pan.current.y;
            const c = clampPan(pan.current.tx + dx, pan.current.ty + dy, scale);
            setTx(c.x); setTy(c.y);
        };
        const up = () => { pan.current = null; };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
        return () => {
            window.removeEventListener('mousemove', move);
            window.removeEventListener('mouseup', up);
        };
    }, [clampPan, scale]);

    return (
        <div
            ref={frameRef}
            className={`relative overflow-hidden touch-none select-none ${className}`}
            onWheel={onWheel}
            onDoubleClick={onDoubleClick}
            onMouseDown={onMouseDown}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
        >
            <img
                src={src}
                alt={alt}
                draggable={false}
                className="w-full h-full object-contain pointer-events-none"
                style={{
                    transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
                    transformOrigin: 'center center',
                    transition: pan.current || pinch.current ? 'none' : 'transform 0.15s ease-out',
                    cursor: scale > 1 ? 'grab' : 'zoom-in',
                }}
            />

            {/* Zoom controls */}
            <div className="absolute bottom-2 right-2 flex gap-1.5">
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); applyScale(scale - 0.5); }}
                    className="w-8 h-8 flex items-center justify-center bg-white/90 text-slate-700 rounded-full shadow-md hover:bg-white active:scale-90 transition-all disabled:opacity-40"
                    disabled={scale <= MIN_SCALE}
                    title="Zoom out"
                >
                    <ZoomOut size={16} />
                </button>
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); applyScale(scale + 0.5); }}
                    className="w-8 h-8 flex items-center justify-center bg-white/90 text-slate-700 rounded-full shadow-md hover:bg-white active:scale-90 transition-all disabled:opacity-40"
                    disabled={scale >= MAX_SCALE}
                    title="Zoom in"
                >
                    <ZoomIn size={16} />
                </button>
                {scale > 1 && (
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); reset(); }}
                        className="w-8 h-8 flex items-center justify-center bg-white/90 text-slate-700 rounded-full shadow-md hover:bg-white active:scale-90 transition-all"
                        title="Fit"
                    >
                        <Maximize2 size={15} />
                    </button>
                )}
            </div>

            {/* Hint */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 px-2.5 py-1 bg-black/55 text-white text-[10px] font-semibold rounded-full pointer-events-none">
                {scale > 1 ? `${scale.toFixed(1)}× · drag to pan` : 'Pinch / double-tap to zoom'}
            </div>
        </div>
    );
}
