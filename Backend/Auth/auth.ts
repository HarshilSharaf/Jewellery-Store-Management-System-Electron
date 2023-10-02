import { Injectable } from "@angular/core";
import { DatabaseService } from "../Shared/database.service";


@Injectable({
    providedIn: 'root'
  })
export class Auth {
      
 public constructor(private dbService:DatabaseService) {}

 async loginUser(userName:string): Promise<any> {
   return await this.dbService.query(`call loginUser('${userName}');`);
 }

}
