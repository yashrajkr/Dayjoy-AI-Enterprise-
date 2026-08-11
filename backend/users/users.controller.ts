import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangeStatusDto } from './dto/change-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../_shared/common/decorators/current-user.decorator';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../_shared/security/permissions.guard';

@Controller('api/users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // -----------------------------------------------------------------
  // Self-service (authenticated, no permission required).
  // Declared BEFORE `/:id` so the router matches `/me` first.
  // -----------------------------------------------------------------

  @Get('me')
  async getMe(@CurrentUser() user: any) {
    return this.usersService.findOne(user.userId, user);
  }

  @Put('me')
  async updateMe(
    @CurrentUser() user: any,
    @Body() dto: UpdateProfileDto,
  ) {
    // Use the user's own id from the JWT — they cannot target another user
    // through this route.
    return this.usersService.updateProfile(user.userId, dto);
  }

  // -----------------------------------------------------------------
  // Admin (permission-gated)
  // -----------------------------------------------------------------

  @Get()
  @RequirePermissions('users:read')
  async findAll(@CurrentUser() user: any, @Query() query: QueryUsersDto) {
    return this.usersService.findAll(query, user);
  }

  @Get(':id')
  @RequirePermissions('users:read')
  async findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.usersService.findOne(id, user);
  }

  @Post()
  @RequirePermissions('users:create')
  async create(
    @CurrentUser() user: any,
    @Body() dto: CreateUserDto,
  ) {
    return this.usersService.create(dto, user);
  }

  @Put(':id')
  @RequirePermissions('users:update')
  async update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions('users:delete')
  async remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.usersService.remove(id, user);
  }

  @Patch(':id/status')
  @RequirePermissions('users:update')
  async changeStatus(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: ChangeStatusDto,
  ) {
    return this.usersService.changeStatus(id, dto, user);
  }
}
