import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Repository } from 'typeorm';
import { AuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { PermissionsGuard } from './auth/permissions.guard';
import { RequirePermission } from './auth/permissions.decorator';

@Controller('users')
@UseGuards(AuthGuard, PermissionsGuard)
export class UserController {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private authService: AuthService,
  ) {}

  @RequirePermission('staff')
  @Get()
  findAll() {
    return this.usersRepository.find();
  }

  // /profile is open to any authenticated user — they're reading their own JWT payload.
  @Get('profile')
  getProfile(@Request() req) {
    return req.user;
  }

  @RequirePermission('staff')
  @Post()
  create(@Body() user: any) {
    // Use AuthService to register so password gets hashed
    return this.authService.register(user);
  }

  @RequirePermission('staff')
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUser: Partial<User>) {
    return this.usersRepository.update(id, updateUser);
  }

  @RequirePermission('staff')
  @Patch(':id/toggle-active')
  async toggleActive(@Param('id') id: string) {
    const user = await this.usersRepository.findOneBy({ id: parseInt(id) });
    if (!user) throw new Error('User not found');
    if (user.username === 'admin') throw new Error('Cannot deactivate the main Admin');
    user.is_active = !user.is_active;
    if (!user.is_active) user.token_version += 1;
    await this.usersRepository.save(user);
    return { is_active: user.is_active };
  }

  @RequirePermission('staff')
  @Patch(':id/force-logout')
  async forceLogout(@Param('id') id: string) {
    const user = await this.usersRepository.findOneBy({ id: parseInt(id) });
    if (!user) throw new Error('User not found');
    user.token_version += 1;
    await this.usersRepository.save(user);
    return { success: true };
  }

  @RequirePermission('staff')
  @Delete(':id')
  async remove(@Param('id') id: string) {
    const userToDelete = await this.usersRepository.findOneBy({
      id: parseInt(id),
    });
    if (userToDelete && userToDelete.username === 'admin') {
      throw new Error('Cannot delete the main Admin user');
    }
    return this.usersRepository.delete(id);
  }
}
