import { BadRequestException, type ValidationError, ValidationPipe } from '@nestjs/common';

/**
 * Global validation pipe: strips unknown properties (whitelist), rejects them
 * (forbidNonWhitelisted), and converts payloads to DTO instances (transform).
 * Built once and registered globally in main.ts.
 */
export function createGlobalValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors: ValidationError[]) => {
      const messages = errors.flatMap((error) =>
        Object.values(error.constraints ?? {}).map((message) => message),
      );
      return new BadRequestException({
        message: messages.length > 0 ? messages : 'Validation failed',
        error: 'Bad Request',
      });
    },
  });
}
