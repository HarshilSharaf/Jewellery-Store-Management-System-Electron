import { SettingsModel } from 'client/app/modules/settings/models/settings-model';
import {createConnection, createPool} from 'mysql2';
import { StoreService } from './store.service';
import { Injectable } from '@angular/core';
const mysql = (<any>window).require('mysql2/promise');


@Injectable({
  providedIn: 'root'
})
export class DatabaseService {

  private dbConnection!: any;
  private dbConnectionInfo!:SettingsModel
  constructor(private storeService:StoreService) { }

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
          let timerInterval: any;
          throw error
        }
      
      
      resolve(this.dbConnection);
    })
  }

  execute(query: string, values:any[]):Promise<any> {
    return new Promise (async(resolve, reject) => {
      try {
        const [results] = await this.dbConnection.execute(query, values)
        resolve(results[0]) 
      } catch (error) {
        reject(error)
      }
    })
  }

  query(query: string):Promise<any> {
    return new Promise (async(resolve, reject) => {
      try {
        const [results] = await this.dbConnection.query(query)
        resolve(results[0]) 
      } catch (error) {
        reject(error)
      }
    })
  }
}
