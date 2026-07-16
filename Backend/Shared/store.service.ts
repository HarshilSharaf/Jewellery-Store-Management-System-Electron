import { SettingsModel } from 'client/app/modules/settings/models/settings-model';
const Store = (<any>window).require('electron-store');

import { Injectable, signal } from '@angular/core';
import { StoreServiceInterface } from 'client/app/interfaces/Shared/store-service-interface';

@Injectable({
  providedIn: 'root'
})
export class StoreService implements StoreServiceInterface {

  private store: any;
  isStoreInitialized = signal<boolean>(false);

  constructor() {}

  async initializeStore(): Promise<void> {
    this.store = new Store();
    const authData = await this.get('authData');
    const currentDate = new Date().getTime();
    const expirationDate = new Date(authData?.expiration).getTime();
    const dbInfo = await this.get('defaultDbInfo');

    if (!dbInfo) {
      // Add a fallback database to connect to
      const defaultDbInfo: SettingsModel = {
        DATABASE_NAME: 'jewellery',
        DATABASE_USERNAME: 'zeus_user',
        DATABASE_PASSWORD: 'zeus@123',
        DATABASE_PORT: 3306,
        DATABASE_HOST: 'localhost',
        LAST_UPDATED_ON: new Date().toUTCString(),
      };
      await this.set('defaultDbInfo', defaultDbInfo);
    }

    // Delete authData from store if it is expired
    if (authData && (currentDate > expirationDate)) {
      await this.delete('authData');
    }

    this.isStoreInitialized.set(true);
  }

  async get(key: string): Promise<any> {
    const value = this.store.get(key);
    return value ?? null;
  }

  async set(key: string, value: any): Promise<boolean> {
    try {
      this.store.set(key, value);
      return true;
    } catch {
      throw new Error(`Failed to set key: ${key}`);
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      this.store.delete(key);
      return true;
    } catch {
      throw new Error(`Failed to delete key: ${key}`);
    }
  }
}
