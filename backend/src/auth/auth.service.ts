import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private jwtService: JwtService,
  ) {}

  async validateUser(username: string, pass: string): Promise<any> {
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('LOWER(user.username) = LOWER(:username)', { username })
      .getOne();
    if (user) {
      // Block deactivated accounts before any password check.
      if (user.is_active === false) {
        throw new UnauthorizedException('Account is deactivated');
      }
      // 1. Try bcrypt compare (for migrated users)
      const isMatch = await bcrypt.compare(pass, user.password);
      if (isMatch) {
        const { password, ...result } = user;
        return result;
      }

      // 2. Legacy Fallback: Check plain text (for existing users)
      if (user.password === pass) {
        // Auto-migrate to hash for next time
        const salt = await bcrypt.genSalt();
        const hashedPassword = await bcrypt.hash(pass, salt);
        await this.usersRepository.update(user.id, {
          password: hashedPassword,
        });

        const { password, ...result } = user;
        return result;
      }
    }
    return null;
  }

  /**
   * Normalize the `simple-json` permissions value WITHOUT destroying its shape.
   *
   * The admin UI stores a structured object:
   *   { system: string[], orderTypes, godowns, allowedParents, allowedCategories }
   * where `system` is the list of page permissions. The backend PermissionsGuard
   * and the frontend hasPermission() both read either a flat string[] OR
   * `permissions.system`, so BOTH shapes are valid and must be preserved.
   *
   * This only:
   *  - parses a JSON-encoded string into its real value,
   *  - cleans a flat array to string[],
   *  - normalizes a bare comma-separated string to string[],
   *  - returns [] for genuinely empty/garbage scalars (number, null, etc.).
   * A structured object is returned untouched (with `system` cleaned) so saved
   * page permissions are never wiped.
   */
  static normalizePermissions(value: any): string[] | Record<string, any> {
    if (Array.isArray(value)) {
      return value.filter((p) => typeof p === 'string');
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return [];
      try {
        const parsed = JSON.parse(trimmed);
        // Recurse so a JSON-encoded object keeps its structure.
        return AuthService.normalizePermissions(parsed);
      } catch {
        // Not JSON — treat as a comma-separated list.
      }
      return trimmed
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
    }
    if (value && typeof value === 'object') {
      // Structured permissions object — preserve it, just clean `system`.
      const system = Array.isArray(value.system)
        ? value.system.filter((p: any) => typeof p === 'string')
        : [];
      return { ...value, system };
    }
    return [];
  }

  async login(user: any) {
    const payload = {
      username: user.username,
      sub: user.id,
      id: user.id,
      role: user.role,
      name: user.name,
      // `permissions` is a `simple-json any` column, so a row may hold a
      // non-array (object/string) and crash the frontend's
      // `permissions.includes(...)`. Always hand back a real string[].
      permissions: AuthService.normalizePermissions(user.permissions),
    };
    return {
      access_token: this.jwtService.sign(payload),
      user: payload, // Return user info for frontend convenience
    };
  }

  async register(userDto: any) {
    // Check if user exists
    const existing = await this.usersRepository.findOne({
      where: { username: userDto.username },
    });
    if (existing) throw new ConflictException('Username already exists');

    // Hash password
    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(userDto.password, salt);

    // Default permissions to [] (strict) when admin doesn't explicitly send any.
    // The boot-time backfill only touches NULL rows, so this stays empty until
    // admin ticks boxes via the user-management UI.
    const newUser = this.usersRepository.create({
      ...userDto,
      password: hashedPassword,
      permissions: userDto.permissions ?? [],
    });

    try {
      return await this.usersRepository.save(newUser);
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') {
        throw new ConflictException('Username already exists');
      }
      throw err;
    }
  }
}
