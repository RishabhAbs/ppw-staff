import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string | string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || (Array.isArray(required) && required.length === 0)) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;

    if (user.role === 'admin') {
      return true;
    }

    let explicitPerms: string[] = [];
    if (Array.isArray(user.permissions)) {
      explicitPerms = user.permissions;
    } else if (user.permissions && Array.isArray(user.permissions.system)) {
      explicitPerms = user.permissions.system;
    }

    const requiredList = Array.isArray(required) ? required : [required];
    const hasAny = requiredList.some((p) => explicitPerms.includes(p));

    if (!hasAny) {
      throw new ForbiddenException(
        `Insufficient permission. Need one of: ${requiredList.join(', ')}`,
      );
    }

    return true;
  }
}