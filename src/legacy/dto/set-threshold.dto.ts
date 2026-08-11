import { IsInt, Max, Min } from 'class-validator';

/**
 * Persist the approval threshold (the N in "N of M" guardian approvals) while
 * the plan is still a draft. Once the legacy is registered on-chain the
 * threshold is baked into the contract and can no longer change here.
 */
export class SetThresholdDto {
  @IsInt()
  @Min(1, { message: 'At least one guardian must approve.' })
  @Max(10)
  threshold!: number;
}
