import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DistributorsService } from './distributors.service';
import { CreateDistributorDto } from './dto/create-distributor.dto';
import { UpdateDistributorDto } from './dto/update-distributor.dto';
import { QueryDistributorsDto } from './dto/query-distributors.dto';
import { PerformanceQueryDto } from './dto/performance-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../_shared/common/decorators/current-user.decorator';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../_shared/security/permissions.guard';

@Controller('api/distributors')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DistributorsController {
  constructor(private readonly distributorsService: DistributorsService) {}

  @Get()
  @RequirePermissions('distributors:read')
  async findAll(
    @CurrentUser() user: any,
    @Query() query: QueryDistributorsDto,
  ) {
    return this.distributorsService.findAll(query, user);
  }

  @Get(':id')
  @RequirePermissions('distributors:read')
  async findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.distributorsService.findOne(id, user);
  }

  @Get(':id/performance')
  @RequirePermissions('distributors:read')
  async getPerformance(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Query() query: PerformanceQueryDto,
  ) {
    return this.distributorsService.getPerformance(id, query, user);
  }

  @Get(':id/commissions')
  @RequirePermissions('distributors:read')
  async getCommissionSummary(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.distributorsService.getCommissionSummary(id, user);
  }

  @Post()
  @RequirePermissions('distributors:create')
  async create(
    @CurrentUser() user: any,
    @Body() dto: CreateDistributorDto,
  ) {
    return this.distributorsService.create(dto, user);
  }

  @Put(':id')
  @RequirePermissions('distributors:update')
  async update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateDistributorDto,
  ) {
    return this.distributorsService.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions('distributors:delete')
  async remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.distributorsService.remove(id, user);
  }
}
