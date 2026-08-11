import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { AddItemDto } from './dto/add-item.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../_shared/common/decorators/current-user.decorator';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../_shared/security/permissions.guard';

/**
 * Orders HTTP surface.
 *
 * Route ordering: `/api/orders/stats` is declared BEFORE `/:id` so NestJS
 * doesn't try to interpret `stats` as a UUID.
 */
@Controller('api/orders')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @RequirePermissions('orders:read')
  async findAll(@CurrentUser() user: any, @Query() query: QueryOrdersDto) {
    return this.ordersService.findAll(user, query);
  }

  @Get('stats')
  @RequirePermissions('orders:read')
  async getStats(@CurrentUser() user: any, @Query() query: QueryOrdersDto) {
    return this.ordersService.getOrderStats(user, query);
  }

  @Get(':id')
  @RequirePermissions('orders:read')
  async findOne(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.findOne(id, user);
  }

  @Post()
  @RequirePermissions('orders:create')
  async create(@CurrentUser() user: any, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(user, dto);
  }

  @Put(':id')
  @RequirePermissions('orders:update')
  async update(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderDto,
  ) {
    return this.ordersService.update(id, user, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('orders:update')
  async updateStatus(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.ordersService.updateStatus(id, user, dto);
  }

  @Patch(':id/payment')
  @RequirePermissions('orders:update')
  async updatePayment(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaymentDto,
  ) {
    return this.ordersService.updatePaymentStatus(id, user, dto);
  }

  @Post(':id/items')
  @RequirePermissions('orders:update')
  async addItem(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddItemDto,
  ) {
    return this.ordersService.addItem(id, user, dto);
  }

  @Delete(':id/items/:itemId')
  @RequirePermissions('orders:update')
  async removeItem(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.ordersService.removeItem(id, itemId, user);
  }

  @Post(':id/cancel')
  @RequirePermissions('orders:update')
  async cancel(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.ordersService.cancel(id, user, dto);
  }
}
