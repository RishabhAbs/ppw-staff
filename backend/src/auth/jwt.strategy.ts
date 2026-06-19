import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { jwtConstants } from './constants';
import { User } from '../entities/user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    config: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // Same JWT_SECRET fallback contract as auth.module.ts —
      // both must agree or token verification breaks.
      secretOrKey: config.get<string>('JWT_SECRET') || jwtConstants.secret,
    });
  }

  async validate(payload: any) {
    // Fetch fresh permissions from DB so admin changes take effect immediately
    // (mirrors admin-customer's strategy).
    const user = await this.userRepository.findOne({
      where: { id: payload.id || payload.sub },
    });
    return {
      id: payload.id || payload.sub,
      userId: payload.sub,
      username: payload.username,
      role: payload.role,
      name: payload.name,
      permissions: user?.permissions || [],
    };
  }
}
