const Invoice = require("../Model/InvoiceModel");
const Order = require("../Model/OrderModel");
const User = require("../Model/UserModel");
const {
  createInvoiceForOrder,
  generateNextInvoiceNumber,
  getCurrentFinancialYear,
  numberToIndianWords,
} = require("../Services/invoiceService");

/**
 * GET /api/invoices
 * Retailer's personal invoice vault ("My Invoices")
 */
const getUserInvoices = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Authentication required." });
    }

    const { status, search } = req.query;
    const filter = { buyerId: userId };

    if (status && status !== "ALL") {
      filter.status = status.toLowerCase();
    }

    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { invoiceNumber: { $regex: q, $options: "i" } },
        { orderId: { $regex: q, $options: "i" } },
        { "items.productName": { $regex: q, $options: "i" } },
      ];
    }

    const invoices = await Invoice.find(filter).sort({ createdAt: -1 });

    // Calculate quick retailer stats
    let totalInvoiced = 0;
    let totalOutstanding = 0;
    invoices.forEach((inv) => {
      if (inv.status !== "cancelled") {
        totalInvoiced += inv.totals?.grandTotal || 0;
        if (inv.paymentDetails?.paymentStatus === "unpaid" || inv.paymentDetails?.paymentStatus === "overdue") {
          totalOutstanding += inv.paymentDetails?.outstandingAmount || inv.totals?.grandTotal || 0;
        }
      }
    });

    return res.status(200).json({
      success: true,
      invoices,
      count: invoices.length,
      stats: {
        totalInvoiced,
        totalOutstanding,
      },
    });
  } catch (error) {
    console.error("[getUserInvoices] Error:", error);
    return res.status(500).json({ success: false, message: "Failed to load invoices." });
  }
};

/**
 * GET /api/invoices/:id
 * Retrieve single invoice
 */
const getInvoiceById = async (req, res) => {
  try {
    const { id } = req.params;
    const invoice = await Invoice.findOne({
      $or: [{ _id: /^[0-9a-fA-F]{24}$/.test(id) ? id : null }, { invoiceNumber: id }],
    }).populate("orderRef");

    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice document not found." });
    }

    // Permission check: must be owner or admin
    const userId = req.user?._id ? String(req.user._id) : null;
    const isAdmin = Boolean(req.admin);

    if (!isAdmin && userId && String(invoice.buyerId) !== userId) {
      return res.status(403).json({ success: false, message: "Access unauthorized for this tax document." });
    }

    return res.status(200).json({ success: true, invoice });
  } catch (error) {
    console.error("[getInvoiceById] Error:", error);
    return res.status(500).json({ success: false, message: "Error fetching invoice." });
  }
};

/**
 * GET /api/invoices/order/:orderId
 * Get invoice for an order (or auto-generate if missing)
 */
const getInvoiceByOrderId = async (req, res) => {
  try {
    const { orderId } = req.params;
    let invoice = await Invoice.findOne({
      orderId,
      status: { $ne: "cancelled" },
    });

    if (!invoice) {
      // If order exists, try auto-generating invoice
      const order = await Order.findOne({ orderId }).populate("userId");
      if (order) {
        invoice = await createInvoiceForOrder(order);
      }
    }

    if (!invoice) {
      return res.status(404).json({ success: false, message: "No invoice found for order " + orderId });
    }

    return res.status(200).json({ success: true, invoice });
  } catch (error) {
    console.error("[getInvoiceByOrderId] Error:", error);
    return res.status(500).json({ success: false, message: "Error finding order invoice." });
  }
};

/**
 * GET /api/invoices/admin/all
 * Admin list with filters & stats
 */
const getAdminInvoices = async (req, res) => {
  try {
    const { status, financialYear, type, search, startDate, endDate, page = 1, limit = 50 } = req.query;

    const filter = {};

    if (status && status !== "ALL") {
      filter.status = status.toLowerCase();
    }
    if (financialYear && financialYear !== "ALL") {
      filter.financialYear = financialYear;
    }
    if (type && type !== "ALL") {
      filter.type = type;
    }
    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { invoiceNumber: { $regex: q, $options: "i" } },
        { orderId: { $regex: q, $options: "i" } },
        { "buyerDetails.businessName": { $regex: q, $options: "i" } },
        { "buyerDetails.gstin": { $regex: q, $options: "i" } },
      ];
    }
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [invoices, total] = await Promise.all([
      Invoice.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Invoice.countDocuments(filter),
    ]);

    // Financial aggregates
    const allMatching = await Invoice.find(filter).select("totals status type paymentDetails");
    let grossRevenue = 0;
    let totalTaxCollected = 0;
    let totalOutstanding = 0;
    let totalCreditNotes = 0;

    allMatching.forEach((inv) => {
      if (inv.status !== "cancelled") {
        if (inv.type === "credit_note") {
          totalCreditNotes += inv.totals?.grandTotal || 0;
        } else {
          grossRevenue += inv.totals?.grandTotal || 0;
          totalTaxCollected += inv.totals?.totalTax || 0;
          if (inv.paymentDetails?.paymentStatus === "unpaid" || inv.paymentDetails?.paymentStatus === "overdue") {
            totalOutstanding += inv.paymentDetails?.outstandingAmount || inv.totals?.grandTotal || 0;
          }
        }
      }
    });

    return res.status(200).json({
      success: true,
      invoices,
      total,
      stats: {
        grossRevenue,
        totalTaxCollected,
        totalOutstanding,
        totalCreditNotes,
        invoiceCount: total,
      },
    });
  } catch (error) {
    console.error("[getAdminInvoices] Error:", error);
    return res.status(500).json({ success: false, message: "Failed to retrieve invoice ledger." });
  }
};

/**
 * POST /api/invoices/admin/generate
 * Admin manual generation trigger for order
 */
const generateInvoiceManually = async (req, res) => {
  try {
    const { orderId, shipmentId, overridePaymentStatus, adminNotes } = req.body;
    if (!orderId) {
      return res.status(400).json({ success: false, message: "Order ID is required." });
    }

    const order = await Order.findOne({
      $or: [{ _id: /^[0-9a-fA-F]{24}$/.test(orderId) ? orderId : null }, { orderId }],
    }).populate("userId");

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }

    const invoice = await createInvoiceForOrder(order, {
      shipmentId,
      overridePaymentStatus,
      adminNotes,
    });

    return res.status(200).json({
      success: true,
      message: `Tax Invoice ${invoice.invoiceNumber} generated successfully.`,
      invoice,
    });
  } catch (error) {
    console.error("[generateInvoiceManually] Error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to generate invoice." });
  }
};

/**
 * POST /api/invoices/admin/:id/credit-note
 * Issue formal GST Credit Note against cancelled/returned invoice
 */
const issueCreditNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = "Return / Cancellation", notes = "" } = req.body;

    const originalInvoice = await Invoice.findOne({
      $or: [{ _id: /^[0-9a-fA-F]{24}$/.test(id) ? id : null }, { invoiceNumber: id }],
    });

    if (!originalInvoice) {
      return res.status(404).json({ success: false, message: "Original invoice not found." });
    }

    if (originalInvoice.type === "credit_note") {
      return res.status(400).json({ success: false, message: "Cannot issue credit note against another credit note." });
    }

    const cnNumber = await generateNextInvoiceNumber("CN", "credit_note");
    const fy = getCurrentFinancialYear();

    const creditNote = new Invoice({
      invoiceNumber: cnNumber,
      financialYear: fy,
      orderId: originalInvoice.orderId,
      orderRef: originalInvoice.orderRef,
      buyerId: originalInvoice.buyerId,
      type: "credit_note",
      creditNoteReference: originalInvoice.invoiceNumber,
      creditNoteReason: reason,
      sellerDetails: originalInvoice.sellerDetails,
      buyerDetails: originalInvoice.buyerDetails,
      items: originalInvoice.items,
      totals: originalInvoice.totals,
      paymentDetails: {
        paymentStatus: "paid", // Credited back
        paymentMethod: originalInvoice.paymentDetails?.paymentMethod || "credit",
        paymentTerms: "Immediate Credit",
        paidAt: new Date(),
        amountPaid: originalInvoice.totals?.grandTotal || 0,
        outstandingAmount: 0,
      },
      status: "issued",
      notes: notes || `Credit Note issued against invoice ${originalInvoice.invoiceNumber} for reason: ${reason}`,
    });

    await creditNote.save();

    // Mark original invoice as cancelled/adjusted
    originalInvoice.status = "cancelled";
    originalInvoice.cancelledAt = new Date();
    originalInvoice.cancellationReason = `Credit Note ${cnNumber} issued: ${reason}`;
    await originalInvoice.save();

    return res.status(201).json({
      success: true,
      message: `GST Credit Note ${cnNumber} generated and original invoice marked cancelled.`,
      creditNote,
      originalInvoice,
    });
  } catch (error) {
    console.error("[issueCreditNote] Error:", error);
    return res.status(500).json({ success: false, message: "Failed to generate credit note." });
  }
};

/**
 * PATCH /api/invoices/admin/:id/status
 * Update status & payment reconciliation
 */
const updateInvoiceStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, paymentStatus, amountPaid, notes } = req.body;

    const invoice = await Invoice.findOne({
      $or: [{ _id: /^[0-9a-fA-F]{24}$/.test(id) ? id : null }, { invoiceNumber: id }],
    });

    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found." });
    }

    if (status) invoice.status = status;
    if (paymentStatus) {
      invoice.paymentDetails.paymentStatus = paymentStatus;
      if (paymentStatus === "paid") {
        invoice.paymentDetails.paidAt = new Date();
        invoice.paymentDetails.amountPaid = invoice.totals.grandTotal;
        invoice.paymentDetails.outstandingAmount = 0;
        invoice.status = "paid";
      }
    }

    if (amountPaid !== undefined) {
      const paid = Number(amountPaid) || 0;
      invoice.paymentDetails.amountPaid = paid;
      invoice.paymentDetails.outstandingAmount = Math.max(0, invoice.totals.grandTotal - paid);
      if (invoice.paymentDetails.outstandingAmount === 0) {
        invoice.paymentDetails.paymentStatus = "paid";
        invoice.status = "paid";
      } else if (paid > 0) {
        invoice.paymentDetails.paymentStatus = "partially_paid";
        invoice.status = "partially_paid";
      }
    }

    if (notes) invoice.notes = notes;

    await invoice.save();
    return res.status(200).json({ success: true, message: "Invoice status updated.", invoice });
  } catch (error) {
    console.error("[updateInvoiceStatus] Error:", error);
    return res.status(500).json({ success: false, message: "Failed to update invoice status." });
  }
};

/**
 * GET /api/invoices/admin/gst-report
 * Exports GSTR-1 format JSON/CSV for filing
 */
const exportGstReport = async (req, res) => {
  try {
    const { financialYear, format = "json" } = req.query;
    const fy = financialYear || getCurrentFinancialYear();

    const invoices = await Invoice.find({
      financialYear: fy,
      status: { $ne: "cancelled" },
    }).sort({ issuedAt: 1 });

    const gstr1Rows = invoices.map((inv) => ({
      gstin: inv.buyerDetails?.gstin || "URP", // URP = Unregistered Person
      receiverName: inv.buyerDetails?.businessName || "",
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.issuedAt ? inv.issuedAt.toISOString().split("T")[0] : "",
      invoiceValue: inv.totals?.grandTotal || 0,
      placeOfSupply: inv.buyerDetails?.placeOfSupply || "24-Gujarat",
      reverseCharge: "N",
      invoiceType: inv.type === "credit_note" ? "C" : "R", // C: Credit, R: Regular B2B
      rate: inv.items?.[0]?.gstRate ? inv.items[0].gstRate * 100 : 5,
      taxableValue: inv.totals?.taxableSubtotal || 0,
      cessAmount: 0,
      cgst: inv.totals?.cgstTotal || 0,
      sgst: inv.totals?.sgstTotal || 0,
      igst: inv.totals?.igstTotal || 0,
    }));

    if (format === "csv") {
      const headers = [
        "GSTIN/UIN of Recipient",
        "Receiver Name",
        "Invoice Number",
        "Invoice Date",
        "Invoice Value",
        "Place Of Supply",
        "Reverse Charge",
        "Invoice Type",
        "Tax Rate %",
        "Taxable Value (INR)",
        "CGST (INR)",
        "SGST (INR)",
        "IGST (INR)",
        "Cess (INR)",
      ];

      const csvLines = [headers.join(",")];
      gstr1Rows.forEach((r) => {
        csvLines.push(
          [
            `"${r.gstin}"`,
            `"${r.receiverName.replace(/"/g, '""')}"`,
            `"${r.invoiceNumber}"`,
            `"${r.invoiceDate}"`,
            r.invoiceValue,
            `"${r.placeOfSupply}"`,
            r.reverseCharge,
            r.invoiceType,
            r.rate,
            r.taxableValue,
            r.cgst,
            r.sgst,
            r.igst,
            r.cessAmount,
          ].join(",")
        );
      });

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=GSTR-1-BVB-${fy}.csv`);
      return res.status(200).send(csvLines.join("\n"));
    }

    return res.status(200).json({
      success: true,
      financialYear: fy,
      count: gstr1Rows.length,
      records: gstr1Rows,
    });
  } catch (error) {
    console.error("[exportGstReport] Error:", error);
    return res.status(500).json({ success: false, message: "Error generating GSTR-1 export." });
  }
};

module.exports = {
  getUserInvoices,
  getInvoiceById,
  getInvoiceByOrderId,
  getAdminInvoices,
  generateInvoiceManually,
  issueCreditNote,
  updateInvoiceStatus,
  exportGstReport,
};
