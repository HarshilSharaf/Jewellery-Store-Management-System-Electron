import { Injectable, inject } from '@angular/core';
import { DatabaseService } from '../../Shared/database.service';
import { ProductCategoryServiceInterface } from 'client/app/interfaces/Categories/ProductCategories/product-category-service-interface';

@Injectable({
  providedIn: 'root'
})
export class DbProductCategoriesService implements ProductCategoryServiceInterface {
  private databaseService = inject(DatabaseService);


  getTopProductCategories(numberOfCategories:number) {
    return this.databaseService.execute("call get_top_product_categories(?);",[
      numberOfCategories
    ])
  }

  getProductCategories() {
    return this.databaseService.query("call get_product_categories();")
  }

  addProductCategory(name: string, description: string) {
    return this.databaseService.execute("call add_product_category(?, ?);", [name, description || null])
  }
}
