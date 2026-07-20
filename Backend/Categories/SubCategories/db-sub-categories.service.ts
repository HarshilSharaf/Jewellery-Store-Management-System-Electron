import { Injectable } from '@angular/core';
import { DatabaseService } from '../../Shared/database.service';
import { SubCategoryServiceInterface } from 'client/app/interfaces/Categories/SubCategories/sub-category-service-interface';

@Injectable({
  providedIn: 'root'
})
export class DbSubCategoriesService implements SubCategoryServiceInterface{

  constructor(private databaseService: DatabaseService) { }

  getSubCategories() {
    return this.databaseService.query("call get_sub_categories();")
  }

  addSubCategory(name: string, description: string) {
    return this.databaseService.execute("call add_sub_category(?, ?);", [name, description || null])
  }
}
