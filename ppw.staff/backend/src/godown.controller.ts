import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Get,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GodownEntry } from './entities/godown-entry.entity';
import { AuthGuard } from './auth/auth.guard';

@Controller('godown')
@UseGuards(AuthGuard)
export class GodownController {
  constructor(
    @InjectRepository(GodownEntry)
    private godownRepository: Repository<GodownEntry>,
  ) {}

  private getCleanSql(column: string): string {
    const specials = [
      ' ',
      '-',
      '.',
      '/',
      '(',
      ')',
      '[',
      ']',
      '_',
      '{',
      '}',
      '&',
      '@',
    ];
    let sql = column;
    for (const char of specials) {
      sql = `REPLACE(${sql}, '${char}', '')`;
    }
    return sql;
  }

  @Post('entries')
  async create(@Body() entryData: Partial<GodownEntry>, @Request() req) {
    try {
      const entry = this.godownRepository.create({
        ...entryData,
        user_id: req.user.sub, // From JWT payload
        user_name: req.user.username || req.user.name, // Persist name
      });
      // Remove potentially dangerous manual overrides if any
      if ((entry as any).id) delete (entry as any).id;

      return await this.godownRepository.save(entry);
    } catch (error) {
      console.error('Error creating godown entry:', error);
      throw error;
    }
  }

  @Get('entries')
  async findAll(
    @Request() req,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
    @Query('search') search: string = '',
  ) {
    try {
      const user = req.user;
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50));
      const skip = (pageNum - 1) * limitNum;

      const query = this.godownRepository
        .createQueryBuilder('entry')
        .leftJoinAndSelect('entry.user', 'user')
        .orderBy('entry.created_at', 'DESC');

      // If not admin, restrict to own entries
      if (user.role !== 'admin') {
        query.where('entry.user_id = :userId', { userId: user.sub });
      }

      // Add search condition
      if (search) {
        const sanitizedSearch = search.replace(/[^a-zA-Z0-9]/g, '');
        const cleanItemName = this.getCleanSql('entry.item_name');
        const cleanBrand = this.getCleanSql('entry.brand');
        const cleanSku = this.getCleanSql('entry.sku');

        const searchCondition = `(${cleanItemName} LIKE :search OR ${cleanBrand} LIKE :search OR ${cleanSku} LIKE :search)`;

        if (user.role !== 'admin') {
          query.andWhere(searchCondition, { search: `%${sanitizedSearch}%` });
        } else {
          query.where(searchCondition, { search: `%${sanitizedSearch}%` });
        }
      }

      const [data, total] = await query
        .skip(skip)
        .take(limitNum)
        .getManyAndCount();

      return {
        data,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      };
    } catch (error) {
      console.error('Error in Godown findAll:', error);
      throw error;
    }
  }

  // New Update Endpoint
  @Post('entries/:id') // Using POST for compatibility, could be PATCH
  async update(
    @Request() req,
    @Body() updateData: Partial<GodownEntry>,
    @Param('id') id: string,
  ) {
    try {
      const user = req.user;
      const entryId = parseInt(id);
      console.log(
        `Debug: Updating entry ${entryId} by user ${user.username} (${user.sub})`,
      ); // Console log for immediate visibility

      const entry = await this.godownRepository.findOne({
        where: { id: entryId },
      });

      if (!entry) {
        console.warn(`Debug: Entry ${entryId} not found`);
        throw new Error('Entry not found');
      }

      // Permission Check: Owner or Admin
      if (entry.user_id !== user.sub && user.role !== 'admin') {
        console.warn(`Debug: Unauthorized access to entry ${entryId}`);
        throw new Error('Unauthorized to edit this entry');
      }

      // Sanitize updateData to prevent overwriting critical fields
      delete updateData.id;
      delete updateData.user_id;
      delete updateData.created_at;

      console.log('Debug: Applying updates:', updateData);

      // Apply updates
      Object.assign(entry, updateData);

      return await this.godownRepository.save(entry);
    } catch (error) {
      console.error('Debug: Error updating godown entry:', error);
      throw error; // Let NestJS handle the 500, but now we have logs
    }
  }
}
