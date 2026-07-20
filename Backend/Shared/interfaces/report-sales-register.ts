export interface SalesRegisterRow {
  id: number;
  invoiceGuid: string;
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  customerGstin?: string | null;
  customerPan?: string | null;
  customerState?: string | null;
  customerStateCode?: string | null;
  placeOfSupply?: string | null;
  hsn: string;
  subTotalTaxable: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalMakingCharge: number;
  totalStoneCharge: number;
  totalWastageCharge: number;
  totalDiscount: number;
  oldGoldCredit: number;
  roundOffAmount: number;
  grandTotal: number;
  status: 'paid' | 'pending' | 'cancelled';
  invoiceType: 'B2B' | 'B2CS';
}
