import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { Paginated } from '../../common/dto/pagination-query.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersQueryDto } from './dto/users-query.dto';
import { UsersService } from './users.service';

/**
 * Reference domain module — mirror this structure for new domains
 * (or run `npm run gen:module`). Controller is thin: routing + DTO wiring only.
 *
 * Admin panel Task 05 split: the CANONICAL operational surface is
 * `/admin/users` (AdminUsersController — safe search, allowlisted detail,
 * narrow audited status/role/session actions). What remains here is the
 * staged legacy alias agreed in ADMIN_CONTRACT.md: the reads stay as
 * deprecated aliases, POST /users stays the admin-managed account creation
 * path, and the unsafe generic PATCH/DELETE /users/:id routes are REMOVED —
 * hard delete and password mutation are no longer reachable anywhere.
 */
@ApiTags('users')
@ApiBearerAuth('access-token')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ description: 'Paginated<UserResponseDto>: { items, total, page, limit }' })
  @ApiOperation({
    summary: 'List users (paginated, filterable) — admin only',
    description: 'Deprecated alias — use GET /admin/users (canonical admin surface).',
    deprecated: true,
  })
  async list(@Query() query: UsersQueryDto): Promise<Paginated<UserResponseDto>> {
    return this.users.list(query);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: UserResponseDto })
  @ApiOperation({
    summary: 'Get a user by id — admin only',
    description: 'Deprecated alias — use GET /admin/users/:id (allowlisted admin detail).',
    deprecated: true,
  })
  async getById(@Param('id') id: string): Promise<UserResponseDto> {
    return this.users.getById(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiOperation({
    summary: 'Create a user — admin only',
    description:
      'Admin-managed account creation (admins are seeded/managed, never self-registered). ' +
      'Lifecycle changes belong to /admin/users/:id/status and /admin/users/:id/role.',
  })
  async create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.users.create(dto);
  }
}
