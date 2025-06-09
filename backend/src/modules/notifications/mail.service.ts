import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Transactional email behind a driver interface.
 *
 * PRD §17 Q2 (Mailgun / SendGrid / SES) is still open, so this deliberately does
 * not commit. The `console` driver logs instead of sending, which is what local
 * development wants anyway; adding a real provider is one class implementing
 * `deliver`, with nothing else in the codebase changing.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendPasswordReset(email: string, token: string): Promise<void> {
    const appUrl = this.config.get<string>('APP_URL', 'http://localhost:4200');
    const ttl = this.config.get<number>('PASSWORD_RESET_TTL_HOURS', 24);

    await this.deliver({
      to: email,
      subject: 'Reset your NowNowHR password',
      text: [
        'A password reset was requested for your NowNowHR account.',
        '',
        `${appUrl}/auth/reset-password?token=${token}`,
        '',
        `This link can be used once and expires in ${ttl} hours.`,
        'If you did not request this, you can ignore this email — your password has not changed.',
      ].join('\n'),
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.deliver(message);
  }

  private async deliver(message: MailMessage): Promise<void> {
    const driver = this.config.get<string>('MAIL_DRIVER', 'console');

    if (driver === 'console') {
      // Password reset links are logged in full here on purpose — it is the only
      // way to complete the flow locally. Never enable this driver in production.
      this.logger.log(
        `[mail:console] to=${message.to} subject="${message.subject}"\n${message.text}`
      );
      return;
    }

    throw new Error(
      `MAIL_DRIVER "${driver}" is not implemented. Add a driver, or set MAIL_DRIVER=console for local development.`
    );
  }
}
