import { Injectable } from '@angular/core';
import { DatabaseService } from '../Shared/database.service';
import { OrdersServiceInterface } from 'client/app/interfaces/Orders/orders-service-interface';

@Injectable({
  providedIn: 'root'
})
export class DbOrdersService implements OrdersServiceInterface {

  constructor(private databaseService: DatabaseService) { }

  getSalesAndLabour(timeInterval: number) {
    return this.databaseService.execute("call get_sales_labour(?);", [
      timeInterval
    ]);
  }

  getRecentOrders(numberOfOrders: number) {
    return this.databaseService.execute("call get_recent_orders(?);", [
      numberOfOrders
    ]);
  }

  getTotalRevenueInLast6Months() {
    return this.databaseService.query("call get_revenue_of_six_months();");
  }

  getAllOrders(itemsPerPage: number, pageNumber: number, searchQuery = ''): Promise<any> {
    return this.databaseService.execute('call get_all_orders(?, ?, ?);', [
      itemsPerPage,
      pageNumber,
      searchQuery
    ]);
  }

  getOrderDetails(orderGuid: string): Promise<any> {
    return this.databaseService.execute('call get_order_details(?);', [orderGuid]);
  }

  saveOrder(orderData: any) {
    return this.databaseService.execute(
      "call save_order(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);",
      [
        orderData.customerId,
        orderData.placeOfSupply,
        orderData.hsn ?? '7113',
        orderData.rateSnapshot ? JSON.stringify(orderData.rateSnapshot) : null,
        orderData.subTotalTaxable,
        orderData.totalCgst,
        orderData.totalSgst,
        orderData.totalIgst,
        orderData.totalDiscount,
        orderData.totalMakingCharge,
        orderData.totalStoneCharge,
        orderData.totalWastageCharge,
        orderData.oldGoldCreditAmount ?? 0,
        orderData.roundOffAmount ?? 0,
        orderData.grandTotal,
        orderData.remarks ?? null,
        orderData.amountPaid ?? 0,
        orderData.paymentMethod ?? 'cash',
        orderData.paymentRefNumber ?? null,
        orderData.lineItems ? JSON.stringify(orderData.lineItems) : null,
        orderData.oldGoldReceipts ? JSON.stringify(orderData.oldGoldReceipts) : null
      ]
    );
  }

  cancelOrder(orderGuid: string, cancelReason: string | null = null) {
    return this.databaseService.execute("call cancel_order(?, ?);", [
      orderGuid,
      cancelReason
    ]);
  }

  recordPayment(paymentData: any) {
    return this.databaseService.execute("call record_payment(?, ?, ?, ?, ?, ?);", [
      paymentData.orderGuid,
      paymentData.paymentType,
      paymentData.refNumber ?? null,
      paymentData.remarks ?? null,
      paymentData.paymentAmount,
      paymentData.paymentDate
    ]);
  }
}
