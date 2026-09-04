import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
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
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersQueryDto } from './dto/users-query.dto';
import { UsersService } from './users.service';

/**
 * Reference domain module — mirror this structure for new domains
 * (or run `npm run gen:module`). Controller is thin: routing + DTO wiring only.
 */
@ApiTags('users')
@ApiBearerAuth('access-token')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ description: 'Paginated<UserResponseDto>: { items, total, page, limit }' })
  @ApiOperation({ summary: 'List users (paginated, filterable) — admin only' })
  async list(@Query() query: UsersQueryDto): Promise<Paginated<UserResponseDto>> {
    return this.users.list(query);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: UserResponseDto })
  @ApiOperation({ summary: 'Get a user by id — admin only' })
  async getById(@Param('id') id: string): Promise<UserResponseDto> {
    return this.users.getById(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiOperation({ summary: 'Create a user — admin only' })
  async create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.users.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: UserResponseDto })
  @ApiOperation({ summary: 'Update a user — admin only' })
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto): Promise<UserResponseDto> {
    return this.users.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a user — admin only' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.users.remove(id);
  }
}
