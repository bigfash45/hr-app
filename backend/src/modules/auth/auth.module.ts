import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MailService } from '../notifications/mail.service';

@Module({
  // Secrets are supplied per-call in AuthService and TenantMiddleware rather
  // than registered here, so access and refresh tokens can never be signed or
  // verified with each other's key by accident.
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, MailService],
  exports: [AuthService, JwtModule, MailService],
})
export class AuthModule {}
