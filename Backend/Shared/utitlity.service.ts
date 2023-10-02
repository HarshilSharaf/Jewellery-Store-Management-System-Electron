
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})

export class UtilityService {
    
    constructor() {}

    getFilePath(imagePath: string) {        
        return 'file://' + imagePath
    }

    async relaunch() {
        return
    }
}