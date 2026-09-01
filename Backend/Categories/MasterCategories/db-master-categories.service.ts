import { Injectable, inject } from '@angular/core';
import { DatabaseService } from '../../Shared/database.service';
import { MasterCategoryServiceInterface } from 'client/app/interfaces/Categories/MasterCategories/master-category-service-interface';

@Injectable({
  providedIn: 'root'
})
export class DbMasterCategoriesService implements MasterCategoryServiceInterface{
  private databaseService = inject(DatabaseService);


  getMasterCategories(){
    return this.databaseService.query("call get_master_categories();")
  }

  addMasterCategory(name:string,description:string) {
    return this.databaseService.execute("call add_master_category(?, ?);", [name, description || null])
  }
}
