import { IsOptional, IsInt, Min, Max, Matches } from 'class-validator';

/**
 * Build the `create_legacy` transaction for the owner's plan.
 *
 * The token defaults to native XLM. Threshold is the N in "N of M" guardian
 * approvals. After this build the client signs the XDR in Freighter and posts
 * it to POST /api/legacy/submit with action "protect".
 */
export class ProtectLegacyDto {
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'At least one guardian must approve.' })
  @Max(10)
  threshold?: number;

  /**
   * Token to commit the estate in. Accepts "native" (default), "CODE:ISSUER"
   * for a classic asset, or a C... Stellar Asset Contract address.
   */
  @IsOptional()
  @Matches(/^(native|XLM|[A-Za-z0-9]{1,12}:[GC][A-Z2-7]{55}|C[A-Z2-7]{55})$/i, {
    message: 'Use "native", "CODE:ISSUER", or a C... token contract address.',
  })
  token?: string;
}
