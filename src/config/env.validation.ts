import { z } from 'zod';

/**
 * Validated environment schema. The app fails fast at boot if required
 * variables are missing or malformed. Stellar keys are optional — when the RPC
 * URL or contract id are absent, on-chain endpoints return HTTP 503 until set;
 * the app never fabricates transactions. Storage (R2) and email (Resend) keys
 * are optional too — the matching feature returns 503 until its keys are set.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // AES-256-GCM key: 32 bytes encoded as 64 hex characters.
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY must be 64 hex characters (32 bytes)'),

  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Stellar / Soroban. STELLAR_SECRET_KEY is intentionally NOT read by the API:
  // Heirloom is self-custodial and never holds a signing key. On-chain calls are
  // built as unsigned XDR and signed client-side in Freighter.
  STELLAR_NETWORK: z.enum(['testnet', 'mainnet', 'futurenet']).default('testnet'),
  STELLAR_RPC_URL: z.string().default('https://soroban-testnet.stellar.org'),
  HEIRLOOM_CONTRACT_ID: z.string().optional().default(''),

  // Object storage (Cloudflare R2, S3-compatible) for the encrypted archive.
  R2_ACCOUNT_ID: z.string().optional().default(''),
  R2_ACCESS_KEY_ID: z.string().optional().default(''),
  R2_SECRET_ACCESS_KEY: z.string().optional().default(''),
  R2_BUCKET: z.string().optional().default(''),
  R2_ENDPOINT: z.string().optional().default(''),

  // Transactional email (Resend).
  RESEND_API_KEY: z.string().optional().default(''),
  EMAIL_FROM: z.string().optional().default('Heirloom <onboarding@resend.dev>'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * ConfigModule validation hook. Throws with a readable message on failure.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
