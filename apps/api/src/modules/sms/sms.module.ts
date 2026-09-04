import { Module } from '@nestjs/common';
import { SmsService } from './sms.service';

/** Outbound SMS delivery (IranPayamak patterns) — imported by consumers like auth. */
@Module({
  providers: [SmsService],
  exports: [SmsService],
})
export class SmsModule {}
