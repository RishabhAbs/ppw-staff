// Permission required to access each page. Mirrors the backend decorators
// in app.controller.ts. `null` means any authenticated user can hit it.
// Admins bypass everything (same as backend PermissionsGuard).
export function pathPermission(path: string): string | null {
  // Dashboard is admin-only. Returning the '__admin__' sentinel means only the
  // admin-role bypass in hasPermission() can satisfy it — no employee is ever
  // granted this permission, so non-admins never see Home/Dashboard and are
  // routed to their first real page (e.g. /orders) on login.
  if (path === '/') return '__admin__';
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
  // The order History list (/orders) should be visible to anyone who works with
  // orders, so grant it on either `reports` (its own perm) OR `orders` (New
  // Order). Without this, a user given only "New Order" never sees the History
  // tab even though they can create the orders it lists.
  if (path === '/orders') {
    return hasPermission(user, 'reports') || hasPermission(user, 'orders');
  }
  return hasPermission(user, pathPermission(path));
}

// Pick the first page the user is allowed to see, in priority order.
// Falls back to /login if nothing is accessible (locked-out user).
export function getDefaultRoute(user: any): string {
  if (!user) return '/login';
  if (user.role === 'admin') return '/';
  // On a fresh open, prefer the New Order page when the user can create orders;
  // then fall back to History and the rest.
  const candidates = ['/create-order', '/orders', '/stock-items', '/godown', '/profile'];
  for (const p of candidates) {
    if (canAccess(user, p)) return p;
  }
  return '/login';
}
