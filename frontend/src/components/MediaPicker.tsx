import { useState, useRef, useEffect } from 'react';
import { X, Camera, Image, Check, RefreshCcw, Circle, Square } from 'lucide-react';
import ImageEditor from './ImageEditor';

const MAX_VIDEO_SEC = 15;

interface Props {
    type: 'image' | 'video';
    onFileSelect: (file: File) => void;
    onClose: () => void;
}

export default function MediaPicker({ type, onFileSelect, onClose }: Props) {
    const [step, setStep] = useState<'choice' | 'camera' | 'preview'>('choice');
    const [capturedImage, setCapturedImage] = useState<string | null>(null);
    const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
    const [error, setError] = useState<string | null>(null);
    const [editingFile, setEditingFile] = useState<File | null>(null);
    // Video recording state
    const [recording, setRecording] = useState(false);
    const [recordedVideo, setRecordedVideo] = useState<{ url: string; file: File } | null>(null);
    const [elapsed, setElapsed] = useState(0);
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Stop camera when component unmounts or step changes from camera
    useEffect(() => {
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    const startCamera = async () => {
        setError(null);
        try {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
            // Video records with audio; photo capture is video-only.
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: cameraFacing },
                audio: type === 'video',
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.muted = true; // avoid echo of own mic while filming
            }
            setStep('camera');
        } catch (err: any) {
            console.error('Camera access error:', err);
            setError('Could not access camera. Please check permissions.');
        }
    };

    const startRecording = () => {
        if (!streamRef.current) return;
        chunksRef.current = [];
        // Pick a widely-supported container/codec.
        const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
            .find(m => MediaRecorder.isTypeSupported(m)) || '';
        const rec = new MediaRecorder(streamRef.current, mime ? { mimeType: mime } : undefined);
        recorderRef.current = rec;
        rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        rec.onstop = () => {
            const type = rec.mimeType || 'video/webm';
            const ext = type.includes('mp4') ? 'mp4' : 'webm';
            const blob = new Blob(chunksRef.current, { type });
            const file = new File([blob], `recording_${Date.now()}.${ext}`, { type });
            setRecordedVideo({ url: URL.createObjectURL(blob), file });
            setStep('preview');
            // Release the camera once we have the clip.
            streamRef.current?.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        };
        rec.start();
        setRecording(true);
        setElapsed(0);
        timerRef.current = setInterval(() => {
            setElapsed(prev => {
                const next = prev + 1;
                if (next >= MAX_VIDEO_SEC) stopRecording();
                return next;
            });
        }, 1000);
    };

    const stopRecording = () => {
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        setRecording(false);
        if (recorderRef.current && recorderRef.current.state !== 'inactive') {
            recorderRef.current.stop();
        }
    };

    const confirmVideo = () => {
        if (!recordedVideo) return;
        onFileSelect(recordedVideo.file);
        onClose();
    };

    const retakeVideo = () => {
        if (recordedVideo) URL.revokeObjectURL(recordedVideo.url);
        setRecordedVideo(null);
        setElapsed(0);
        startCamera();
    };

    const handleCapture = () => {
        if (!videoRef.current) return;
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(videoRef.current, 0, 0);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            setCapturedImage(dataUrl);
            setStep('preview');
            // Stop camera stream after capture to save battery/resource
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
            }
        }
    };

    const handleConfirm = () => {
        if (!capturedImage) return;
        // Convert dataURL to File, then send to the crop/rotate editor.
        fetch(capturedImage)
            .then(res => res.blob())
            .then(blob => {
                const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
                setEditingFile(file);
            });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        // Images go through the editor first; videos pass straight through.
        if (type === 'image') {
            setEditingFile(file);
        } else {
            onFileSelect(file);
            onClose();
        }
    };

    const flipCamera = () => {
        setCameraFacing(prev => prev === 'environment' ? 'user' : 'environment');
        // Restart camera with new facing mode
        setTimeout(startCamera, 100);
    };

    return (
        <div className="fixed inset-0 z-[1001] flex items-center justify-center p-4">
            <style>{`
                @keyframes fadeInUp {
                    from { transform: translateY(8px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            `}</style>
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
            
            <div 
                className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
                style={{ animation: 'fadeInUp 0.2s ease-out' }}
            >
                
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <h2 className="text-lg font-bold text-slate-800">
                        {step === 'choice' && `Add ${type === 'image' ? 'Image' : 'Video'}`}
                        {step === 'camera' && `Take ${type === 'image' ? 'Photo' : 'Video'}`}
                        {step === 'preview' && 'Preview Capture'}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <X size={20} className="text-slate-400" />
                    </button>
                </div>

                <div className="p-6">
                    {step === 'choice' && (
                        <div className="grid grid-cols-2 gap-4">
                            <button 
                                onClick={startCamera}
                                className="flex flex-col items-center justify-center gap-3 p-6 bg-indigo-50 border-2 border-indigo-100 rounded-2xl hover:bg-indigo-100 hover:border-indigo-200 transition-all group"
                            >
                                <div className="w-12 h-12 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg group-active:scale-90 transition-transform">
                                    <Camera size={24} />
                                </div>
                                <span className="text-sm font-bold text-indigo-700">Camera</span>
                            </button>

                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                className="flex flex-col items-center justify-center gap-3 p-6 bg-slate-50 border-2 border-slate-100 rounded-2xl hover:bg-slate-100 hover:border-slate-200 transition-all group"
                            >
                                <div className="w-12 h-12 bg-slate-600 text-white rounded-full flex items-center justify-center shadow-lg group-active:scale-90 transition-transform">
                                    <Image size={24} />
                                </div>
                                <span className="text-sm font-bold text-slate-700">Gallery</span>
                            </button>
                            
                            <input 
                                ref={fileInputRef}
                                type="file" 
                                accept={type === 'image' ? 'image/*' : 'video/*'} 
                                className="hidden" 
                                onChange={handleFileChange}
                            />
                        </div>
                    )}

                    {step === 'camera' && (
                        <div className="space-y-4">
                            <div className="relative bg-black rounded-2xl overflow-hidden aspect-[3/4] shadow-inner">
                                <video 
                                    ref={videoRef} 
                                    autoPlay 
                                    playsInline 
                                    className="w-full h-full object-cover"
                                />
                                {error && (
                                    <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
                                        <p className="text-white text-sm font-medium">{error}</p>
                                    </div>
                                )}
                                
                                {!recording && (
                                    <button
                                        onClick={flipCamera}
                                        className="absolute top-4 right-4 p-3 bg-black/40 backdrop-blur-md text-white rounded-full hover:bg-black/60 transition-all"
                                    >
                                        <RefreshCcw size={20} />
                                    </button>
                                )}
                                {/* Recording timer / limit */}
                                {type === 'video' && recording && (
                                    <div className="absolute top-4 left-4 flex items-center gap-1.5 bg-black/50 backdrop-blur-md text-white px-2.5 py-1 rounded-full">
                                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                        <span className="text-xs font-bold tabular-nums">0:{String(elapsed).padStart(2, '0')} / 0:{MAX_VIDEO_SEC}</span>
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-center">
                                {type === 'image' ? (
                                    <button
                                        onClick={handleCapture}
                                        className="w-16 h-16 rounded-full border-4 border-slate-200 p-1 hover:border-indigo-500 transition-all active:scale-90"
                                    >
                                        <div className="w-full h-full bg-indigo-600 rounded-full" />
                                    </button>
                                ) : recording ? (
                                    <button
                                        onClick={stopRecording}
                                        className="flex items-center gap-2 px-6 py-3 bg-slate-800 text-white rounded-2xl font-bold hover:bg-slate-900 transition-all active:scale-95"
                                    >
                                        <Square size={18} className="fill-current" /> Stop
                                    </button>
                                ) : (
                                    <button
                                        onClick={startRecording}
                                        className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-all active:scale-95 shadow-lg shadow-red-200"
                                    >
                                        <Circle size={18} className="fill-current" /> Record
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {step === 'preview' && capturedImage && (
                        <div className="space-y-6">
                            <div className="bg-slate-100 rounded-2xl overflow-hidden aspect-[3/4] shadow-inner">
                                <img src={capturedImage} className="w-full h-full object-cover" alt="Capture preview" />
                            </div>

                            <div className="flex gap-4">
                                <button 
                                    onClick={() => { setCapturedImage(null); startCamera(); }}
                                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-50 text-red-600 rounded-xl font-bold hover:bg-red-100 transition-all active:scale-95"
                                >
                                    <X size={20} /> Retake
                                </button>
                                <button
                                    onClick={handleConfirm}
                                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all active:scale-95 shadow-lg shadow-emerald-200"
                                >
                                    <Check size={20} /> Use Photo
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'preview' && recordedVideo && (
                        <div className="space-y-6">
                            <div className="bg-black rounded-2xl overflow-hidden aspect-[3/4] shadow-inner">
                                <video src={recordedVideo.url} className="w-full h-full object-contain" controls autoPlay loop playsInline />
                            </div>
                            <div className="flex gap-4">
                                <button
                                    onClick={retakeVideo}
                                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-50 text-red-600 rounded-xl font-bold hover:bg-red-100 transition-all active:scale-95"
                                >
                                    <X size={20} /> Retake
                                </button>
                                <button
                                    onClick={confirmVideo}
                                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all active:scale-95 shadow-lg shadow-emerald-200"
                                >
                                    <Check size={20} /> Use Video
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {editingFile && (
                <ImageEditor
                    source={editingFile}
                    onConfirm={(file) => { onFileSelect(file); setEditingFile(null); onClose(); }}
                    onClose={() => setEditingFile(null)}
                />
            )}
        </div>
    );
}
