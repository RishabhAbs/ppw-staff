import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, RefreshCw } from 'lucide-react';
import { useToast } from '../context/ToastContext';

interface Props {
    onResult: (decodedText: string) => void;
    onClose: () => void;
}

export default function BarcodeScanner({ onResult, onClose }: Props) {
    const { showToast } = useToast();
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');

    useEffect(() => {
        let isMounted = true;
        const startScanner = async () => {
            // Check if camera API is available
            if (!navigator.mediaDevices?.getUserMedia) {
                showToast('Camera not available. Use localhost or HTTPS (ngrok).', 'error');
                onClose();
                return;
            }

            try {
                const scanner = new Html5Qrcode('barcode-scanner-container');
                scannerRef.current = scanner;
                
                // Allow browser to fallback gracefully if 'environment' camera is missing
                const constraints = { facingMode: cameraFacing };
                
                await scanner.start(
                    constraints,
                    { fps: 20, qrbox: { width: 250, height: 250 } },
                    async (decodedText) => {
                        if (isMounted) {
                            try { await scanner.stop(); } catch {}
                            onResult(decodedText);
                        }
                    },
                    () => {} // Ignore scan failures
                );
            } catch (err: any) {
                if (!isMounted) return;
                const msg = err?.message || String(err);
                if (msg.includes('Permission') || msg.includes('NotAllowed')) {
                    showToast('Camera permission denied. Allow camera in browser settings.', 'error');
                } else if (msg.includes('NotFound') || msg.includes('Requested device not found')) {
                    showToast('No camera found on this device.', 'error');
                } else {
                    showToast('Camera error: ' + msg, 'error');
                }
                onClose();
            }
        };

        // Delay to allow DOM attachment
        const timer = setTimeout(startScanner, 200);

        return () => {
            isMounted = false;
            clearTimeout(timer);
            if (scannerRef.current) {
                try {
                    scannerRef.current.stop().catch(() => {});
                } catch (e) {
                    // Ignore synchronous stop errors if scanner wasn't fully started
                }
            }
        };
    }, [cameraFacing, onClose, onResult, showToast]);

    const flipCamera = () => {
        setCameraFacing(prev => prev === 'environment' ? 'user' : 'environment');
    };

    return (
        <div className="mt-2 w-full rounded-xl overflow-hidden border border-slate-200 shadow-lg bg-black relative h-48 flex items-center justify-center">
            <div id="barcode-scanner-container" className="w-full h-full flex items-center justify-center [&_video]:!object-cover [&_video]:!object-center [&_canvas]:!hidden [&_#qr-shaded-region]:!hidden" />
            
            {/* Manual Centered Guide Overlay */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
                <div className="w-[180px] h-[100px] relative">
                    {/* Corner Brackets */}
                    <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-white rounded-tl-lg shadow-[0_0_10px_rgba(0,0,0,0.3)]"></div>
                    <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-white rounded-tr-lg shadow-[0_0_10px_rgba(0,0,0,0.3)]"></div>
                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-white rounded-bl-lg shadow-[0_0_10px_rgba(0,0,0,0.3)]"></div>
                    <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-white rounded-br-lg shadow-[0_0_10px_rgba(0,0,0,0.3)]"></div>
                    
                    {/* Scanning Laser Line */}
                    <div className="absolute left-0 right-0 h-0.5 bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)] animate-scan-line"></div>
                </div>
            </div>

            <div className="absolute top-2 right-2 z-20 flex gap-2">
                <button onClick={flipCamera} className="bg-black/60 hover:bg-black/80 backdrop-blur-md text-white p-2 rounded-full active:scale-95 transition-all shadow-md" title="Flip Camera">
                    <RefreshCw size={16} />
                </button>
                <button onClick={onClose} className="bg-black/60 hover:bg-red-500/80 backdrop-blur-md text-white p-2 rounded-full active:scale-95 transition-all shadow-md" title="Close Scanner">
                    <X size={16} />
                </button>
            </div>
        </div>
    );
}
