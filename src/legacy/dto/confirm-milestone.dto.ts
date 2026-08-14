import { IsString, MinLength } from 'class-validator';

export class ConfirmMilestoneDto {
  @IsString()
  @MinLength(1, { message: 'Please name the milestone (e.g. marriage, graduation).' })
  event!: string;
}
