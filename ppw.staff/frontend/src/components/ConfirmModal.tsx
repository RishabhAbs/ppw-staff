import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDangerous?: boolean;
    onSecondaryConfirm?: () => void;
    secondaryConfirmText?: string;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({ 
    isOpen, 
    onClose, 
    onConfirm, 
    title, 
    message, 
    confirmText = 'Confirm', 
    cancelText = 'Cancel',
    isDangerous = false,
    onSecondaryConfirm,
    secondaryConfirmText
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden scale-100 animate-in zoom-in-95 duration-200 relative">
                {/* Top Corner Close Button */}
                <button 
                    onClick={onClose}
                    className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all z-10"
                >
                    <X size={18} />
                </button>

                <div className="p-5 text-center px-8">
                    <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-4 ${isDangerous ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
                        <AlertTriangle size={24} />
                    </div>
                    <h3 className="text-lg font-black text-slate-800 mb-2">{title}</h3>
                    <p className="text-sm text-slate-600 font-medium leading-relaxed">
                        {message}
                    </p>
                </div>

                <div className="p-4 bg-slate-50 flex flex-col gap-3">
                    {onSecondaryConfirm && secondaryConfirmText ? (
                        /* Case with "Save & Switch" (Safe Action Priority) */
                        <div className="flex flex-col gap-2.5">
                            <button 
                                onClick={() => { onSecondaryConfirm(); onClose(); }}
                                className="w-full py-3.5 text-white font-bold bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-lg shadow-emerald-200 active:scale-95 transition-all"
                            >
                                {secondaryConfirmText}
                            </button>
                            <button 
                                onClick={() => { onConfirm(); onClose(); }}
                                className={`w-full py-3 font-bold rounded-xl active:scale-95 transition-all
                                    ${isDangerous ? 'bg-red-50 text-red-600 border border-red-100 hover:bg-red-100' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'}
                                `}
                            >
                                {confirmText}
                            </button>
                        </div>
                    ) : (
                        /* Standard Dual Action Case */
                        <div className="flex flex-col-reverse sm:flex-row gap-3">
                            <button 
                                onClick={onClose}
                                className="flex-1 py-3 text-slate-600 font-bold bg-white border border-slate-200 rounded-xl hover:bg-slate-100 active:scale-95 transition-all"
                            >
                                {cancelText}
                            </button>
                            <button 
                                onClick={() => { onConfirm(); onClose(); }}
                                className={`flex-1 py-3 text-white font-bold rounded-xl shadow-lg active:scale-95 transition-all
                                    ${isDangerous ? 'bg-red-600 hover:bg-red-700 shadow-red-200' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'}
                                `}
                            >
                                {confirmText}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
