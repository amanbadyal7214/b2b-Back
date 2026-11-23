const Counter = require("../Model/CounterModel");
const Invoice = require("../Model/InvoiceModel");
const Order = require("../Model/OrderModel");
const User = require("../Model/UserModel");

// Standard GST State Codes
const GST_STATE_CODES = {
  jammu_and_kashmir: "01",
  himachal_pradesh: "02",
  punjab: "03",
  chandigarh: "04",
  uttarakhand: "05",
  haryana: "06",
  delhi: "07",
  rajasthan: "08",
  uttar_pradesh: "09",
  bihar: "10",
  sikkim: "11",
  arunachal_pradesh: "12",
  nagaland: "13",
  manipur: "14",
  mizoram: "15",
  tripura: "16",
  meghalaya: "17",
  assam: "18",
  west_bengal: "19",
  jharkhand: "20",
  odisha: "21",
  chhattisgarh: "22",
  madhya_pradesh: "23",
  gujarat: "24",
  daman_and_diu: "25",
  dadra_and_nagar_haveli: "26",
  maharashtra: "27",
  andhra_pradesh: "28", // (old) or 37
  karnataka: "29",
  goa: "30",
  lakshadweep: "31",
  kerala: "32",
  tamil_nadu: "33",
  puducherry: "34",
  andaman_and_nicobar: "35",
  telangana: "36",
};

/**
 * Normalizes state name to get 2-digit GST state code
 */
function resolveStateCode(stateName, gstin = "") {
  if (gstin && gstin.trim().length >= 2) {
    const codeFromGstin = gstin.trim().substring(0, 2);
    if (/^\d{2}$/.test(codeFromGstin)) {
      return codeFromGstin;
    }
  }

  if (!stateName) return "24"; // default Gujarat
  const clean = stateName.toLowerCase().replace(/[^a-z]/g, "_").replace(/__+/g, "_");

  for (const [key, code] of Object.entries(GST_STATE_CODES)) {
    if (clean.includes(key) || key.includes(clean)) {
      return code;
    }
  }

  if (clean.includes("gujarat")) return "24";
  if (clean.includes("maharashtra") || clean.includes("mumbai") || clean.includes("pune")) return "27";
  if (clean.includes("delhi")) return "07";
  if (clean.includes("rajasthan")) return "08";
  if (clean.includes("tamil") || clean.includes("chennai")) return "33";
  if (clean.includes("karnataka") || clean.includes("bangalore")) return "29";

  return "27"; // fallback inter-state
}

/**
 * Returns Indian Financial Year string (e.g. "2026-27")
 */
function getCurrentFinancialYear(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed: 0 = Jan, 3 = Apr

  if (month >= 3) {
    // April to December
    const nextYear = String(year + 1).slice(-2);
    return `${year}-${nextYear}`;
  } else {
    // January to March
    const currentYearShort = String(year).slice(-2);
    return `${year - 1}-${currentYearShort}`;
  }
}

/**
 * Generates atomic sequential invoice number
 */
async function generateNextInvoiceNumber(prefix = "INV", type = "tax_invoice") {
  const fy = getCurrentFinancialYear();
  const pfx = type === "credit_note" ? "CN" : prefix;
  const counterKey = `invoice_${pfx}_${fy}`;
  const seq = await Counter.getNextSequence(counterKey);
  const padded = String(seq).padStart(6, "0");
  return `${pfx}-${fy}-${padded}`;
}

/**
 * Converts numbers to Indian Currency Words (Lakhs & Crores)
 */
function numberToIndianWords(amount) {
  const num = Math.round(Number(amount) || 0);
  if (num === 0) return "INR Zero Only";

  const a = [
    "",
    "One ",
    "Two ",
    "Three ",
    "Four ",
    "Five ",
    "Six ",
    "Seven ",
    "Eight ",
    "Nine ",
    "Ten ",
    "Eleven ",
    "Twelve ",
    "Thirteen ",
    "Fourteen ",
    "Fifteen ",
    "Sixteen ",
    "Seventeen ",
    "Eighteen ",
    "Nineteen ",
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function inWords(n) {
    if (n < 20) return a[n];
    const digit = n % 10;
    return b[Math.floor(n / 10)] + (digit ? " " + a[digit] : " ");
  }

  let str = "";
  const crore = Math.floor(num / 10000000);
  let rem = num % 10000000;
  const lakh = Math.floor(rem / 100000);
  rem = rem % 100000;
  const thousand = Math.floor(rem / 1000);
  rem = rem % 1000;
  const hundred = Math.floor(rem / 100);
  rem = rem % 100;

  if (crore > 0) str += inWords(crore) + "Crore ";
  if (lakh > 0) str += inWords(lakh) + "Lakh ";
  if (thousand > 0) str += inWords(thousand) + "Thousand ";
  if (hundred > 0) str += inWords(hundred) + "Hundred ";
  if (rem > 0) {
    if (str !== "") str += "and ";
    str += inWords(rem);
  }

  return `INR ${str.trim()} Only`;
}

/**
 * Core Service: createInvoiceForOrder
 * Auto-called on payment confirmation or dispatch, or manually by admin.
 * Idempotent: if an invoice already exists for the order, returns existing.
 */
async function createInvoiceForOrder(orderOrId, options = {}) {
  let order = orderOrId;
  if (typeof orderOrId === "string" || orderOrId instanceof require("mongoose").Types.ObjectId) {
    order = await Order.findById(orderOrId).populate("userId");
  }

  if (!order) {
    throw new Error("Order not found for invoice generation.");
  }

  const {
    shipmentId = "",
    type = "tax_invoice",
    creditNoteReference = "",
    creditNoteReason = "",
    adminNotes = "",
    overridePaymentStatus = null,
  } = options;

  // 1. Idempotency Check (Only 1 tax invoice per order unless shipmentId is set)
  if (type === "tax_invoice") {
    const existing = await Invoice.findOne({
      orderId: order.orderId,
      type: "tax_invoice",
      ...(shipmentId ? { shipmentId } : {}),
      status: { $ne: "cancelled" },
    });
    if (existing) {
      return existing;
    }
  }

  // 2. Resolve Buyer Details snapshot
  const buyerUser = order.userId && typeof order.userId === "object" ? order.userId : null;
  const shippingAddr = order.shippingAddress || {};
  const buyerState = shippingAddr.state || (buyerUser && buyerUser.state) || "Maharashtra";
  const buyerGstin = shippingAddr.gstin || (buyerUser && buyerUser.gstin) || "";
  const buyerStateCode = resolveStateCode(buyerState, buyerGstin);

  // Seller is in Gujarat (State Code 24)
  const isInterState = buyerStateCode !== "24";
  const placeOfSupply = `${buyerState} (${buyerStateCode})`;

  const buyerDetails = {
    businessName: shippingAddr.storeName || (buyerUser && (buyerUser.storeName || buyerUser.companyName || buyerUser.name)) || "Retail Partner",
    contactName: shippingAddr.contactName || (buyerUser && buyerUser.name) || "Store Manager",
    gstin: buyerGstin,
    pan: buyerGstin && buyerGstin.length >= 10 ? buyerGstin.substring(2, 12) : "",
    phone: shippingAddr.phone || (buyerUser && buyerUser.phone) || "",
    email: shippingAddr.email || (buyerUser && buyerUser.email) || "",
    billingAddress: {
      street: shippingAddr.street || "",
      city: shippingAddr.city || "",
      state: buyerState,
      pincode: shippingAddr.pincode || "",
      country: "India",
    },
    shippingAddress: {
      street: shippingAddr.street || "",
      city: shippingAddr.city || "",
      state: buyerState,
      pincode: shippingAddr.pincode || "",
      country: "India",
    },
    placeOfSupply,
    placeOfSupplyCode: buyerStateCode,
    isInterState,
  };

  // 3. Process Line Items and Calculate Taxes
  let grossTaxable = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;

  const invoiceItems = (order.items || []).map((item) => {
    const qty = Number(item.quantity) || 1;
    const unitPrice = Number(item.unitPrice) || 0;
    const taxableAmount = Math.round(unitPrice * qty);
    grossTaxable += taxableAmount;

    // Garment GST: 5% (if rate <= ₹1000) or 12% (if rate > ₹1000)
    const gstRate = unitPrice > 1000 ? 0.12 : 0.05;

    let cgstRate = 0;
    let cgstAmount = 0;
    let sgstRate = 0;
    let sgstAmount = 0;
    let igstRate = 0;
    let igstAmount = 0;

    if (isInterState) {
      igstRate = gstRate;
      igstAmount = Math.round(taxableAmount * gstRate);
      totalIgst += igstAmount;
    } else {
      cgstRate = gstRate / 2;
      cgstAmount = Math.round(taxableAmount * cgstRate);
      sgstRate = gstRate / 2;
      sgstAmount = Math.round(taxableAmount * sgstRate);
      totalCgst += cgstAmount;
      totalSgst += sgstAmount;
    }

    const totalAmount = taxableAmount + (isInterState ? igstAmount : cgstAmount + sgstAmount);

    // Resolve garment HSN: 6109 for T-shirts/Polo, 6203 for Trousers/Jackets
    const nameLower = (item.productName || "").toLowerCase();
    let hsn = "6109";
    if (nameLower.includes("trouser") || nameLower.includes("cargo") || nameLower.includes("pant") || nameLower.includes("denim")) {
      hsn = "6203";
    } else if (nameLower.includes("hoodie") || nameLower.includes("sweatshirt")) {
      hsn = "6110";
    } else if (nameLower.includes("shirt") || nameLower.includes("overshirt")) {
      hsn = "6205";
    }

    return {
      productId: item.productId,
      skuId: item.skuId || item.productSku || "",
      productSku: item.productSku || "",
      productName: item.productName || "Garment SKU",
      hsnCode: hsn,
      color: item.color || "Standard",
      size: item.size || "M",
      quantity: qty,
      packs: Math.max(1, Math.round(qty / 4)),
      pcsPerPack: 4,
      ratePerPc: unitPrice,
      discountAmount: 0,
      taxableAmount,
      gstRate,
      cgstRate,
      cgstAmount,
      sgstRate,
      sgstAmount,
      igstRate,
      igstAmount,
      totalAmount,
    };
  });

  const totalTax = isInterState ? totalIgst : totalCgst + totalSgst;
  const freightCost = Number(order.pricing?.freightCost) || 0;
  const unroundedTotal = grossTaxable + totalTax + freightCost;
  const grandTotal = Math.round(unroundedTotal);
  const roundOff = Math.round((grandTotal - unroundedTotal) * 100) / 100;
  const amountInWords = numberToIndianWords(grandTotal);

  // 4. Payment terms & status resolution
  const isPaid = order.paymentStatus === "paid" || overridePaymentStatus === "paid";
  const paymentMethod = order.paymentMethod || "razorpay";
  let paymentTerms = "Prepaid";
  let dueDate = new Date();

  if (paymentMethod === "cod") {
    paymentTerms = "COD";
    dueDate.setDate(dueDate.getDate() + 4);
  } else if (paymentMethod === "credit" || buyerUser?.creditProfile?.paymentTerms === "Net 30") {
    paymentTerms = "Net 30";
    dueDate.setDate(dueDate.getDate() + 30);
  } else if (buyerUser?.creditProfile?.paymentTerms === "Net 15") {
    paymentTerms = "Net 15";
    dueDate.setDate(dueDate.getDate() + 15);
  } else if (!isPaid) {
    dueDate.setDate(dueDate.getDate() + 7);
  }

  const invoiceNumber = await generateNextInvoiceNumber("INV", type);
  const financialYear = getCurrentFinancialYear();

  // 5. Create Document
  const invoice = new Invoice({
    invoiceNumber,
    financialYear,
    orderId: order.orderId,
    orderRef: order._id,
    shipmentId,
    buyerId: order.userId?._id || order.userId,
    type,
    creditNoteReference,
    creditNoteReason,
    buyerDetails,
    items: invoiceItems,
    totals: {
      taxableSubtotal: grossTaxable,
      discountTotal: Number(order.pricing?.discountAmount) || 0,
      cgstTotal: totalCgst,
      sgstTotal: totalSgst,
      igstTotal: totalIgst,
      totalTax,
      freightCost,
      roundOff,
      grandTotal,
      amountInWords,
    },
    paymentDetails: {
      paymentStatus: isPaid ? "paid" : "unpaid",
      paymentMethod,
      paymentTerms,
      dueDate,
      paidAt: isPaid ? order.paidAt || new Date() : null,
      amountPaid: isPaid ? grandTotal : 0,
      outstandingAmount: isPaid ? 0 : grandTotal,
    },
    status: isPaid ? "paid" : "issued",
    notes: adminNotes || "Computer generated wholesale GST Tax Invoice. No physical signature required.",
  });

  await invoice.save();
  return invoice;
}

module.exports = {
  GST_STATE_CODES,
  resolveStateCode,
  getCurrentFinancialYear,
  generateNextInvoiceNumber,
  numberToIndianWords,
  createInvoiceForOrder,
};
