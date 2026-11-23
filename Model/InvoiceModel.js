const mongoose = require("mongoose");

const invoiceItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    skuId: {
      type: String,
      default: "",
    },
    productSku: {
      type: String,
      default: "",
    },
    productName: {
      type: String,
      required: true,
    },
    hsnCode: {
      type: String,
      default: "6109", // Standard Garment HSN (Knitted/Crocheted T-shirts/Apparel)
    },
    color: {
      type: String,
      default: "Standard",
    },
    size: {
      type: String,
      default: "Standard",
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    packs: {
      type: Number,
      default: 1,
    },
    pcsPerPack: {
      type: Number,
      default: 4,
    },
    ratePerPc: {
      type: Number,
      required: true,
    },
    discountAmount: {
      type: Number,
      default: 0,
    },
    taxableAmount: {
      type: Number,
      required: true,
    },
    gstRate: {
      type: Number,
      default: 0.05, // 5% GST standard for wholesale garments < ₹1000/pc, 12% if > ₹1000
    },
    cgstRate: {
      type: Number,
      default: 0,
    },
    cgstAmount: {
      type: Number,
      default: 0,
    },
    sgstRate: {
      type: Number,
      default: 0,
    },
    sgstAmount: {
      type: Number,
      default: 0,
    },
    igstRate: {
      type: Number,
      default: 0,
    },
    igstAmount: {
      type: Number,
      default: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
    },
  },
  { _id: true }
);

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    financialYear: {
      type: String,
      required: true,
      index: true,
    },
    orderId: {
      type: String,
      required: true,
      index: true,
    },
    orderRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },
    shipmentId: {
      type: String,
      default: "",
    },
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["tax_invoice", "credit_note", "proforma"],
      default: "tax_invoice",
      index: true,
    },
    creditNoteReference: {
      type: String,
      default: "", // Original invoice number if this document is a Credit Note
    },
    creditNoteReason: {
      type: String,
      default: "", // 'return', 'cancellation', 'price_correction'
    },
    sellerDetails: {
      legalName: { type: String, default: "BUDDY VS BUFF TEXTILE MILLS PRIVATE LIMITED" },
      tradeName: { type: String, default: "BUDDY VS BUFF (BVB)" },
      gstin: { type: String, default: "24AAACB1234F1Z5" },
      pan: { type: String, default: "AAACB1234F" },
      cin: { type: String, default: "U17299GJ2024PTC150241" },
      address: {
        type: String,
        default: "Plot 42, Mill Gate Industrial Hub, Ring Road, Surat, Gujarat 395002",
      },
      state: { type: String, default: "Gujarat" },
      stateCode: { type: String, default: "24" },
      phone: { type: String, default: "+91 98765 43210" },
      email: { type: String, default: "billing@buddyvsbuff.com" },
      bankDetails: {
        bankName: { type: String, default: "HDFC Bank Ltd." },
        accountName: { type: String, default: "Buddy Vs Buff Private Limited" },
        accountNumber: { type: String, default: "50200012345678" },
        ifscCode: { type: String, default: "HDFC0001234" },
        branch: { type: String, default: "Ring Road Textile Hub, Surat" },
        upiId: { type: String, default: "buddyvsbuff@hdfcbank" },
      },
    },
    buyerDetails: {
      businessName: { type: String, required: true },
      contactName: { type: String, default: "" },
      gstin: { type: String, default: "" },
      pan: { type: String, default: "" },
      phone: { type: String, default: "" },
      email: { type: String, default: "" },
      billingAddress: {
        street: { type: String, default: "" },
        city: { type: String, default: "" },
        state: { type: String, default: "" },
        pincode: { type: String, default: "" },
        country: { type: String, default: "India" },
      },
      shippingAddress: {
        street: { type: String, default: "" },
        city: { type: String, default: "" },
        state: { type: String, default: "" },
        pincode: { type: String, default: "" },
        country: { type: String, default: "India" },
      },
      placeOfSupply: { type: String, required: true }, // e.g. "Maharashtra (27)"
      placeOfSupplyCode: { type: String, default: "" },
      isInterState: { type: Boolean, default: true },
    },
    items: [invoiceItemSchema],
    totals: {
      taxableSubtotal: { type: Number, required: true },
      discountTotal: { type: Number, default: 0 },
      cgstTotal: { type: Number, default: 0 },
      sgstTotal: { type: Number, default: 0 },
      igstTotal: { type: Number, default: 0 },
      totalTax: { type: Number, required: true },
      freightCost: { type: Number, default: 0 },
      roundOff: { type: Number, default: 0 },
      grandTotal: { type: Number, required: true },
      amountInWords: { type: String, required: true },
    },
    paymentDetails: {
      paymentStatus: {
        type: String,
        enum: ["unpaid", "partially_paid", "paid", "overdue", "cancelled"],
        default: "unpaid",
        index: true,
      },
      paymentMethod: {
        type: String,
        default: "razorpay", // 'razorpay', 'bank_transfer', 'upi', 'cod', 'credit'
      },
      paymentTerms: {
        type: String,
        default: "Prepaid", // 'Prepaid', 'Net 15', 'Net 30', 'COD'
      },
      dueDate: {
        type: Date,
      },
      paidAt: {
        type: Date,
      },
      amountPaid: {
        type: Number,
        default: 0,
      },
      outstandingAmount: {
        type: Number,
        default: 0,
      },
    },
    status: {
      type: String,
      enum: ["draft", "issued", "partially_paid", "paid", "overdue", "cancelled"],
      default: "issued",
      index: true,
    },
    issuedAt: {
      type: Date,
      default: Date.now,
    },
    cancelledAt: {
      type: Date,
    },
    cancellationReason: {
      type: String,
      default: "",
    },
    notes: {
      type: String,
      default: "Computer generated GST Tax Invoice. No signature required.",
    },
    termsAndConditions: {
      type: String,
      default:
        "1. Goods once sold will not be accepted back without prior RMA authorization. 2. Interest @ 18% p.a. will be charged if payment is not received within due date. 3. All disputes subject to Surat jurisdiction only.",
    },
    pdfUrl: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Invoice", invoiceSchema);
