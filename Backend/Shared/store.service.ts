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
    // The data layer is embedded SQLite — there is no DB connection info to
    // seed; this only prunes an expired auth session.
    const authData = await this.get('authData');
    if (authData?.expiration) {
      const currentDate = new Date().getTime();
      const expirationDate = new Date(authData.expiration).getTime();
      if (currentDate > expirationDate) {
        await this.delete('authData');
      }
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
