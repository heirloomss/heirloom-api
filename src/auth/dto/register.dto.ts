import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Please enter a valid email address.' })
  email!: string;

  @IsString()
  @MinLength(2, { message: 'Please tell us your name.' })
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(8, { message: 'Choose a password with at least 8 characters.' })
  @MaxLength(200)
  password!: string;
}
