import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true; // No role restriction
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user; // Added by JwtStrategy

    if (!user) {
      throw new ForbiddenException('No user found in request');
    }

    if (!user.role) {
      throw new ForbiddenException('User role missing');
    }

    const hasAccess = requiredRoles.includes(user.role);
    if (!hasAccess) {
      throw new ForbiddenException(`Access denied for role: ${user.role}`);
    }

    return true;
  }
}
