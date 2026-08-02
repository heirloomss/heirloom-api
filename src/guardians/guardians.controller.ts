import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GuardiansService } from './guardians.service';
import { CreateGuardianDto } from './dto/create-guardian.dto';
import { UpdateGuardianDto } from './dto/update-guardian.dto';
import { ApproveGuardianDto } from './dto/approve-guardian.dto';

@Controller('guardians')
@UseGuards(JwtAuthGuard)
export class GuardiansController {
  constructor(private readonly guardians: GuardiansService) {}

  @Get()
  list(@CurrentUser('id') userId: string) {
    return this.guardians.list(userId);
  }

  @Get(':id')
  findOne(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.guardians.findOne(userId, id);
  }

  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateGuardianDto) {
    return this.guardians.create(userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateGuardianDto,
  ) {
    return this.guardians.update(userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.guardians.remove(userId, id);
  }

  /** POST /api/guardians/:id/approve — records a guardian verification. */
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approve(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: ApproveGuardianDto,
  ) {
    return this.guardians.approve(userId, id, dto);
  }
}
