import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';

import Dashboard from './pages/Dashboard';
import LedgerReport from './pages/LedgerReport';
import StockReport from './pages/StockReport';
import CreateOrder from './pages/CreateOrder';
import OrderReport from './pages/OrderReport';
import OrderDetail from './pages/OrderDetail';
import Login from './pages/Login';
import AdminProfile from './pages/AdminProfile';
import Godown from './pages/Godown';
import AttachBarcode from './pages/AttachBarcode';
import { Plus, Users, LayoutGrid, ClipboardList, Package, UserCircle, LogOut, Shield, X } from 'lucide-react';
import { getUser } from './api';
import { ConfirmModal } from './components/ConfirmModal';
import { InstallPWA } from './components/InstallPWA';
import { canAccess, getDefaultRoute } from './utils';

// Permission-aware bottom-nav definition. Each item only renders if
// canAccess(user, item.to) is true (admin bypass via utils).
type NavItem = { to: string; icon: React.ElementType; label: string };
const NAV_ITEMS: NavItem[] = [
  { to: '/',             icon: LayoutGrid,     label: 'Home' },
  { to: '/stock-items',  icon: Package,        label: 'Inventory' },
  { to: '/orders',       icon: ClipboardList,  label: 'History' },
  { to: '/create-order', icon: Plus,           label: 'New' },
  { to: '/profile',      icon: Users,          label: 'Users' },
];

function AuthGuard({ children, path }: { children: React.ReactElement; path?: string }) {
  // Safe parse — a missing/corrupt 'user' key must send to /login, never throw.
  let user: any = null;
  try {
    const userStr = localStorage.getItem('user');
    if (userStr && userStr !== 'undefined' && userStr !== 'null') {
      user = JSON.parse(userStr);
    }
  } catch {
    user = null;
  }
  if (!user || !user.username) return <Navigate to="/login" replace />;

  if (path && !canAccess(user, path)) {
    const target = getDefaultRoute(user);
    // Loop guard: if the computed default is the very path we're already on
    // (and being denied), redirecting there would bounce forever and blank
    // the screen. Send to /login instead so the user can re-auth.
    if (target === path) return <Navigate to="/login" replace />;
    return <Navigate to={target} replace />;
  }
  return children;
}

function NavLink({ to, icon: Icon, label }: { to: string; icon: React.ElementType; label: string }) {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link
      to={to}
      className={`
        relative flex flex-col items-center justify-center py-2 space-y-1 transition-all duration-300
        ${isActive ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}
      `}
    >
      <div className={`relative transition-all duration-300 ${isActive ? '-translate-y-1' : ''}`}>
        <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
        {isActive && (
          <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-1 h-1 bg-indigo-600 rounded-full"></span>
        )}
      </div>
      <span className="text-[10px] font-bold tracking-wide">{label}</span>
    </Link>
  );
}

function NavButton({ icon: Icon, label, onClick, isActive }: { icon: React.ElementType; label: string; onClick: () => void; isActive?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`
        relative flex flex-col items-center justify-center py-2 space-y-1 transition-all duration-300
        ${isActive ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}
      `}
    >
      <div className={`relative transition-all duration-300 ${isActive ? '-translate-y-1' : ''}`}>
        <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
        {isActive && (
          <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-1 h-1 bg-indigo-600 rounded-full"></span>
        )}
      </div>
      <span className="text-[10px] font-bold tracking-wide">{label}</span>
    </button>
  );
}

function ProfileSheet({ onClose }: { onClose: () => void }) {
  const user = getUser();
  const initial = (user.name || user.username || '?').charAt(0).toUpperCase();

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    window.location.href = '/login';
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-white rounded-t-3xl shadow-2xl px-5 pt-4 pb-10 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5" />

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
        >
          <X size={18} />
        </button>

        {/* Avatar + name */}
        <div className="flex items-center gap-4 mb-5">
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold text-white bg-gradient-to-br from-indigo-500 to-indigo-700 shrink-0">
            {initial}
          </div>
          <div>
            <p className="text-lg font-bold text-slate-800">{user.name || user.username}</p>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600 mt-1">
              <Shield size={10} />
              {user.role || 'user'}
            </span>
          </div>
        </div>

        {/* Info rows */}
        <div className="space-y-3 mb-6">
          <div className="bg-slate-50 rounded-2xl px-4 py-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Username</p>
            <p className="text-sm font-semibold text-slate-700">{user.username}</p>
          </div>
          {user.number && (
            <div className="bg-slate-50 rounded-2xl px-4 py-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Phone</p>
              <p className="text-sm font-semibold text-slate-700">{user.number}</p>
            </div>
          )}
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-3.5 bg-red-50 text-red-500 font-bold rounded-2xl hover:bg-red-100 active:scale-95 transition-all"
        >
          <LogOut size={18} />
          Logout
        </button>
      </div>
    </div>
  );
}

function Layout() {
  const location = useLocation();
  const [showNapModal, setShowNapModal] = React.useState(false);
  const [showProfile, setShowProfile] = React.useState(false);

  React.useEffect(() => {
    setShowProfile(false);
  }, [location]);

  const forceLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    window.location.href = '/login';
  };

  React.useEffect(() => {
    const checkTime = () => {
      const now = new Date();
      const hrs = now.getHours();
      const mins = now.getMinutes();
      const totalMins = hrs * 60 + mins;
      const isNapTime = totalMins >= 1425 || totalMins <= 300;

      if (isNapTime) {
        const userStr = localStorage.getItem('user');
        if (userStr && window.location.pathname !== '/login') {
          const userData = JSON.parse(userStr);
          if (userData.role === 'admin') return;
          if (hrs === 23 && mins === 45) {
            if (!showNapModal) setShowNapModal(true);
          } else {
            forceLogout();
          }
        }
      }
    };

    const interval = setInterval(checkTime, 30000);
    checkTime();
    return () => clearInterval(interval);
  }, [location, showNapModal]);

  const hideNav = location.pathname === '/login' || location.pathname === '/attach-barcode';

  const user = getUser();
  const role = user?.role;
  const isAdmin = role === 'admin';
  const isLoggedIn = !!user?.username;
  // Permission-aware tabs. canAccess() honours admin bypass.
  const visibleNav = NAV_ITEMS.filter((item) => canAccess(user, item.to));
  // Non-admin users get a Profile sheet button (own identity + logout) regardless of permissions.
  const showProfileSheetTab = isLoggedIn && !isAdmin;
  const totalCols = visibleNav.length + (showProfileSheetTab ? 1 : 0);

  return (
    <div className="min-h-screen bg-slate-200 flex justify-center font-sans selection:bg-indigo-100">
      <div className="w-full max-w-md min-h-screen bg-slate-50 relative shadow-2xl overflow-x-hidden border-x border-slate-300">

        <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
          <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-indigo-300/10 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-pink-300/10 rounded-full blur-[100px]"></div>
        </div>

        <main className={`relative z-10 w-full h-full min-h-screen ${!hideNav ? 'pb-24' : ''}`}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<AuthGuard path="/"><Dashboard /></AuthGuard>} />
            <Route path="/orders" element={<AuthGuard path="/orders"><OrderReport /></AuthGuard>} />
            <Route path="/orders/:id" element={<AuthGuard path="/orders/:id"><OrderDetail /></AuthGuard>} />
            <Route path="/ledgers" element={<AuthGuard path="/ledgers"><LedgerReport /></AuthGuard>} />
            <Route path="/stock-items" element={<AuthGuard path="/stock-items"><StockReport /></AuthGuard>} />
            <Route path="/create-order" element={<AuthGuard path="/create-order"><CreateOrder /></AuthGuard>} />
            <Route path="/orders/edit/:id" element={<AuthGuard path="/orders/edit"><CreateOrder /></AuthGuard>} />
            <Route path="/profile" element={<AuthGuard path="/profile"><AdminProfile /></AuthGuard>} />
            <Route path="/godown" element={<AuthGuard path="/godown"><Godown /></AuthGuard>} />
            <Route path="/attach-barcode" element={<AuthGuard path="/attach-barcode"><AttachBarcode /></AuthGuard>} />
          </Routes>
        </main>

        {!hideNav && isLoggedIn && (
          <div className="fixed bottom-0 left-0 right-0 z-50">
            <nav className="bg-white/95 backdrop-blur-xl border-t border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] pb-safe">
              <div
                className="grid h-16 max-w-md mx-auto"
                style={{ gridTemplateColumns: `repeat(${Math.max(1, totalCols)}, minmax(0, 1fr))` }}
              >
                {visibleNav.map((item) => (
                  <NavLink key={item.to} to={item.to} icon={item.icon} label={item.label} />
                ))}
                {showProfileSheetTab && (
                  <NavButton
                    icon={UserCircle}
                    label="Profile"
                    onClick={() => setShowProfile(true)}
                    isActive={showProfile}
                  />
                )}
              </div>
            </nav>
          </div>
        )}

        {showProfile && <ProfileSheet onClose={() => setShowProfile(false)} />}

        <ConfirmModal
          isOpen={showNapModal}
          onClose={() => setShowNapModal(false)}
          onConfirm={forceLogout}
          title="🌙 It's Nap Time!"
          message="The system is undergoing scheduled maintenance (Tally Sync). Please take a rest and log in tomorrow morning. Sweet dreams!"
          confirmText="Logout Now"
          cancelText="Close"
        />

        <InstallPWA />
      </div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Layout />
    </Router>
  );
}

export default App;
