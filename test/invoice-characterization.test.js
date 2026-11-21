var test = require('node:test');
var assert = require('node:assert/strict');

var invoice = require('../lib/invoice');
var orders = require('../lib/orders');
var pricing = require('../lib/pricing');
var reports = require('../lib/reports');

function createDb() {
  return {
    nextOrderId: 1001,
    orders: [],
    products: [],
    customers: [],
    settlements: [],
    auditLog: []
  };
}

function billedItems() {
  return [
    { id: 1, name: 'Rice', hsn: '1006', price: 200, qty: 2 },
    { id: 2, name: 'Packaged Tea', hsn: '0902', price: 200, qty: 1 }
  ];
}

test('CURRENT BEHAVIOUR: pricing bills an HSN-rated, discounted order from post-discount taxable values', function () {
  var totals = pricing.computeTotals(billedItems(), 'SAVE10');

  assert.deepEqual(totals, {
    subtotal: 600,
    discount: 60,
    taxable: 540,
    tax: 50.4,
    cgst: 25.2,
    sgst: 25.2,
    total: 590.4,
    lines: [
      { id: 1, name: 'Rice', hsn: '1006', gstPercent: 5, gross: 400, discount: 40, taxable: 360, tax: 18, net: 378 },
      { id: 2, name: 'Packaged Tea', hsn: '0902', gstPercent: 18, gross: 200, discount: 20, taxable: 180, tax: 32.4, net: 212.4 }
    ]
  });
});

test('invoice uses the same HSN rates and post-discount taxable values as billing', function () {
  var figures = invoice.computeInvoiceFigures({
    items: billedItems(),
    coupon: 'SAVE10'
  });

  assert.deepEqual(figures, {
    subtotal: 600,
    discount: 60,
    tax: 50.4,
    cgst: 25.2,
    sgst: 25.2,
    total: 590.4,
    rows: [
      { name: 'Rice', sku: '-', hsn: '1006', qty: 2, price: 200, gstPercent: 5, line: 400, lineTax: 18 },
      { name: 'Packaged Tea', sku: '-', hsn: '0902', qty: 1, price: 200, gstPercent: 18, line: 200, lineTax: 32.4 }
    ]
  });
});

test('GST reconciliation matches the stored billed order and invoice', function () {
  var db = createDb();
  var billed = pricing.computeTotals(billedItems(), 'SAVE10');
  var order = orders.add(db, {
    items: billedItems(),
    coupon: 'SAVE10',
    subtotal: billed.subtotal,
    discount: billed.discount,
    tax: billed.tax,
    total: billed.total
  });

  assert.equal(order.total, 590.4);
  assert.deepEqual(reports.getGstReconciliation(db), {
    totalChecked: 1,
    mismatchCount: 0,
    totalDelta: 0,
    rows: [{
      orderId: 1001,
      date: order.date,
      customer: 'Walk-in',
      coupon: 'SAVE10',
      ledgerSubtotal: 600,
      ledgerDiscount: 60,
      ledgerTax: 50.4,
      ledgerTotal: 590.4,
      invoiceDiscount: 60,
      invoiceTax: 50.4,
      invoiceTotal: 590.4,
      delta: 0,
      matched: true
    }]
  });
});
