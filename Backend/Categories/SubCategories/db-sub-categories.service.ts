import { Injectable } from '@angular/core';
import { from } from 'rxjs';
import { DatabaseService } from '../../Shared/database.service';

@Injectable({
  providedIn: 'root'
})
export class DbSubCategoriesService {

  constructor(private databaseService: DatabaseService) { }

  getSubCategories() {
    return from(this.databaseService.query("call get_sub_categories();"))
  }

  addSubCategory(name: string, description: string) {
    return from(this.databaseService.execute("call add_sub_category(?, ?);", [name, description || null]))
  }
}
