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
import { ProductsService } from './products.service';
import { CategoriesService } from './categories.service';
import { InventoryService } from './inventory.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { QueryInventoryTransactionsDto } from './dto/query-inventory-transactions.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../_shared/common/decorators/current-user.decorator';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../_shared/security/permissions.guard';

/**
 * Products HTTP surface.
 *
 * Route ordering matters: `/api/products/search`, `/api/products/categories`,
 * and the explicit category sub-routes are declared BEFORE `/:id` so NestJS
 * doesn't try to interpret `search` / `categories` as a UUID path param.
 */
@Controller('api/products')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly categoriesService: CategoriesService,
    private readonly inventoryService: InventoryService,
  ) {}

  // ---------------------------------------------------------------------
  // Search + categories (declared first to win over /:id)
  // ---------------------------------------------------------------------

  @Get('search')
  async search(@Query('q') q: string, @Query('limit') limit?: string) {
    return this.productsService.search(q ?? '', limit ? Number(limit) : undefined);
  }

  @Get('categories')
  async listCategories(@CurrentUser() user: any) {
    return this.categoriesService.findAllCategories(user);
  }

  @Post('categories')
  @RequirePermissions('products:create')
  async createCategory(@CurrentUser() user: any, @Body() dto: CreateCategoryDto) {
    return this.categoriesService.createCategory(user, dto);
  }

  @Get('categories/:id')
  async getCategory(@CurrentUser() user: any, @Param('id') id: string) {
    return this.categoriesService.findOneCategory(id, user);
  }

  @Put('categories/:id')
  @RequirePermissions('products:update')
  async updateCategory(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.updateCategory(id, user, dto);
  }

  @Delete('categories/:id')
  @RequirePermissions('products:delete')
  async deleteCategory(@CurrentUser() user: any, @Param('id') id: string) {
    return this.categoriesService.removeCategory(id, user);
  }

  // ---------------------------------------------------------------------
  // Products collection
  // ---------------------------------------------------------------------

  @Get()
  @RequirePermissions('products:read')
  async findAll(@CurrentUser() user: any, @Query() query: QueryProductsDto) {
    return this.productsService.findAll(user, query);
  }

  @Post()
  @RequirePermissions('products:create')
  async create(@CurrentUser() user: any, @Body() dto: CreateProductDto) {
    return this.productsService.create(user, dto);
  }

  // ---------------------------------------------------------------------
  // Single product + nested inventory routes
  // ---------------------------------------------------------------------

  @Get(':id')
  @RequirePermissions('products:read')
  async findOne(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.findOne(id, user);
  }

  @Put(':id')
  @RequirePermissions('products:update')
  async update(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(id, user, dto);
  }

  @Delete(':id')
  @RequirePermissions('products:delete')
  async remove(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.remove(id, user);
  }

  @Get(':id/inventory')
  @RequirePermissions('products:read')
  async getInventory(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventoryService.getInventory(id, user);
  }

  @Patch(':id/inventory')
  @RequirePermissions('products:update')
  async updateInventory(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInventoryDto,
  ) {
    return this.inventoryService.updateStock(id, user, dto);
  }

  @Get(':id/inventory/transactions')
  async getInventoryTransactions(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryInventoryTransactionsDto,
  ) {
    return this.inventoryService.getTransactions(id, user, query);
  }
}
