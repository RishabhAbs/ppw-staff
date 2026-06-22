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

  async login(user: any) {
    const payload = {
      username: user.username,
      sub: user.id,
      id: user.id,
      role: user.role,
      name: user.name,
      permissions: user.permissions || [],
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
