import { IsInt, IsIn, IsOptional } from 'class-validator';

/**
 * Configure how often the user confirms they are active. The PRD suggests
 * 30 / 90 / 180 day cadences. Optional so the bare "I'm Here" button
 * (no body) simply resets the existing timer.
 */
export class UpsertCheckInDto {
  @IsOptional()
  @IsInt()
  @IsIn([30, 90, 180], { message: 'Choose a check-in cadence of 30, 90 or 180 days.' })
  intervalDays?: number;
}
