import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';
import { type AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  RevokeSessionsResponseDto,
  RevokeUserSessionsDto,
  UpdateUserStatusDto,
  UpdateUserRoleDto,
} from './dto/admin-user-action.dto';
import {
  AdminUserDetailDto,
  AdminUserResponseDto,
  AdminUsersListResponseDto,
} from './dto/admin-user-response.dto';
import { AdminUsersQueryDto } from './dto/admin-users-query.dto';
import { AdminUsersService } from './admin-users.service';

/**
 * The canonical admin user-management surface (admin panel Task 05): safe
 * search/detail reads plus narrow, audited status/role/session actions. This
 * REPLACES the legacy generic PATCH/DELETE /users/:id paths — there is no
 * hard delete (status DELETE is soft) and no password channel here. Guarded
 * by the global JwtAuthGuard + RolesGuard pair and @Roles(ADMIN); self-action
 * and last-active-admin invariants live in the service.
 */
@ApiTags('admin')
@ApiBearerAuth('access-token')
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly adminUsers: AdminUsersService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: AdminUsersListResponseDto })
  @ApiOperation({
    summary:
      'Search users (q spans phone/name/email/business name; role/status/accountRole/onboarded filters) — admin only',
  })
  async list(@Query() query: AdminUsersQueryDto): Promise<AdminUsersListResponseDto> {
    return this.adminUsers.list(query);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: AdminUserDetailDto })
  @ApiNotFoundResponse({ description: 'Unknown user id' })
  @ApiOperation({
    summary: 'Allowlisted user detail: profile summary + bounded lot/deal counts — admin only',
  })
  async getDetail(@Param('id') id: string): Promise<AdminUserDetailDto> {
    return this.adminUsers.getDetail(id);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: AdminUserResponseDto })
  @ApiBadRequestResponse({
    description: 'Illegal transition (code ILLEGAL_USER_STATUS_TRANSITION) or validation',
  })
  @ApiConflictResponse({
    description: 'Self-action or last-active-admin guard (409 machine code in body)',
  })
  @ApiNotFoundResponse({ description: 'Unknown user id' })
  @ApiOperation({
    summary:
      'Suspend / block / activate / soft-delete a user (reason required, sessions revoked, audited) — admin only',
  })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() user: AuthUser,
    @Req() request: Request & { id?: string },
  ): Promise<AdminUserResponseDto> {
    return this.adminUsers.updateStatus(id, dto, auditContext(user, request));
  }

  @Patch(':id/role')
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: AdminUserResponseDto })
  @ApiConflictResponse({
    description: 'Self-action or last-active-admin guard (409 machine code in body)',
  })
  @ApiNotFoundResponse({ description: 'Unknown user id' })
  @ApiOperation({
    summary:
      'Promote/demote a user role (reason required, demotion revokes sessions, audited) — admin only',
  })
  async updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser() user: AuthUser,
    @Req() request: Request & { id?: string },
  ): Promise<AdminUserResponseDto> {
    return this.adminUsers.updateRole(id, dto, auditContext(user, request));
  }

  @Post(':id/revoke-sessions')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: RevokeSessionsResponseDto })
  @ApiConflictResponse({ description: 'Self-action guard (409 machine code in body)' })
  @ApiNotFoundResponse({ description: 'Unknown user id' })
  @ApiOperation({
    summary:
      'Revoke every active refresh session of a user (reason required, audited) — admin only',
  })
  async revokeSessions(
    @Param('id') id: string,
    @Body() dto: RevokeUserSessionsDto,
    @CurrentUser() user: AuthUser,
    @Req() request: Request & { id?: string },
  ): Promise<RevokeSessionsResponseDto> {
    return this.adminUsers.revokeSessions(id, dto, auditContext(user, request));
  }
}

function auditContext(user: AuthUser, request: Request & { id?: string }) {
  return {
    actorId: user.sub,
    requestId: request.id ?? 'unknown',
    ip: request.ip ?? request.socket.remoteAddress ?? 'unknown',
  };
}
