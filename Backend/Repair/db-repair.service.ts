import { Injectable } from '@angular/core';
import { DatabaseService } from '../Shared/database.service';
import {
  CreateRepairTicketPayload,
  GetAllRepairTicketsArgs,
  LinkRepairToKarigarPayload,
  RepairTicket,
  SettleRepairTicketPayload,
  UpdateRepairStatusPayload,
} from '../Shared/interfaces/repair';

@Injectable({
  providedIn: 'root'
})
export class DbRepairService {

  constructor(private databaseService: DatabaseService) {}

  createTicket(payload: CreateRepairTicketPayload): Promise<any> {
    return this.databaseService.execute(
      'call create_repair_ticket(?, ?, ?, ?, ?, ?, ?, ?, ?);',
      [
        payload.customerGuid,
        payload.receivedByUserId ?? null,
        payload.itemDescription,
        payload.itemPhotoPath ?? null,
        payload.weight ?? null,
        payload.estimatedCharge ?? null,
        payload.estimatedReturnDate ?? null,
        payload.notes ?? null,
        payload.karigarGuid ?? null,
      ]
    );
  }

  updateStatus(payload: UpdateRepairStatusPayload): Promise<any> {
    return this.databaseService.execute(
      'call update_repair_status(?, ?, ?, ?, ?, ?);',
      [
        payload.ticketGuid,
        payload.newStatus,
        payload.actorUserId ?? null,
        payload.actualCharge ?? null,
        payload.paymentMode ?? null,
        payload.paymentRef ?? null,
      ]
    );
  }

  settleTicket(payload: SettleRepairTicketPayload): Promise<any> {
    return this.databaseService.execute(
      'call settle_repair_ticket(?, ?, ?, ?, ?);',
      [
        payload.ticketGuid,
        payload.actualCharge,
        payload.paymentMode,
        payload.paymentRef ?? null,
        payload.actorUserId ?? null,
      ]
    );
  }

  linkToKarigar(payload: LinkRepairToKarigarPayload): Promise<any> {
    return this.databaseService.execute(
      'call link_repair_to_karigar(?, ?, ?, ?);',
      [
        payload.ticketGuid,
        payload.karigarGuid,
        payload.karigarJobGuid ?? null,
        payload.actorUserId ?? null,
      ]
    );
  }

  getDetails(ticketGuid: string): Promise<any> {
    return this.databaseService.execute(
      'call get_repair_ticket_details(?);',
      [ticketGuid]
    );
  }

  getAll(args: GetAllRepairTicketsArgs): Promise<RepairTicket[]> {
    return this.databaseService.execute(
      'call get_all_repair_tickets(?, ?, ?, ?, ?, ?);',
      [
        args.status ?? null,
        args.customerSearch ?? null,
        args.dateFrom ?? null,
        args.dateTo ?? null,
        args.pageSize ?? 20,
        args.page ?? 1,
      ]
    );
  }

  getByCustomer(customerGuid: string): Promise<RepairTicket[]> {
    return this.databaseService.execute(
      'call get_repair_tickets_by_customer(?);',
      [customerGuid]
    );
  }

  deleteTicket(ticketGuid: string, actorUserId: number | null = null): Promise<any> {
    return this.databaseService.execute(
      'call delete_repair_ticket(?, ?);',
      [ticketGuid, actorUserId]
    );
  }
}
