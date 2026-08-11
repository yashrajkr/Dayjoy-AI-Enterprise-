import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { CategoriesService } from './categories.service';
import { InventoryService } from './inventory.service';
import { ProductsController } from './products.controller';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, CategoriesService, InventoryService],
  exports: [ProductsService, CategoriesService, InventoryService],
})
export class ProductsModule {}
