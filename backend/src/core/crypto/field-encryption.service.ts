import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const PREFIX = 'enc:v1:';

/**
 * AES-256-GCM for Tier 1 fields at rest — salary, bank account, RSA PIN, NIN,
 * BVN (PRD §11.1, §11.2).
 *
 * GCM rather than CBC because it authenticates as well as encrypts: a tampered
 * ciphertext fails to decrypt instead of yielding plausible garbage. Each value
 * gets a fresh random IV, stored alongside the ciphertext, so identical salaries
 * do not produce identical rows.
 *
 * What this protects against: a database backup, a dump, or read access to the
 * table. It does NOT protect against a compromised application server, which
 * holds the key by necessity. For that, the answer is a KMS — worth doing before
 * sister-company rollout, and noted as such.
 */
@Injectable()
export class FieldEncryptionService implements OnModuleInit {
  private readonly logger = new Logger(FieldEncryptionService.name);
  private key!: Buffer;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const secret = this.config.get<string>('FIELD_ENCRYPTION_KEY');

    if (!secret || secret.length < 32) {
      if (this.config.get('NODE_ENV') === 'production') {
        // Refusing to boot beats starting up and silently writing plaintext
        // salaries to disk.
        throw new Error(
          'FIELD_ENCRYPTION_KEY must be set to at least 32 characters in production. ' +
            'Generate one with: openssl rand -base64 48'
        );
      }
      this.logger.warn(
        'FIELD_ENCRYPTION_KEY is unset — using a development key. Tier 1 data is NOT securely encrypted.'
      );
    }

    // scrypt stretches the configured secret into a 32-byte key. The salt is
    // fixed so the same secret always derives the same key; rotating the secret
    // requires re-encrypting existing rows.
    this.key = scryptSync(secret ?? 'development-only-insecure-key', 'nownowhr-field-salt', 32);
  }

  /** Returns null for null/empty input, so optional columns stay null. */
  encrypt(plaintext: string | null | undefined): string | null {
    if (plaintext === null || plaintext === undefined || plaintext === '') return null;

    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return PREFIX + Buffer.concat([iv, authTag, ciphertext]).toString('base64');
  }

  /**
   * Decrypts a stored value.
   *
   * Values without the prefix are returned as-is: rows written before encryption
   * was introduced are still plaintext, and this keeps them readable instead of
   * throwing during a migration window.
   */
  decrypt(stored: string | null | undefined): string | null {
    if (stored === null || stored === undefined || stored === '') return null;
    if (!stored.startsWith(PREFIX)) return stored;

    try {
      const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
      const iv = raw.subarray(0, IV_LENGTH);
      const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
      const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

      const decipher = createDecipheriv(ALGORITHM, this.key, iv);
      decipher.setAuthTag(authTag);

      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch {
      // Wrong key, or tampering. Never surface the ciphertext to the caller.
      this.logger.error('Failed to decrypt a Tier 1 field — wrong key, or the value was altered.');
      return null;
    }
  }
}
