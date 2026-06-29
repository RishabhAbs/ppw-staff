import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
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
    const user = await this.userRepository.findOne({
      where: { id: payload.id || payload.sub },
    });
    if (!user || !user.is_active) {
      throw new UnauthorizedException('Account is deactivated');
    }
    if ((payload.token_version ?? 0) !== user.token_version) {
      throw new UnauthorizedException('Session expired');
    }
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
