import { apiSchemas } from '../generated/schema.zod';
import {
  loginResponseSchema,
  loginSchema,
  lotCardResponseSchema,
  otpVerifyResponseSchema,
  otpRequestSchema,
  otpVerifySchema,
  userResponseSchema,
} from '../index';

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

  it('validates OTP request/verify payloads', () => {
    // Structural checks only — the phone regex / 6-digit code rules are
    // enforced by the API's class-validator DTOs and re-declared client-side
    // by AUTH-004's zod schemas (the codegen maps types, not patterns).
    expect(otpRequestSchema.safeParse({ phone: '09121234567' }).success).toBe(true);
    expect(
      otpRequestSchema.safeParse({ phone: '09121234567', clientType: 'android' }).success,
    ).toBe(true);
    expect(otpRequestSchema.safeParse({}).success).toBe(false);
    expect(otpRequestSchema.safeParse({ phone: '09121234567', clientType: 'ios' }).success).toBe(
      false,
    );

    expect(otpVerifySchema.safeParse({ phone: '09121234567', code: '123456' }).success).toBe(true);
    expect(otpVerifySchema.safeParse({ phone: '09121234567' }).success).toBe(false);
  });

  it('validates OTP verify responses (session + onboarding flag)', () => {
    expect(
      otpVerifyResponseSchema.safeParse({
        accessToken: 'a.b.c',
        user: sampleUser,
        onboardingCompleted: true,
      }).success,
    ).toBe(true);
    expect(
      otpVerifyResponseSchema.safeParse({ accessToken: 'a.b.c', user: sampleUser }).success,
    ).toBe(false);
  });

  it('validates lot card payloads keeping the recomposed seller block (MKT-001/005)', () => {
    const payload = {
      id: 'clxsamplecuid',
      code: '7Kd2Qm9x',
      title: 'عمده پیراهن مردانه — ۵۰ عدد',
      unitPrice: 2_250_000,
      totalPrice: 112_500_000,
      quantity: 50,
      availableQuantity: 50,
      unit: 'PIECE',
      condition: 'GRADE_A',
      city: 'tehran',
      province: 'tehran',
      coverThumbUrl: null,
      seller: { id: 'clxseller01', name: 'مینا رضایی', businessName: null },
      verifiedSeller: false,
      updatedAt: '2026-09-05T00:00:00.000Z',
      createdAt: '2026-09-05T00:00:00.000Z',
      expiresAt: '2026-10-05T00:00:00.000Z',
    };
    // The seller fields survive the parse (the raw generated schema strips them).
    const parsed = lotCardResponseSchema.parse(payload);
    expect(parsed.seller).toEqual({ id: 'clxseller01', name: 'مینا رضایی', businessName: null });
    expect(lotCardResponseSchema.safeParse({ ...payload, seller: {} }).success).toBe(false);
    expect(lotCardResponseSchema.safeParse({ ...payload, updatedAt: 'yesterday' }).success).toBe(
      false,
    );
  });

  it('exposes every component schema in the registry', () => {
    const names = Object.keys(apiSchemas);
    for (const expected of [
      'LoginDto',
      'OtpRequestDto',
      'OtpRequestResponseDto',
      'OtpVerifyDto',
      'OtpVerifyResponseDto',
      'UserResponseDto',
      'LoginResponseDto',
      'CreateUserDto',
      'UpdateUserDto',
    ]) {
      expect(names).toContain(expected);
    }
  });
});
