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

// Each permission mapped to its landing page, in the SAME order as the
// permission tabs (Dashboard → Inventory → Orders → Staff → Reports).
// The user lands on the FIRST page their permissions grant, in this order.
const PERM_LANDING: Array<[string, string]> = [
  ['dashboard', '/'],
  ['inventory', '/stock-items'],
  ['orders', '/create-order'],
  ['staff', '/profile'],
  ['reports', '/orders'],
];

function systemPerms(user: any): string[] {
  if (!user) return [];
  if (Array.isArray(user.permissions)) return user.permissions;
  if (user.permissions && Array.isArray(user.permissions.system)) return user.permissions.system;
  return [];
}

// Pick the first page the user is allowed to see, following permission-tab order.
// Falls back to /login only if the user has no page permissions at all.
export function getDefaultRoute(user: any): string {
  if (!user) return '/login';
  if (user.role === 'admin') return '/';
  const perms = systemPerms(user);
  for (const [perm, path] of PERM_LANDING) {
    if (perms.includes(perm)) return path;
  }
  return '/login';
}
