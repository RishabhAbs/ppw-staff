// Permission required to access each page. Mirrors the backend decorators
// in app.controller.ts. `null` means any authenticated user can hit it.
// Admins bypass everything (same as backend PermissionsGuard).
export function pathPermission(path: string): string | null {
  if (path === '/') return 'dashboard';
  if (path === '/orders') return 'reports';            // order list view
  if (path === '/orders/edit' || path.startsWith('/orders/')) return 'orders'; // order detail/edit
  if (path === '/create-order') return 'orders';
  if (path === '/ledgers') return 'reports';
  if (path === '/stock-items') return 'inventory';
  if (path === '/attach-barcode') return 'inventory';
  if (path === '/godown') return 'inventory';
  if (path === '/profile') return 'staff';
  return null;
}

export function hasPermission(user: any, perm: string | null): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true; // admin bypass — matches backend
  if (perm == null) return true;            // path is open to any logged-in user
  let perms: string[] = [];
  if (Array.isArray(user.permissions)) {
    perms = user.permissions;
  } else if (user.permissions && Array.isArray(user.permissions.system)) {
    perms = user.permissions.system;
  }
  return perms.includes(perm);
}

export function canAccess(user: any, path: string): boolean {
  return hasPermission(user, pathPermission(path));
}

// Pick the first page the user is allowed to see, in priority order.
// Falls back to /login if nothing is accessible (locked-out user).
export function getDefaultRoute(user: any): string {
  if (!user) return '/login';
  if (user.role === 'admin') return '/';
  const candidates = ['/', '/orders', '/create-order', '/stock-items', '/godown', '/profile'];
  for (const p of candidates) {
    if (canAccess(user, p)) return p;
  }
  return '/login';
}
