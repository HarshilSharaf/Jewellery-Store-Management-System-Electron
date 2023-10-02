import { Injectable } from '@angular/core';
import { from } from 'rxjs';
import { DatabaseService } from '../../Shared/database.service';

@Injectable({
  providedIn: 'root'
})
export class DbProductCategoriesService {

  constructor(private databaseService: DatabaseService) { }

  getTopProductCategories(numberOfCategories:number) {
    return from(this.databaseService.execute("call get_top_product_categories(?);",[
      numberOfCategories
    ]))
  }

  getProductCategories() {
    return from(this.databaseService.query("call get_product_categories();"))
  }

  addProductCategory(name: string, description: string) {
    return from(this.databaseService.execute("call add_product_category(?, ?);", [name, description || null]))
  }
}
