import { apiSchemas } from '../generated/schema.zod';
import { loginResponseSchema, loginSchema, userResponseSchema } from '../index';

const sampleUser = {
  id: 'clxsamplecuid',
  phone: '09120000000',
  email: 'jane@example.com',
  name: 'Jane Doe',
  role: 'USER',
  status: 'ACTIVE',
  accountRoles: ['BUYER'],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('generated zod schemas', () => {
  it('validates a login payload', () => {
    expect(loginSchema.safeParse({ email: 'jane@example.com', password: 'secret' }).success).toBe(
      true,
    );
    expect(loginSchema.safeParse({ email: 'not-an-email', password: 'secret' }).success).toBe(
      false,
    );
  });

  it('validates user responses with ISO date-times', () => {
    expect(userResponseSchema.safeParse(sampleUser).success).toBe(true);
    expect(userResponseSchema.safeParse({ ...sampleUser, createdAt: 'yesterday' }).success).toBe(
      false,
    );
  });

  it('requires phone and allows a null email (phone-based identity)', () => {
    const { phone, ...withoutPhone } = sampleUser;
    expect(phone).toBe('09120000000');
    expect(userResponseSchema.safeParse(withoutPhone).success).toBe(false);
    expect(
      userResponseSchema.safeParse({ ...sampleUser, email: null, accountRoles: [] }).success,
    ).toBe(true);
  });

  it('validates login responses', () => {
    expect(loginResponseSchema.safeParse({ accessToken: 'a.b.c', user: sampleUser }).success).toBe(
      true,
    );
    expect(loginResponseSchema.safeParse({ accessToken: 'a.b.c' }).success).toBe(false);
  });

  it('exposes every component schema in the registry', () => {
    const names = Object.keys(apiSchemas);
    for (const expected of [
      'LoginDto',
      'RegisterDto',
      'UserResponseDto',
      'LoginResponseDto',
      'CreateUserDto',
      'UpdateUserDto',
    ]) {
      expect(names).toContain(expected);
    }
  });
});
