import { IsString, Matches } from 'class-validator';

/**
 * Link a Stellar wallet to the account. Validates the Stellar public key
 * format (G... , 56 base32 chars). The wallet enhances the account; it is
 * never the sole identity mechanism.
 */
export class LinkWalletDto {
  @IsString()
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: 'That doesn\'t look like a valid Stellar account. Please check and try again.',
  })
  walletAddress!: string;
}
