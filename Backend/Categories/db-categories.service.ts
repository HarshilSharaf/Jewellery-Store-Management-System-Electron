import { Injectable, inject } from '@angular/core';
import { DatabaseService } from '../Shared/database.service';
import { CategoryServiceInterface } from 'client/app/interfaces/Categories/category-service-interface';

@Injectable({
  providedIn: 'root'
})
export class DbCategoriesService implements CategoryServiceInterface{
  private databaseService = inject(DatabaseService);


  getAllCategories() {
    return this.databaseService.query("call get_all_categories();")
  }
}
