import { Injectable } from '@angular/core';
import { DatabaseService } from '../Shared/database.service';
import { InventoryServiceInterface } from 'client/app/interfaces/Inventory/inventory-service-interface';

@Injectable({
  providedIn: 'root'
})
export class DbInventoryService implements InventoryServiceInterface {

  constructor(private databaseService: DatabaseService) { }

  getTotalStock() {
    return this.databaseService.query("call get_total_stock();");
  }

  getTotalStockOfMasterCategory(mid: number) {
    return this.databaseService.execute("call get_total_stock_of_master_category(?);", [
      mid
    ]);
  }

  getAllProducts(itemsPerPage: number, pageNumber = 1, searchQuery: string = '', fetchSoldProducts = 0) {
    return this.databaseService.execute("call get_all_products(?, ?, ?, ?);", [
      fetchSoldProducts,
      itemsPerPage,
      pageNumber,
      searchQuery
    ]);
  }

  addProduct(addProductFormData: any) {
    return this.databaseService.execute(
      "call add_product(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);",
      [
        addProductFormData.sku,
        addProductFormData.huid ?? null,
        addProductFormData.purityCode,
        addProductFormData.productDescription ?? null,
        addProductFormData.grossWeight,
        addProductFormData.netWeight,
        addProductFormData.stoneWeight ?? 0,
        addProductFormData.stoneCharges ?? 0,
        addProductFormData.makingMode ?? 'perGram',
        addProductFormData.makingValue ?? 0,
        addProductFormData.wastagePercent ?? 0,
        addProductFormData.costPrice ?? 0,
        addProductFormData.tagPrice ?? 0,
        addProductFormData.hsnCode ?? '7113',
        addProductFormData.masterCategoryId,
        addProductFormData.subCategoryId,
        addProductFormData.productCategoryId,
        addProductFormData.imagePath ?? null
      ]
    );
  }

  deleteProduct(productGuid: string, hardDelete = 0) {
    return this.databaseService.execute("call delete_product(?, ?);", [
      hardDelete,
      productGuid
    ]);
  }

  deleteProductImage(productGuid: string) {
    return this.databaseService.execute("call delete_product_image(?);", [
      productGuid
    ]);
  }

  getProductDetails(productGuid: string) {
    return this.databaseService.execute("call get_product_details(?);", [
      productGuid
    ]);
  }

  getProductImage(productGuid: string) {
    return this.databaseService.execute("call get_product_image(?);", [
      productGuid
    ]);
  }

  updateProductDetails(productDetails: any) {
    return this.databaseService.execute(
      "call update_product_details(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);",
      [
        productDetails.productGuid,
        productDetails.sku,
        productDetails.huid ?? null,
        productDetails.purityCode,
        productDetails.productDescription ?? null,
        productDetails.grossWeight,
        productDetails.netWeight,
        productDetails.stoneWeight ?? 0,
        productDetails.stoneCharges ?? 0,
        productDetails.makingMode ?? 'perGram',
        productDetails.makingValue ?? 0,
        productDetails.wastagePercent ?? 0,
        productDetails.costPrice ?? 0,
        productDetails.tagPrice ?? 0,
        productDetails.hsnCode ?? '7113',
        productDetails.masterCategoryId,
        productDetails.subCategoryId,
        productDetails.productCategoryId
      ]
    );
  }

  updateProductImage(productGuid: string, imagePath: string) {
    return this.databaseService.execute("call update_product_image(?, ?);", [
      productGuid,
      imagePath
    ]);
  }
}
