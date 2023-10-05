import { SettingsModel } from 'client/app/modules/settings/models/settings-model';
const Store = (<any>window).require('electron-store');

import { Injectable } from '@angular/core';
import { StoreServiceInterface } from 'client/app/interfaces/Shared/store-service-interface';

@Injectable({
  providedIn: 'root'
})
export class StoreService implements StoreServiceInterface {

  private store:any

  constructor() { }

  initializeStore() :Promise<any> {
    return new Promise(async (resolve,reject) => {
      this.store = new Store()
      const authData = await this.get("authData");
      const currentDate = new Date().getTime()
      const expirationDate = new Date(authData?.expiration).getTime()
      const dbInfo = await this.get('defaultDbInfo')
      if(!dbInfo || dbInfo == null) {
        // Add a fallback database to connect to
        const defaultDbInfo: SettingsModel = {
          DATABASE_NAME: 'JewelleryStore',
          DATABASE_USERNAME: 'sa',
          DATABASE_PASSWORD: '****PASSWORD****',
          DATABASE_PORT: 3306,
          DATABASE_HOST: 'localhost',
          LAST_UPDATED_ON: new Date().toUTCString(),
        };
        await this.set('defaultDbInfo', defaultDbInfo);
      }

      //delete authData from store if it is expired
      if(authData && ( currentDate > expirationDate))
      {
        await this.delete('authData');
      }
      resolve(this.store);
    })
  }

  get(key:string): Promise<any> {
    return new Promise((resolve) => {
      const value = this.store.get(key)
      if (value) {
        resolve(value)
      }
      else {
        resolve(null)
      }
    })
  }

  set(key:string, value:any) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.store.set(key, value);
        resolve(true)
      } catch (error) {
        reject(false)
      }
    })
  }

  delete(key:string) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.store.delete(key);
        resolve(true)
      } catch (error) {
        reject(false)
      }
    })
  }
}
