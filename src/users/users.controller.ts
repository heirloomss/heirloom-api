import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** GET /api/users/me — profile. */
  @Get('me')
  me(@CurrentUser('id') userId: string) {
    return this.users.findById(userId);
  }

  /** PATCH /api/users/me — update profile (name, wallet, preferences). */
  @Patch('me')
  update(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.users.update(userId, dto);
  }

  /** GET /api/users/summary — dashboard cards. */
  @Get('summary')
  summary(@CurrentUser('id') userId: string) {
    return this.users.summary(userId);
  }
}
