import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { type Prisma, UserRole } from '@prisma/client';
import { hash } from 'bcryptjs';
import { type Paginated, type ParsedSort, parseSort } from '../../common/dto/pagination-query.dto';
import type { PrismaService } from '../../prisma/prisma.service';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import { type UserResponseDto, toUserResponse } from './dto/user-response.dto';
import type { UsersQueryDto } from './dto/users-query.dto';
import type { UsersRepository } from './users.repository';

const BCRYPT_ROUNDS = 10;

const SORT_FIELDS = ['createdAt', 'email', 'name'] as const;
type UserSortField = (typeof SORT_FIELDS)[number];
const DEFAULT_SORT: ParsedSort<UserSortField> = { field: 'createdAt', order: 'desc' };

/**
 * Business rules for the users domain. This layer owns transaction boundaries:
 * it opens `prisma.$transaction` and passes the client down to the repository.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly repository: UsersRepository,
    private readonly prisma: PrismaService,
  ) {}

  async list(query: UsersQueryDto): Promise<Paginated<UserResponseDto>> {
    const sort = parseSort(query.sort, SORT_FIELDS, DEFAULT_SORT);
    const where: Prisma.UserWhereInput = {
      email: query.email,
      role: query.role,
    };

    const { items, total } = await this.repository.findMany({
      page: query.page,
      limit: query.limit,
      where,
      orderBy: { [sort.field]: sort.order },
    });

    return {
      items: items.map(toUserResponse),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async getById(id: string): Promise<UserResponseDto> {
    const user = await this.repository.findById(id);
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return toUserResponse(user);
  }

  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    const existing = await this.repository.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException(`Email ${dto.email} is already registered`);
    }

    const user = await this.repository.create({
      email: dto.email,
      name: dto.name,
      passwordHash: await hash(dto.password, BCRYPT_ROUNDS),
      role: dto.role ?? UserRole.USER,
    });
    return toUserResponse(user);
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await this.repository.findById(id, tx);
      if (!current) {
        throw new NotFoundException(`User ${id} not found`);
      }
      if (dto.email && dto.email !== current.email) {
        const clash = await this.repository.findByEmail(dto.email, tx);
        if (clash) {
          throw new ConflictException(`Email ${dto.email} is already registered`);
        }
      }

      const data: Prisma.UserUpdateInput = {};
      if (dto.email !== undefined) data.email = dto.email;
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.role !== undefined) data.role = dto.role;
      if (dto.password !== undefined) data.passwordHash = await hash(dto.password, BCRYPT_ROUNDS);

      return this.repository.update(id, data, tx);
    });
    return toUserResponse(updated);
  }

  async remove(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const user = await this.repository.findById(id, tx);
      if (!user) {
        throw new NotFoundException(`User ${id} not found`);
      }
      await this.repository.delete(id, tx);
    });
  }
}
