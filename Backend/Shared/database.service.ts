import { SettingsModel } from 'client/app/modules/settings/models/settings-model';
import { StoreService } from './store.service';
import { Injectable } from '@angular/core';
import Swal from 'sweetalert2';
import { Router } from '@angular/router';
import { DatabaseServiceInterface } from 'client/app/interfaces/Shared/database-service-interface';
const mysql = (<any>window).require('mysql2/promise');

@Injectable({
  providedIn: 'root'
})
export class DatabaseService implements DatabaseServiceInterface {

  public dbConnection!: any;
  private dbConnectionInfo!: SettingsModel;

  constructor(private storeService: StoreService, private router: Router) {}

  async initializeDbConnection(): Promise<void> {
    this.dbConnectionInfo = await this.storeService.get('currentDbInfo');
    if (this.dbConnectionInfo == null) {
      this.dbConnectionInfo = await this.storeService.get('defaultDbInfo');
    }

    try {
      this.dbConnection = await mysql.createConnection({
        host: this.dbConnectionInfo.DATABASE_HOST,
        user: this.dbConnectionInfo.DATABASE_USERNAME,
        database: this.dbConnectionInfo.DATABASE_NAME,
        password: this.dbConnectionInfo.DATABASE_PASSWORD
      });
    } catch (error) {
      this.showErrorAndRedirectToSettingsPage(error);
    }
  }

  showErrorAndRedirectToSettingsPage(error: any): void {
    Swal.fire({
      title: 'Could Not Connect To Database!',
      html: `<span class="text-danger"> Error: ${error}
        <p class="text-warning my-2"> Redirecting to Settings Page...</p>
        </span>`,
      timer: 4000,
      timerProgressBar: true,
      allowEscapeKey: false,
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    }).then((result) => {
      if (result.dismiss === Swal.DismissReason.timer) {
        this.router.navigate(['settings'], {
          state: { error: error.toString() },
        });
      }
    });
  }

  /**
   * Merges all result arrays returned by mysql2 adapter.
   * mysql2 includes a ResultSetHeader as the last element, which is filtered out.
   */
  prepareResponseData(finalResult: any[], results: any): any[] {
    if (results.length) {
      const filteredResults = results.slice(0, -1);
      filteredResults.forEach((result: any[]) => {
        finalResult = [...finalResult, ...result];
      });
    }
    return finalResult;
  }

  async execute(query: string, values: any[]): Promise<any> {
    try {
      const [results] = await this.dbConnection.execute(query, values);
      return this.prepareResponseData([], results);
    } catch (error) {
      throw error;
    }
  }

  async query(query: string): Promise<any> {
    try {
      const [results] = await this.dbConnection.query(query);
      return this.prepareResponseData([], results);
    } catch (error) {
      throw error;
    }
  }
}
