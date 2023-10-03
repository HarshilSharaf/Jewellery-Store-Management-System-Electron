
import { Injectable } from '@angular/core';
const { ipcRenderer } = (<any>window).require('electron');


@Injectable({
  providedIn: 'root'
})

export class UtilityService {
    
    constructor() {}

    getFilePath(imagePath: string) {        
        return 'file://' + imagePath
    }

    async relaunch() {
        ipcRenderer.invoke('relaunch-app');
    }
}