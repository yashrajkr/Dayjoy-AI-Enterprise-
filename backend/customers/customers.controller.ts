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
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { QueryCustomersDto } from './dto/query-customers.dto';
import {
  CreateAddressDto,
  UpdateAddressDto,
} from './dto/create-address.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../_shared/common/decorators/current-user.decorator';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../_shared/security/permissions.guard';

@Controller('api/customers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @RequirePermissions('customers:read')
  async findAll(@CurrentUser() user: any, @Query() query: QueryCustomersDto) {
    return this.customersService.findAll(query, user);
  }

  @Get(':id')
  @RequirePermissions('customers:read')
  async findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.customersService.findOne(id, user);
  }

  @Get(':id/stats')
  @RequirePermissions('customers:read')
  async getStats(@CurrentUser() user: any, @Param('id') id: string) {
    return this.customersService.getStats(id, user);
  }

  @Post()
  @RequirePermissions('customers:create')
  async create(
    @CurrentUser() user: any,
    @Body() dto: CreateCustomerDto,
  ) {
    return this.customersService.create(dto, user);
  }

  @Put(':id')
  @RequirePermissions('customers:update')
  async update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customersService.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions('customers:delete')
  async remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.customersService.remove(id, user);
  }

  // -----------------------------------------------------------------
  // Addresses (stored as JSON array on Customer.address)
  // -----------------------------------------------------------------

  @Post(':id/addresses')
  @RequirePermissions('customers:update')
  async addAddress(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: CreateAddressDto,
  ) {
    return this.customersService.addAddress(id, dto, user);
  }

  @Put(':id/addresses/:addressId')
  @RequirePermissions('customers:update')
  async updateAddress(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('addressId') addressId: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.customersService.updateAddress(id, addressId, dto, user);
  }

  @Delete(':id/addresses/:addressId')
  @RequirePermissions('customers:update')
  async removeAddress(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('addressId') addressId: string,
  ) {
    return this.customersService.removeAddress(id, addressId, user);
  }
}
