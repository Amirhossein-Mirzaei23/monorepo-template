import type { LoginResponseDto, UserResponseDto } from '@monorepo/shared-types';

/** Feature-level type re-exports: consumers import from the barrel, not the package. */
export type Session = LoginResponseDto;
export type CurrentUser = UserResponseDto;
