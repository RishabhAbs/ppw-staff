import { Controller, Get, Post, Patch, Delete, Body, Param, Request, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Repository } from 'typeorm';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth/auth.service';
import { PermissionsGuard } from './auth/permissions.guard';
import { RequirePermission } from './auth/permissions.decorator';

@Controller('users')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class UserController {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private authService: AuthService,
  ) {}

  @RequirePermission('staff')
  @Get()
  async findAll() {
    const users = await this.usersRepository.find();
    // `permissions` is `simple-json any`; normalize so the admin UI never
    // receives a non-array shape that breaks `permissions.includes(...)`.
    return users.map((u) => ({
      ...u,
      permissions: AuthService.normalizePermissions(u.permissions),
    }));
  }

  @Get('profile')
  getProfile(@Request() req) {
    return req.user;
  }

  @RequirePermission('staff')
  @Post()
  create(@Body() user: any) {
    return this.authService.register(user);
  }

  @RequirePermission('staff')
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUser: any) {
    // Coerce permissions to a clean string[] before persisting, so a bad
    // payload can't reintroduce a non-array value into the DB.
    if (updateUser && 'permissions' in updateUser) {
      updateUser.permissions = AuthService.normalizePermissions(
        updateUser.permissions,
      );
    }
    return this.usersRepository.update(id, updateUser);
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