import React from 'react';
import { X, AlertCircle, CheckCircle, Info } from 'lucide-react';

interface CustomAlertProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    message: string;
    type?: 'info' | 'success' | 'error' | 'warning';
}

export const CustomAlert: React.FC<CustomAlertProps> = ({ isOpen, onClose, title, message, type = 'info' }) => {
    if (!isOpen) return null;

    const colors = {
        info: 'text-blue-600 bg-blue-50 border-blue-100',
        success: 'text-green-600 bg-green-50 border-green-100',
        error: 'text-red-600 bg-red-50 border-red-100',
        warning: 'text-amber-600 bg-amber-50 border-amber-100'
    };

    const icons = {
        info: <Info size={24} />,
        success: <CheckCircle size={24} />,
        error: <AlertCircle size={24} />,
        warning: <AlertCircle size={24} />
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden scale-100 animate-in zoom-in-95 duration-200">
                <div className={`p-4 flex items-center gap-3 border-b ${colors[type].replace('text-', 'border-')}`}>
                    <div className={`${colors[type]} p-2 rounded-full`}>
                        {icons[type]}
                    </div>
                    <h3 className="font-bold text-lg text-slate-800 flex-1">{title}</h3>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-100 text-slate-500 transition-colors">
                        <X size={20} />
                    </button>
                </div>
                <div className="p-5">
                    <p className="text-slate-600 leading-relaxed font-medium">
                        {message}
                    </p>
                </div>
                <div className="p-4 bg-slate-50 flex justify-end">
                    <button 
                        onClick={onClose}
                        className="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all"
                    >
                        Okay, got it
                    </button>
                </div>
            </div>
        </div>
    );
};
