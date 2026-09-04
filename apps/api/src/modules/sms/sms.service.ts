import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { requireAppConfig, type SmsConfig } from '../../config/configuration';
import { SmsClientType } from './sms.constants';

/** IranPayamak pattern-message payload (snake_case matches the provider API). */
interface SmsPatternPayload {
  code: string;
  attributes: Record<string, string>;
  recipient: string;
  line_number: string;
  number_format: 'english';
}

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Outbound SMS delivery via the IranPayamak pattern API. Ported from the
 * dongeto backend with credentials moved to env config; OTP codes are never
 * written to logs — only masked phone numbers.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly smsConfig: SmsConfig;

  constructor(configService: ConfigService) {
    this.smsConfig = requireAppConfig(configService).sms;
  }

  async sendOtp(
    phone: string,
    code: string,
    clientType: SmsClientType = SmsClientType.Web,
  ): Promise<void> {
    const { apiKey, patternUrl, lineNumber, webPatternCode, androidPatternCode } = this.smsConfig;
    const patternCode = clientType === SmsClientType.Android ? androidPatternCode : webPatternCode;

    if (!apiKey || !lineNumber || !patternCode) {
      throw new ServiceUnavailableException(
        'SMS delivery is not configured — set SMS_API_KEY, SMS_LINE_NUMBER and the SMS_PATTERN_CODE_* variables',
      );
    }

    const body: SmsPatternPayload = {
      code: patternCode,
      // Web template consumes both placeholders; android only {code}.
      attributes: clientType === SmsClientType.Android ? { code } : { code, otp: code },
      recipient: phone,
      line_number: lineNumber,
      number_format: 'english',
    };

    this.logger.log(`Sending OTP SMS to ${maskPhone(phone)} (${clientType})`);

    let response: Response;
    try {
      response = await fetch(patternUrl, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'Api-Key': apiKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error(`SMS provider request to ${maskPhone(phone)} failed: ${toMessage(error)}`);
      throw new ServiceUnavailableException('SMS delivery failed');
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      this.logger.error(
        `SMS provider rejected request to ${maskPhone(phone)}: ${response.status} ${detail}`,
      );
      throw new ServiceUnavailableException('SMS delivery failed');
    }

    this.logger.log(`OTP SMS delivered to ${maskPhone(phone)}`);
  }
}

function maskPhone(phone: string): string {
  return phone.length <= 7 ? '***' : `${phone.slice(0, 4)}***${phone.slice(-3)}`;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
