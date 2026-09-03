'use strict';

/**
 * Generates realistic fake jewellery-store data for the performance sandbox.
 * All money values are in paise (integer), all weights in milligrams (integer)
 * to match the production DB schema.
 */

const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Reference pools
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
  'Amit', 'Priya', 'Rahul', 'Sunita', 'Vijay', 'Kavita', 'Suresh', 'Meena',
  'Rajesh', 'Anita', 'Deepak', 'Pooja', 'Sanjay', 'Rekha', 'Manoj', 'Geeta',
  'Arun', 'Nisha', 'Prakash', 'Shanti', 'Kishore', 'Lata', 'Hemant', 'Asha',
  'Bharat', 'Kamla', 'Dinesh', 'Savita', 'Narendra', 'Usha',
];

const LAST_NAMES = [
  'Sharma', 'Patel', 'Singh', 'Verma', 'Gupta', 'Agarwal', 'Shah', 'Jain',
  'Mehta', 'Rao', 'Nair', 'Iyer', 'Reddy', 'Sinha', 'Mishra', 'Pandey',
  'Trivedi', 'Chawla', 'Bose', 'Desai',
];

const CITIES  = ['Mumbai', 'Delhi', 'Ahmedabad', 'Surat', 'Jaipur', 'Chennai', 'Pune', 'Kolkata', 'Hyderabad', 'Bengaluru'];
const STATES  = ['Maharashtra', 'Gujarat', 'Rajasthan', 'Tamil Nadu', 'Karnataka', 'Delhi', 'Uttar Pradesh', 'West Bengal'];
const ST_CODE = ['27',          '24',      '08',        '33',         '29',        '07',   '09',             '19'];

const PURITY_CODES   = ['22K', '18K', '14K', '24K'];
const MAKING_MODES   = ['perGram', 'flat', 'percent'];
const PAYMENT_TYPES  = ['cash', 'card', 'upi', 'cheque'];
const GENDERS        = ['male', 'female'];
const DESCRIPTIONS   = ['Ring', 'Necklace', 'Bangle', 'Earring', 'Bracelet', 'Pendant', 'Chain', 'Anklet'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pick(arr)           { return arr[Math.floor(Math.random() * arr.length)]; }
function rand(min, max)      { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randMg(minG, maxG)  { return Math.round((minG + Math.random() * (maxG - minG)) * 1000); }
function randPaise(minRs, maxRs) { return Math.round((minRs + Math.random() * (maxRs - minRs)) * 100); }

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Generate N customer rows ready for INSERT.
 * phoneOffset ensures uniqueness across multiple calls (customers table has
 * a UNIQUE index on phoneNumber).
 */
function generateCustomers(n, phoneOffset = 0) {
  return Array.from({ length: n }, (_, i) => {
    const stateIdx = rand(0, STATES.length - 1);
    return {
      customerGuid: crypto.randomUUID(),
      firstName:    pick(FIRST_NAMES),
      lastName:     pick(LAST_NAMES),
      phoneNumber:  `9${String(phoneOffset + i).padStart(9, '0')}`,
      city:         pick(CITIES),
      state:        STATES[stateIdx],
      stateCode:    ST_CODE[stateIdx],
      gender:       pick(GENDERS),
    };
  });
}

/**
 * Generate N product rows. Requires valid FK IDs from the sandbox DB.
 * skuOffset ensures SKU uniqueness (products table has UNIQUE index on sku).
 */
function generateProducts(n, { masterCategoryId, subCategoryId, productCategoryId }, skuOffset = 0) {
  return Array.from({ length: n }, (_, i) => {
    const gross      = randMg(2, 50);
    const net        = Math.round(gross * (0.80 + Math.random() * 0.15));
    const stone      = Math.round(gross * Math.random() * 0.08);
    const makingMode = pick(MAKING_MODES);
    const purity     = pick(PURITY_CODES);
    const tagPrice   = randPaise(8000, 350000);

    return {
      productGuid:        crypto.randomUUID(),
      sku:                `PERF-${String(skuOffset + i).padStart(7, '0')}`,
      purityCode:         purity,
      productDescription: `${pick(DESCRIPTIONS)} ${purity}`,
      grossWeight:        gross,
      netWeight:          net,
      stoneWeight:        stone,
      stoneCharges:       stone > 0 ? randPaise(0, 5000) : 0,
      makingMode,
      makingValue:        makingMode === 'perGram' ? randPaise(200, 800) : randPaise(500, 5000),
      wastagePercent:     Math.round(Math.random() * 300) / 100,  // 0.00–3.00
      costPrice:          Math.round(tagPrice * 0.85),
      tagPrice,
      hsnCode:            '7113',
      masterCategoryId,
      subCategoryId,
      productCategoryId,
    };
  });
}

/**
 * Generate N invoice descriptors (invoice + lineItems + payment bundled).
 * invoiceOffset ensures unique invoice numbers.
 */
function generateInvoices(n, { customerIds, productIds, lineItemsPerInvoice = 3 }, invoiceOffset = 0) {
  return Array.from({ length: n }, (_, i) => {
    const grandTotal = randPaise(10000, 600000);
    const cgst       = Math.round(grandTotal * 0.015);
    const sgst       = cgst;
    const lineItems  = Array.from({ length: lineItemsPerInvoice }, (_, j) => {
      const lTotal = Math.round(grandTotal / lineItemsPerInvoice);
      return {
        productId:     pick(productIds),
        lineType:      'product',
        description:   `${pick(DESCRIPTIONS)} line ${j + 1}`,
        purityCode:    pick(PURITY_CODES),
        hsnCode:       '7113',
        grossWeight:   randMg(2, 25),
        netWeight:     randMg(1, 20),
        stoneWeight:   randMg(0, 3),
        ratePerGram:   randPaise(5000, 8000),
        metalValue:    randPaise(800, 40000),
        makingCharge:  randPaise(200, 5000),
        stoneCharge:   randPaise(0, 2000),
        wastageCharge: randPaise(0, 1000),
        discountAmount: 0,
        taxableAmount: Math.round(lTotal * 0.97),
        cgst:          Math.round(lTotal * 0.015),
        sgst:          Math.round(lTotal * 0.015),
        igst:          0,
        lineTotal:     lTotal,
      };
    });

    return {
      invoiceGuid:          crypto.randomUUID(),
      invoiceNumber:        `PERF/${String(invoiceOffset + i + 1).padStart(6, '0')}`,
      soldToCustomer:       pick(customerIds),
      grandTotal,
      isPaymentDone:        1,
      placeOfSupply:        '27',
      hsn:                  '7113',
      subTotalTaxable:      Math.round(grandTotal * 0.97),
      totalCgst:            cgst,
      totalSgst:            sgst,
      totalIgst:            0,
      totalDiscount:        0,
      totalMakingCharge:    Math.round(grandTotal * 0.05),
      totalStoneCharge:     0,
      totalWastageCharge:   0,
      oldGoldCreditAmount:  0,
      roundOffAmount:       rand(-50, 50),
      lineItems,
      payment: {
        paymentGuid: crypto.randomUUID(),
        amount:      grandTotal,
        paymentType: pick(PAYMENT_TYPES),
        refNumber:   null,
        remarks:     null,
      },
    };
  });
}

module.exports = { generateCustomers, generateProducts, generateInvoices };
