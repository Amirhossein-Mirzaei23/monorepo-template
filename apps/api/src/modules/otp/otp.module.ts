import { Module } from '@nestjs/common';
import { SmsModule } from '../sms/sms.module';
import { OtpRepository } from './otp.repository';
import { OtpService } from './otp.service';

/**
 * OTP issue/verify domain (AUTH-002) — service + repository only; the HTTP
 * surface (request/verify endpoints) lands with AUTH-003.
 */
@Module({
  imports: [SmsModule],
  providers: [OtpService, OtpRepository],
  exports: [OtpService],
})
export class OtpModule {}
