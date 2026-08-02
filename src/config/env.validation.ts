import { z } from 'zod';

/**
 * Validated environment schema. The app fails fast at boot if required
 * variables are missing or malformed. Stellar keys are optional — when absent
 * StellarService runs in simulated mode.
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

  STELLAR_NETWORK: z.enum(['testnet', 'mainnet', 'futurenet']).default('testnet'),
  STELLAR_RPC_URL: z.string().default('https://soroban-testnet.stellar.org'),
  STELLAR_SECRET_KEY: z.string().optional().default(''),
  HEIRLOOM_CONTRACT_ID: z.string().optional().default(''),
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
