import { Global, Module } from '@nestjs/common';
import { PrismaService } from './database/prisma.service';
import { AuditService } from './audit/audit.service';
import { FieldEncryptionService } from './crypto/field-encryption.service';
import { ScopeService } from './access/scope.service';

/**
 * Cross-cutting services every feature module needs.
 *
 * Global so modules don't each have to import it — these are infrastructure, not
 * a feature dependency, and threading them through nine module imports adds
 * noise without adding clarity.
 */
@Global()
@Module({
  providers: [PrismaService, AuditService, FieldEncryptionService, ScopeService],
  exports: [PrismaService, AuditService, FieldEncryptionService, ScopeService],
})
export class CoreModule {}
