import { IsString, Matches } from 'class-validator';

/**
 * Request a one-time login challenge for a Stellar wallet address. Validates the
 * Stellar public key format (G..., 56 base32 chars). The server returns a
 * human-readable message that the client signs in Freighter.
 */
export class WalletChallengeDto {
  @IsString()
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: "That doesn't look like a valid Stellar account. Please check and try again.",
  })
  walletAddress!: string;
}
