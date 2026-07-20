import { Injectable } from '@angular/core';
import { DatabaseService } from '../Shared/database.service';
import { OrdersServiceInterface } from 'client/app/interfaces/Orders/orders-service-interface';

@Injectable({
  providedIn: 'root'
})
export class DbOrdersService implements OrdersServiceInterface {

  constructor(private databaseService:DatabaseService) { }

  getSalesAndLabour(timeInterval:number) {
    return this.databaseService.execute("call get_sales_labour(?);",[
      timeInterval
    ])
  }

  getRecentOrders(numberOfOrders:number) {
    return this.databaseService.execute("call get_recent_orders(?);", [
      numberOfOrders
    ])
  }

  getTotalRevenueInLast6Months() {
    return this.databaseService.query("call get_revenue_of_six_months();")
  }

  getAllOrders(itemsPerPage:number , pageNumber:number, searchQuery= ''): Promise<any> {
    return this.databaseService.execute('call get_all_orders(?, ?, ?);',
    [
      itemsPerPage,
      pageNumber,
      searchQuery
    ])
  }

  getOrderDetails(orderGuid: string): Promise<any> {
    return this.databaseService.execute('call get_order_details(?);', [orderGuid]);
  }

  saveOrder(orderData:any) {
    return this.databaseService.execute("call save_order(?, ?, ?, ?, ?, ?, ?, ?, ?, ?);",[
      orderData.totalAmountWithGST,
      orderData.totalAmountWithoutGst,
      orderData.totalDiscount,
      orderData.totalLabour,
      orderData.totalGST,
      null,
      orderData.customerId,
      orderData.amountPaid,
      orderData.paymentMethod,
      orderData.productsData
    ])
  }

  cancelOrder(orderGuid:string) {
    return this.databaseService.execute("call cancel_order(?);",[
      orderGuid
    ])
  }

  recordPayment(paymentData:any) {
    return this.databaseService.execute("call record_payment(?, ?, ?, ?, ?);",[
      paymentData.orderGuid,
      paymentData.paymentType,
      paymentData.remarks || null,
      paymentData.paymentAmount,
      paymentData.paymentDate
    ])
  }
}
