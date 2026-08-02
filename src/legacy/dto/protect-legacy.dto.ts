import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

/**
 * Protect a legacy plan on-chain. The token defaults to native XLM if not
 * given. Threshold is the N in "N of M" guardian approvals.
 */
export class ProtectLegacyDto {
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'At least one guardian must approve.' })
  @Max(10)
  threshold?: number;

  /** Optional Stellar asset contract address to protect (defaults to native). */
  @IsOptional()
  @Matches(/^[GC][A-Z2-7]{55}$/, {
    message: 'That doesn\'t look like a valid Stellar asset.',
  })
  token?: string;
}
