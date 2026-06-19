import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { AuthService } from './auth/auth.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AppService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private authService: AuthService,
  ) {}

  async onModuleInit() {
    const admin = await this.userRepository.findOne({
      where: { username: 'admin' },
    });
    if (!admin) {
      console.log('Creating default admin user...');
      await this.authService.register({
        username: 'admin',
        password: 'password',
        role: 'admin',
      });
      console.log('Default admin user created: admin / password');
    } else if (admin.password === 'password') {
      console.log('Migrating admin password to hash...');
      // Update with hashed password
      const salt = await bcrypt.genSalt();
      const hashedPassword = await bcrypt.hash('password', salt);

      await this.userRepository.update(
        { id: admin.id },
        { password: hashedPassword },
      );
      console.log('Admin password migrated.');
    }
  }

  getHello(): string {
    return 'Hello World!';
  }
}
