import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateGuardianDto {
  @IsString()
  @MinLength(1, { message: 'Please enter a name.' })
  @MaxLength(120)
  name!: string;

  @IsEmail({}, { message: 'Please enter a valid email address.' })
  email!: string;

  @IsString()
  @MinLength(1, { message: 'Please choose a relationship (e.g. Brother, Lawyer, Friend).' })
  @MaxLength(60)
  relationship!: string;
}
