/**
 * Shape of the JWT payload issued by AuthService and attached to requests by
 * JwtAuthGuard.
 */
export interface JwtPayload {
  /** User id (Prisma cuid). */
  sub: string;
  /** Present for legacy email/password accounts; absent for wallet-only users. */
  email?: string;
  /** Present for Freighter wallet accounts. */
  walletAddress?: string;
}

/**
 * The authenticated user as attached to the Express request.
 */
export interface AuthUser {
  id: string;
  email?: string;
  walletAddress?: string;
}
