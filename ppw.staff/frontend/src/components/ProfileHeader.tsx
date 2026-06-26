import { useState, useRef, useEffect } from 'react';
import { LogOut, Shield, ChevronDown } from 'lucide-react';
import { getUser } from '../api';

export function ProfileHeader() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const user = getUser();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    window.location.href = '/login';
  };

  if (!user || !user.username) return null;

  const initial = (user.name || user.username || '?').charAt(0).toUpperCase();

  return (
    <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsOpen((v) => !v)}
            className="flex items-center gap-2 p-1.5 rounded-full bg-white border border-slate-200 shadow-sm transition-all active:scale-95"
          >
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold text-white bg-gradient-to-br from-indigo-500 to-indigo-700">
              {initial}
            </div>
            <ChevronDown
              size={14}
              className={`text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {isOpen && (
            <div className="absolute top-full right-0 mt-2 w-60 rounded-2xl overflow-hidden bg-white border border-slate-200 shadow-xl">
              <div className="p-4 border-b border-slate-100">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                  Signed in as
                </p>
                <p className="text-sm font-bold text-slate-800 truncate">
                  {user.name || user.username}
                </p>
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600">
                    <Shield size={10} />
                    {user.role || 'user'}
                  </span>
                </div>
              </div>

              <div className="p-2">
                <div className="px-3 py-2 space-y-1">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Username</p>
                  <p className="text-[12px] font-semibold text-slate-700 break-all">{user.username}</p>
                </div>
                {user.number && (
                  <div className="px-3 py-2 space-y-1">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Phone</p>
                    <p className="text-[12px] font-semibold text-slate-700">{user.number}</p>
                  </div>
                )}

                <div className="mt-2 pt-2 border-t border-slate-100">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <LogOut size={16} />
                    <span className="text-[12px] font-bold uppercase tracking-wider">Logout</span>
                  </button>
                </div>
              </div>
            </div>
          )}
    </div>
  );
}
