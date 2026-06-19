import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { jwtConstants } from './constants';
import { User } from '../entities/user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtConstants.secret,
    });
  }

  async validate(payload: any) {
    // Fetch fresh permissions from DB so admin changes take effect immediately
    // (mirrors admin-customer's strategy). The PermissionsGuard reads
    // req.user.permissions, so it MUST be populated here.
    const user = await this.userRepository.findOne({
      where: { id: payload.id || payload.sub },
    });
    return {
      id: payload.id || payload.sub,
      userId: payload.sub,
      username: payload.username,
      role: payload.role,
      name: payload.name,
      permissions: user?.permissions ?? payload.permissions ?? [],
    };
  }
}
