import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountRole, UserRole, UserStatus, type Prisma } from '@prisma/client';
import { parseSort } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, type AuditMetadata, type AuditWriteContext } from '../audit/audit.service';
import type { AdminUsersWhere } from './admin-users.repository';
import { AdminUsersRepository } from './admin-users.repository';
import {
  RevokeSessionsResponseDto,
  RevokeUserSessionsDto,
  UpdateUserStatusDto,
  UpdateUserRoleDto,
  UserStatusAction,
} from './dto/admin-user-action.dto';
import {
  AdminUserDetailDto,
  AdminUserListItemDto,
  AdminUserResponseDto,
  AdminUsersListResponseDto,
  toAdminUserProfileSummary,
  toAdminUserResponse,
} from './dto/admin-user-response.dto';

/** Sort allowlist of GET /admin/users (shared parseSort contract). */
const SORT_FIELDS = ['createdAt', 'phone', 'name', 'email'] as const;
type AdminUserSortField = (typeof SORT_FIELDS)[number];
const DEFAULT_SORT: { field: AdminUserSortField; order: 'asc' | 'desc' } = {
  field: 'createdAt',
  order: 'desc',
};

/** Machine codes of the admin guards (ROADMAP_REFERENCE.md §6). */
const SELF_ACTION_CODE = 'ADMIN_SELF_ACTION_FORBIDDEN';
const LAST_ADMIN_CODE = 'LAST_ADMIN_GUARD';
const ILLEGAL_TRANSITION_CODE = 'ILLEGAL_USER_STATUS_TRANSITION';

/**
 * The closed status transition table (action → allowed source statuses).
 * Anything not listed is a 400 ILLEGAL_USER_STATUS_TRANSITION; DELETED is
 * terminal — no resurrection (ACTIVATE never accepts it).
 */
const STATUS_TRANSITIONS: Record<UserStatusAction, UserStatus[]> = {
  [UserStatusAction.SUSPEND]: [UserStatus.ACTIVE],
  [UserStatusAction.BLOCK]: [UserStatus.ACTIVE, UserStatus.SUSPENDED],
  [UserStatusAction.ACTIVATE]: [UserStatus.SUSPENDED, UserStatus.BLOCKED],
  [UserStatusAction.DELETE]: [UserStatus.ACTIVE, UserStatus.SUSPENDED, UserStatus.BLOCKED],
};

/** Target status of each action (DELETE also stamps deletedAt — soft delete). */
const STATUS_TARGETS: Record<UserStatusAction, UserStatus> = {
  [UserStatusAction.SUSPEND]: UserStatus.SUSPENDED,
  [UserStatusAction.BLOCK]: UserStatus.BLOCKED,
  [UserStatusAction.ACTIVATE]: UserStatus.ACTIVE,
  [UserStatusAction.DELETE]: UserStatus.DELETED,
};

/** Actions that log the account out: everything except ACTIVATE. */
function isDisablingAction(action: UserStatusAction): boolean {
  return action !== UserStatusAction.ACTIVATE;
}

interface AdminUsersQuery {
  page: number;
  limit: number;
  sort?: string;
  q?: string;
  role?: UserRole;
  status?: UserStatus;
  accountRole?: AccountRole;
  onboarded?: boolean;
}

/**
 * Safe operational user management (admin panel Task 05) — the CANONICAL
 * /admin/users surface. Every mutation is an explicit, narrow action that:
 * runs in ONE service-owned transaction, revokes the target's active refresh
 * sessions whenever the action logs them out, appends an immutable audit row
 * carrying the required reason in the SAME transaction (audit failure rolls
 * the mutation back), and refuses to strand the system — no self-targeting,
 * never fewer than one ACTIVE admin. Passwords do not exist on this surface.
 */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly repository: AdminUsersRepository,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Deterministic paginated search (filters documented on AdminUsersQueryDto). */
  async list(query: AdminUsersQuery): Promise<AdminUsersListResponseDto> {
    const sort = parseSort(query.sort, SORT_FIELDS, DEFAULT_SORT);
    const where = await this.buildWhere(query);

    const { items, total } = await this.repository.findMany({
      page: query.page,
      limit: query.limit,
      // Unique-tiebreak: equal sort keys keep a total, stable order page over page.
      orderBy: [{ [sort.field]: sort.order }, { id: 'asc' }],
      where,
    });
    const profiles = await this.repository.findProfilesByUserIds(items.map((item) => item.id));

    const rows: AdminUserListItemDto[] = items.map((user) => ({
      ...toAdminUserResponse(user),
      profile: profiles.get(user.id) ?? null,
    }));
    return { items: rows, total, page: query.page, limit: query.limit };
  }

  /** Allowlisted detail: user + profile summary + bounded lot/deal counts. */
  async getDetail(id: string): Promise<AdminUserDetailDto> {
    const user = await this.repository.findById(id);
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    const [profile, lots, dealsAsBuyer, dealsAsSeller] = await Promise.all([
      this.repository.findProfileByUserId(id),
      this.repository.countLots(id),
      this.repository.countDealsAsBuyer(id),
      this.repository.countDealsAsSeller(id),
    ]);
    return {
      ...toAdminUserResponse(user),
      profile: toAdminUserProfileSummary(profile),
      counts: { lots, dealsAsBuyer, dealsAsSeller },
    };
  }

  /**
   * Explicit status transition (SUSPEND/BLOCK/ACTIVATE/DELETE). DELETE is the
   * SOFT delete: status DELETED + deletedAt stamp, row stays resolvable.
   * SUSPEND/BLOCK/DELETE revoke the active refresh sessions in the same
   * transaction, so a disabled account cannot refresh its way back in.
   */
  async updateStatus(
    id: string,
    dto: UpdateUserStatusDto,
    context: AuditWriteContext,
  ): Promise<AdminUserResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const user = await this.repository.findById(id, tx);
      if (!user) {
        throw new NotFoundException(`User ${id} not found`);
      }
      this.assertNotSelf(id, context);

      if (!STATUS_TRANSITIONS[dto.action].includes(user.status)) {
        throw new BadRequestException({
          code: ILLEGAL_TRANSITION_CODE,
          message: `Cannot ${dto.action} a user in status ${user.status}`,
        });
      }

      // The guard matters when the action flips a working admin out of the
      // active set (SUSPEND/BLOCK/DELETE — ACTIVATE never disables anyone).
      if (
        user.role === UserRole.ADMIN &&
        user.status === UserStatus.ACTIVE &&
        isDisablingAction(dto.action)
      ) {
        await this.assertOtherActiveAdminExists(id, tx);
      }

      const toStatus = STATUS_TARGETS[dto.action];
      const updated = await this.repository.updateStatus(
        id,
        {
          status: toStatus,
          ...(dto.action === UserStatusAction.DELETE ? { deletedAt: new Date() } : {}),
        },
        tx,
      );
      const revokedSessions = isDisablingAction(dto.action)
        ? await this.repository.revokeActiveSessions(id, tx)
        : 0;

      await this.audit.create(
        {
          ...context,
          action: 'user.status',
          entityType: 'User',
          entityId: id,
          metadata: {
            statusAction: dto.action,
            fromStatus: user.status,
            toStatus,
            reason: dto.reason,
            revokedSessions,
          } satisfies AuditMetadata,
        },
        tx,
      );
      return toAdminUserResponse(updated);
    });
  }

  /**
   * Explicit role transition. Promotion is a plain audited write; DEMOTION of
   * an ACTIVE admin also revokes their sessions (an ex-admin must not keep
   * working sessions). Self and last-active-admin guards apply.
   */
  async updateRole(
    id: string,
    dto: UpdateUserRoleDto,
    context: AuditWriteContext,
  ): Promise<AdminUserResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const user = await this.repository.findById(id, tx);
      if (!user) {
        throw new NotFoundException(`User ${id} not found`);
      }
      this.assertNotSelf(id, context);

      if (dto.role === user.role) {
        // No mutation and no revocation — but the attempted privileged action
        // is still audited so the trail reflects every operator submission.
        await this.audit.create(
          {
            ...context,
            action: 'user.role',
            entityType: 'User',
            entityId: id,
            metadata: {
              fromRole: user.role,
              toRole: dto.role,
              reason: dto.reason,
              revokedSessions: 0,
            } satisfies AuditMetadata,
          },
          tx,
        );
        return toAdminUserResponse(user);
      }

      const demoting = user.role === UserRole.ADMIN && dto.role === UserRole.USER;
      if (demoting && user.status === UserStatus.ACTIVE) {
        await this.assertOtherActiveAdminExists(id, tx);
      }

      const updated = await this.repository.updateRole(id, dto.role, tx);
      const revokedSessions = demoting ? await this.repository.revokeActiveSessions(id, tx) : 0;

      await this.audit.create(
        {
          ...context,
          action: 'user.role',
          entityType: 'User',
          entityId: id,
          metadata: {
            fromRole: user.role,
            toRole: dto.role,
            reason: dto.reason,
            revokedSessions,
          } satisfies AuditMetadata,
        },
        tx,
      );
      return toAdminUserResponse(updated);
    });
  }

  /** Kills every active refresh session of the account; always audited. */
  async revokeSessions(
    id: string,
    dto: RevokeUserSessionsDto,
    context: AuditWriteContext,
  ): Promise<RevokeSessionsResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const user = await this.repository.findById(id, tx);
      if (!user) {
        throw new NotFoundException(`User ${id} not found`);
      }
      this.assertNotSelf(id, context);

      const revokedSessions = await this.repository.revokeActiveSessions(id, tx);
      await this.audit.create(
        {
          ...context,
          action: 'user.sessions',
          entityType: 'User',
          entityId: id,
          metadata: { reason: dto.reason, revokedSessions } satisfies AuditMetadata,
        },
        tx,
      );
      return { id, revokedSessions };
    });
  }

  /** Guards are for OTHERS: an admin never targets their own account. */
  private assertNotSelf(targetId: string, context: AuditWriteContext): void {
    if (targetId === context.actorId) {
      throw new ConflictException({
        code: SELF_ACTION_CODE,
        message: 'Admins cannot perform this action on their own account',
      });
    }
  }

  /**
   * Last-active-admin guard (contract decision: count ACTIVE admins only).
   * Fires when the target is the sole remaining ACTIVE admin.
   */
  private async assertOtherActiveAdminExists(
    targetId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const otherActiveAdmins = await this.repository.countActiveAdminsExcluding(targetId, tx);
    if (otherActiveAdmins === 0) {
      throw new ConflictException({
        code: LAST_ADMIN_CODE,
        message: 'The last active admin cannot be demoted, suspended, blocked or deleted',
      });
    }
  }

  /** Composes the search where; the q-arm spans user fields + business name. */
  private buildWhere(query: AdminUsersQuery): AdminUsersWhere {
    const where: AdminUsersWhere = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.accountRole ? { accountRoles: { has: query.accountRole } } : {}),
      ...(query.onboarded !== undefined
        ? { onboardingCompletedAt: query.onboarded ? { not: null } : null }
        : {}),
    };

    if (query.q) {
      const term = query.q;
      where.OR = [
        { phone: { contains: term, mode: 'insensitive' } },
        { name: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        // Bounded to-one relation filter — the profile join happens inside the
        // page query, never an unbounded profile-id pre-resolution.
        { profile: { is: { businessName: { contains: term, mode: 'insensitive' } } } },
      ];
    }
    return where;
  }
}
