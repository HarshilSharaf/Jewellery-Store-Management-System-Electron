import { SettingsModel } from 'client/app/modules/settings/models/settings-model';
import {createConnection, createPool} from 'mysql2';
import { StoreService } from './store.service';
import { Injectable } from '@angular/core';
import Swal from 'sweetalert2';
import { Router } from '@angular/router';
import { DatabaseServiceInterface } from 'client/app/interfaces/Shared/database-service-interface';
const mysql = (<any>window).require('mysql2/promise');


@Injectable({
  providedIn: 'root'
})
export class DatabaseService implements DatabaseServiceInterface{

  public dbConnection!: any;
  private dbConnectionInfo!:SettingsModel
  constructor(private storeService:StoreService, private router: Router) { }

  initializeDbConnection():Promise<any> {
    return new Promise(async (resolve,reject) => {

      this.dbConnectionInfo = await this.storeService.get("currentDbInfo")
      if(this.dbConnectionInfo == null) {
        this.dbConnectionInfo = await this.storeService.get("defaultDbInfo")
      } 

      const dbURL = 'mysql://' +
        `${this.dbConnectionInfo.DATABASE_USERNAME}:${this.dbConnectionInfo.DATABASE_PASSWORD}` +
        `@${this.dbConnectionInfo.DATABASE_HOST}:${this.dbConnectionInfo.DATABASE_PORT}/` +
        this.dbConnectionInfo.DATABASE_NAME; 
      
        try {
          this.dbConnection = await mysql.createConnection({
            host: this.dbConnectionInfo.DATABASE_HOST,
            user: this.dbConnectionInfo.DATABASE_USERNAME,
            database: this.dbConnectionInfo.DATABASE_NAME,
            password: this.dbConnectionInfo.DATABASE_PASSWORD
          })
        } catch (error) {
          this.showErrorAndRedirectToSettingsPage(error);
        }
      
      
      resolve(this.dbConnection);
    })
  }

  showErrorAndRedirectToSettingsPage(error: any) {
    let timerInterval: any;
    Swal.fire({
      title: 'Could Not Connect To Database!',
      html: `<span class="text-danger"> Error: ${error} 
        <p class="text-warning my-2"> Redirecting to Settings Page...</p>
        </span>`,
      timer: 4000,
      timerProgressBar: true,
      allowEscapeKey : false,
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
        const b = Swal.getHtmlContainer()?.querySelector(
          'b'
        ) as HTMLElement;
        timerInterval = setInterval(() => {
          b.textContent = Swal.getTimerLeft()?.toString() ?? '000000';
        }, 100);
      },
      willClose: () => {
        clearInterval(timerInterval);
      },
    }).then((result) => {
      if (result.dismiss === Swal.DismissReason.timer) {
        this.router.navigate(['settings'], {
          state: {
            error: error.toString(),
          },
        });
      }
    });
  }

  /**
 * This method performs merging of all arrays returned by mysql2 adapter.
 * @param {any[]} finalResult - The array to merge into.
 * @param {any} results - The output of mysql2 query.
 * @returns {any[]} - The merged array of objects.
 */
  prepareResponseData(finalResult: any[], results: any): any[] {
    if(results.length) {
      // the following code will remove last element of the array.
      // as mysql2 includes ResultSetHeader object with the query result
      const filteredResults = results.slice(0, -1)
      filteredResults.forEach((result: any[]) => {
        finalResult = [...finalResult, ...result]
      });
    }

    return finalResult
  }

  execute(query: string, values:any[]):Promise<any> {
    return new Promise (async(resolve, reject) => {
      try {
        const [results] = await this.dbConnection.execute(query, values)
        let finalResult:any[] = []
        finalResult = this.prepareResponseData(finalResult, results)
        resolve(finalResult) 
      } catch (error) {
        reject(error)
      }
    })
  }

  query(query: string):Promise<any> {
    return new Promise (async(resolve, reject) => {
      try {
        const [results] = await this.dbConnection.query(query)
        let finalResult:any[] = []
        finalResult = this.prepareResponseData(finalResult, results)
        resolve(finalResult) 
      } catch (error) {
        reject(error)
      }
    })
  }
}
