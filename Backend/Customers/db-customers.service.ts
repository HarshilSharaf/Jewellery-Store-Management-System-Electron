import { Injectable } from '@angular/core';
import dayjs from 'dayjs';
import { CustomerDetails } from 'client/app/modules/customers/models/customerDetails';
import { DatabaseService } from '../Shared/database.service';
import { CustomerServiceInterface } from 'client/app/interfaces/Customers/customer-service-interface';

@Injectable({
  providedIn: 'root'
})
export class DbCustomersService implements CustomerServiceInterface {

  constructor(private databaseService: DatabaseService) { }

  getTotalCustomers() {
    return this.databaseService.query("call get_total_customers();");
  }

  getAllCustomers(fetchImage: boolean, itemsPerPage: number, pageNumber = 1, searchQuery = '', fetchAll = false) {
    return this.databaseService.execute(`call get_all_customers(?, ?, ?, ?, ?);`, [
      fetchImage ? 1 : 0,
      itemsPerPage,
      pageNumber,
      fetchAll ? 1 : 0,
      searchQuery
    ]);
  }

  addCustomer(customerDetails: CustomerDetails & any) {
    return this.databaseService.execute(
      "call add_customer(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);",
      [
        customerDetails.firstName,
        customerDetails.lastName,
        dayjs(customerDetails.dateOfBirth).format('YYYY-MM-DD'),
        customerDetails.gender,
        customerDetails.address,
        customerDetails.city,
        customerDetails.state ?? null,
        customerDetails.stateCode ?? null,
        customerDetails.email || null,
        customerDetails.phoneNumber,
        customerDetails.gstin ?? null,
        customerDetails.pan ?? null,
        customerDetails.remarks ?? null,
        customerDetails.imagePath
      ]
    );
  }

  deleteCustomer(customerGuid: string, hardDelete = 0) {
    return this.databaseService.execute("call delete_customer(?, ?);", [
      hardDelete,
      customerGuid
    ]);
  }

  getCustomerDetails(customerGuid: string) {
    return this.databaseService.execute("call get_customer_details(?);", [
      customerGuid
    ]);
  }

  getCustomerImage(customerGuid: string) {
    return this.databaseService.execute("call get_customer_image(?);", [
      customerGuid
    ]);
  }

  updateCustomerImage(customerGuid: string, imagePath: string) {
    return this.databaseService.execute("call update_customer_image(?, ?);", [
      customerGuid,
      imagePath
    ]);
  }

  deleteCustomerImage(customerGuid: string) {
    return this.databaseService.execute("call delete_customer_image(?);", [
      customerGuid
    ]);
  }

  updateCustomerDetails(customerDetails: any) {
    return this.databaseService.execute(
      "call update_customer_details(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);",
      [
        customerDetails.customerGuid,
        customerDetails.firstName,
        customerDetails.lastName,
        dayjs(customerDetails.dob ?? customerDetails.dateOfBirth).format('YYYY-MM-DD'),
        customerDetails.address || null,
        customerDetails.city,
        customerDetails.state ?? null,
        customerDetails.stateCode ?? null,
        customerDetails.email || null,
        customerDetails.phone ?? customerDetails.phoneNumber,
        customerDetails.gender,
        customerDetails.gstin ?? null,
        customerDetails.pan ?? null,
        customerDetails.remarks ?? null
      ]
    );
  }

  getTotalAmountOfProductsBoughtForCustomer(customerGuid: string) {
    return this.databaseService.execute("call get_total_amount_of_products_bought_for_customer(?);", [
      customerGuid
    ]);
  }

  getCustomerOrders(customerGuid: string, itemsPerPage: number, pageNumber = 1, searchQuery = '', getCancelledOrders = 1) {
    return this.databaseService.execute("call get_customer_orders (?, ?, ?, ?, ?);", [
      getCancelledOrders,
      customerGuid,
      itemsPerPage,
      pageNumber,
      searchQuery
    ]);
  }
}
