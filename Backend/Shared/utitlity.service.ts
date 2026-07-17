import { Injectable } from '@angular/core';
import { UtilityServiceInterface } from 'client/app/interfaces/Shared/utility-service-interface';

@Injectable({
  providedIn: 'root'
})
export class UtilityService implements UtilityServiceInterface {

  private electronAPI: any = (window as any).electronAPI;

  constructor() {}

  getFilePath(imagePath: string) {
    return 'file://' + imagePath;
  }

  async relaunch() {
    // Goes through the preload-bridged IPC channel rather than requiring
    // the `electron` module directly (which is not allowed once
    // contextIsolation is on).
    await this.electronAPI.app.relaunch();
  }
}
