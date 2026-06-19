import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
    id: number;
    message: string;
    type: ToastType;
}

interface ToastContextType {
    showToast: (message: string, type: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((message: string, type: ToastType) => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);

        // Auto remove after 3 seconds
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 3000);
    }, []);

    const removeToast = (id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2">
                {toasts.map(toast => (
                    <div 
                        key={toast.id}
                        className={`
                            min-w-[300px] max-w-md p-4 rounded-xl shadow-lg border flex items-center gap-3 animate-in slide-in-from-right duration-300
                            ${toast.type === 'success' ? 'bg-white border-green-100 text-green-800' : ''}
                            ${toast.type === 'error' ? 'bg-white border-red-100 text-red-800' : ''}
                            ${toast.type === 'warning' ? 'bg-white border-amber-100 text-amber-800' : ''}
                            ${toast.type === 'info' ? 'bg-white border-indigo-100 text-indigo-800' : ''}
                        `}
                    >
                        <div className={`
                            p-2 rounded-full shrink-0
                            ${toast.type === 'success' ? 'bg-green-100 text-green-600' : ''}
                            ${toast.type === 'error' ? 'bg-red-100 text-red-600' : ''}
                            ${toast.type === 'warning' ? 'bg-amber-100 text-amber-600' : ''}
                            ${toast.type === 'info' ? 'bg-indigo-100 text-indigo-600' : ''}
                        `}>
                            {toast.type === 'success' && <CheckCircle size={20} />}
                            {toast.type === 'error' && <AlertCircle size={20} />}
                            {toast.type === 'warning' && <AlertTriangle size={20} />}
                            {toast.type === 'info' && <Info size={20} />}
                        </div>
                        
                        <p className="text-sm font-bold flex-1">{toast.message}</p>

                        <button 
                            onClick={() => removeToast(toast.id)}
                            className="p-1 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};
