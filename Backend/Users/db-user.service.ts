import { Injectable, inject } from '@angular/core';
import { DatabaseService } from '../Shared/database.service';

@Injectable({
  providedIn: 'root'
})
export class DbUserService {
  private dbService = inject(DatabaseService);


  getUserDetails(userId:number) {
    return this.dbService.execute("call get_user_details(?);",[
      userId
    ])
  }

  updateUserDetails(userDetails:any) {
    return this.dbService.execute("call update_user_details(?, ?, ?, ?);",[
      userDetails.uid,
      userDetails.userName,
      userDetails.password,
      userDetails.email
    ])
  }

  getUserImage(uid:number) {
    return this.dbService.execute("call get_user_image(?);", [
      uid
    ])
  }

  updateUserImage(uid:number, imageFileName:string ) {
    return this.dbService.execute("call update_user_image(?, ?);",[
      uid,
      imageFileName
    ])
  }

  deleteUserImage(uid:number) {
    return this.dbService.execute("call delete_user_image(?);",[
      uid
    ])
  }
}
