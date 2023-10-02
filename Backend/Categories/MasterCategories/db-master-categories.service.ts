import { Injectable } from '@angular/core';
import { from } from 'rxjs';
import { DatabaseService } from '../../Shared/database.service';

@Injectable({
  providedIn: 'root'
})
export class DbMasterCategoriesService {

  constructor(private databaseService:DatabaseService) { }

  getMasterCategories(){
    return from(this.databaseService.query("call get_master_categories();"))
  }

  addMasterCategory(name:string,description:string) {
    return from(this.databaseService.execute("call add_master_category(?, ?);", [name, description || null]))
  }
}
