import { IsString, Matches } from 'class-validator';

/**
 * Verify a signed wallet challenge and issue a session. The server verifies the
 * Stellar ed25519 signature cryptographically, creates or retrieves the user by
 * walletAddress, and returns a JWT.
 */
export class WalletVerifyDto {
  @IsString()
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: "That doesn't look like a valid Stellar account. Please check and try again.",
  })
  walletAddress!: string;

  @IsString()
  signature!: string;
}
