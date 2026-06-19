import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

// Accepts one or more permissions. When multiple are passed, the guard
// permits the request if the user has ANY of them (OR semantics).
//   @RequirePermission('orders')             — single perm (back-compat)
//   @RequirePermission('orders', 'reports')  — either perm allowed
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions.length === 1 ? permissions[0] : permissions);
