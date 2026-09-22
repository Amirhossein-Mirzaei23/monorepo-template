import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { type Prisma, UserRole } from '@prisma/client';
import { hash } from 'bcryptjs';
import { type Paginated, type ParsedSort, parseSort } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateUserDto } from './dto/create-user.dto';
import { type UserResponseDto, toUserResponse } from './dto/user-response.dto';
import type { UsersQueryDto } from './dto/users-query.dto';
import { UsersRepository } from './users.repository';

const BCRYPT_ROUNDS = 10;

const SORT_FIELDS = ['createdAt', 'phone', 'email', 'name'] as const;
type UserSortField = (typeof SORT_FIELDS)[number];
const DEFAULT_SORT: ParsedSort<UserSortField> = { field: 'createdAt', order: 'desc' };

/**
 * Business rules for the users domain. This layer owns transaction boundaries:
 * it opens `prisma.$transaction` and passes the client down to the repository.
 *
 * Admin panel Task 05: the generic admin update (role/password mutation) and
 * the hard `remove` were REMOVED — operational account changes belong to the
 * canonical /admin/users surface (AdminUsersService). This service keeps the
 * admin-managed creation path and the deprecated legacy reads.
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
      phone: query.phone,
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
    const existing = await this.repository.findByPhone(dto.phone);
    if (existing) {
      throw new ConflictException(`Phone ${dto.phone} is already registered`);
    }
    // `!= null` (not `!== undefined`): class-validator's @IsOptional() lets an
    // explicit `email: null` through, and null must not reach a unique lookup.
    if (dto.email != null) {
      const emailClash = await this.repository.findByEmail(dto.email);
      if (emailClash) {
        throw new ConflictException(`Email ${dto.email} is already registered`);
      }
    }

    const user = await this.repository.create({
      phone: dto.phone,
      email: dto.email,
      name: dto.name,
      passwordHash: await hash(dto.password, BCRYPT_ROUNDS),
      role: dto.role ?? UserRole.USER,
    });
    return toUserResponse(user);
  }
}
