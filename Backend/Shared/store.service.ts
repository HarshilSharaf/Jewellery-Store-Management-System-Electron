import { SettingsModel } from 'client/app/modules/settings/models/settings-model';

import { Injectable, signal } from '@angular/core';
import { StoreServiceInterface } from 'client/app/interfaces/Shared/store-service-interface';
import { LoggerService } from './logger.service';

@Injectable({
  providedIn: 'root'
})
export class StoreService implements StoreServiceInterface {

  private electronAPI: any = (window as any).electronAPI;
  isStoreInitialized = signal<boolean>(false);

  constructor(private loggerService: LoggerService) {}

  async initializeStore(): Promise<void> {
    // The concrete electron-store instance lives in the main process now.
    // The renderer only sees get/set/delete via IPC (see src-electron/main.js).
    const authData = await this.get('authData');
    const currentDate = new Date().getTime();
    const expirationDate = new Date(authData?.expiration).getTime();
    const dbInfo = await this.get('defaultDbInfo');

    if (!dbInfo) {
      // Ask the main process for the current default DB connection info,
      // which it derives from environment variables at launch time (falling
      // back to .env.example values with a log warning if unset).
      const defaultsFromMain = await this.electronAPI?.store?.getDefaultDbInfo?.();
      const defaultDbInfo: SettingsModel = defaultsFromMain ?? {
        DATABASE_NAME: 'jewellery',
        DATABASE_USERNAME: 'zeus_user',
        DATABASE_PASSWORD: 'zeus@123',
        DATABASE_PORT: 3306,
        DATABASE_HOST: 'localhost',
        LAST_UPDATED_ON: new Date().toUTCString(),
      };
      if (!defaultsFromMain) {
        this.loggerService.LogError(
          'StoreService.initializeStore(): main-process defaultDbInfo unavailable; using hard-coded fallback',
          'StoreService.initializeStore()'
        );
      }
      // Ensure LAST_UPDATED_ON is present even when supplied by main.
      defaultDbInfo.LAST_UPDATED_ON = defaultDbInfo.LAST_UPDATED_ON || new Date().toUTCString();
      await this.set('defaultDbInfo', defaultDbInfo);
    }

    // Delete authData from store if it is expired
    if (authData && (currentDate > expirationDate)) {
      await this.delete('authData');
    }

    this.isStoreInitialized.set(true);
  }

  async get(key: string): Promise<any> {
    const value = await this.electronAPI.store.get(key);
    return value ?? null;
  }

  async set(key: string, value: any): Promise<boolean> {
    try {
      await this.electronAPI.store.set(key, value);
      return true;
    } catch {
      throw new Error(`Failed to set key: ${key}`);
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      await this.electronAPI.store.delete(key);
      return true;
    } catch {
      throw new Error(`Failed to delete key: ${key}`);
    }
  }
}
