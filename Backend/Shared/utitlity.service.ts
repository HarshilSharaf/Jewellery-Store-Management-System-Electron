
import { Injectable } from '@angular/core';
import { UtilityServiceInterface } from 'client/app/interfaces/Shared/utility-service-interface';
const { ipcRenderer } = (<any>window).require('electron');


@Injectable({
  providedIn: 'root'
})

export class UtilityService implements UtilityServiceInterface{
    
    constructor() {}

    getFilePath(imagePath: string) {        
        return 'file://' + imagePath
    }

    async relaunch() {
        ipcRenderer.invoke('relaunch-app');
    }
}