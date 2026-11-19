const zlib = require("zlib");

/**
 * Decode basic XML entities
 */
const decodeXml = (str = "") =>
  String(str)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");

/**
 * Parse a single CSV line honoring quoted fields and escaped quotes
 */
const parseCsvLine = (line, delimiter = ",") => {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
};

/**
 * Parse CSV/TSV text buffer into array of keyed row objects
 */
const parseCsvBuffer = (buffer) => {
  const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return [];

  // Detect delimiter (comma vs tab vs semicolon)
  const headerLine = lines[0];
  const delimiter =
    headerLine.includes("\t")
      ? "\t"
      : headerLine.split(";").length > headerLine.split(",").length
      ? ";"
      : ",";

  const headers = parseCsvLine(headerLine, delimiter).map((h) =>
    h.toLowerCase().replace(/[^a-z0-9]/g, "")
  );

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i], delimiter);
    if (cols.every((c) => !c)) continue;
    const obj = {};
    headers.forEach((key, idx) => {
      if (key) obj[key] = cols[idx] !== undefined ? cols[idx] : "";
    });
    rows.push(obj);
  }
  return rows;
};

/**
 * Minimal ZIP entry extractor for .xlsx buffers (supports STORE & DEFLATE)
 */
const extractZipEntries = (buf) => {
  const entries = {};
  // Find End of Central Directory record (0x06054b50)
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error("Invalid XLSX archive: EOCD header not found.");
  }

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const centralDirOffset = buf.readUInt32LE(eocdOffset + 16);

  let offset = centralDirOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) break;

    const compressionMethod = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const fileNameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localHeaderOffset = buf.readUInt32LE(offset + 42);

    const fileName = buf
      .subarray(offset + 46, offset + 46 + fileNameLen)
      .toString("utf8");

    offset += 46 + fileNameLen + extraLen + commentLen;

    // Read local file header to locate compressed payload
    const localNameLen = buf.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const rawData = buf.subarray(dataStart, dataStart + compressedSize);

    if (compressionMethod === 0) {
      entries[fileName] = rawData;
    } else if (compressionMethod === 8) {
      entries[fileName] = zlib.inflateRawSync(rawData);
    }
  }

  return entries;
};

/**
 * Convert Excel column letters (A, B, ..., AA) to 0-based column index
 */
const colLettersToIndex = (letters) => {
  let idx = 0;
  for (let i = 0; i < letters.length; i++) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return idx - 1;
};

/**
 * Parse .xlsx Excel file buffer into array of keyed row objects
 */
const parseXlsxBuffer = (buffer) => {
  const entries = extractZipEntries(buffer);

  // 1. Parse shared strings if present
  const sharedStrings = [];
  if (entries["xl/sharedStrings.xml"]) {
    const ssXml = entries["xl/sharedStrings.xml"].toString("utf8");
    const siMatches = ssXml.match(/<si\b[^>]*>[\s\S]*?<\/si>/g) || [];
    for (const si of siMatches) {
      const tMatches = si.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) || [];
      const combined = tMatches
        .map((t) => decodeXml(t.replace(/<t\b[^>]*>/, "").replace(/<\/t>$/, "")))
        .join("");
      sharedStrings.push(combined);
    }
  }

  // 2. Find first worksheet XML
  const sheetKey =
    entries["xl/worksheets/sheet1.xml"]
      ? "xl/worksheets/sheet1.xml"
      : Object.keys(entries).find(
          (k) => k.startsWith("xl/worksheets/sheet") && k.endsWith(".xml")
        );

  if (!sheetKey) {
    throw new Error("No worksheet found inside XLSX file.");
  }

  const sheetXml = entries[sheetKey].toString("utf8");
  const rowMatches = sheetXml.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) || [];
  const matrix = [];

  for (const rowXml of rowMatches) {
    const rowArr = [];
    const cellMatches = rowXml.match(/<c\b[^>]*>[\s\S]*?<\/c>/g) || [];
    for (const cellXml of cellMatches) {
      const refMatch = cellXml.match(/\br="([A-Z]+)\d+"/);
      const typeMatch = cellXml.match(/\bt="([^"]+)"/);
      const colIdx = refMatch ? colLettersToIndex(refMatch[1]) : rowArr.length;
      const cellType = typeMatch ? typeMatch[1] : "";

      let value = "";
      if (cellType === "inlineStr") {
        const tMatch = cellXml.match(/<t\b[^>]*>([\s\S]*?)<\/t>/);
        value = tMatch ? decodeXml(tMatch[1]) : "";
      } else {
        const vMatch = cellXml.match(/<v>([\s\S]*?)<\/v>/);
        const rawVal = vMatch ? decodeXml(vMatch[1]) : "";
        if (cellType === "s") {
          value = sharedStrings[parseInt(rawVal, 10)] ?? "";
        } else {
          value = rawVal;
        }
      }
      rowArr[colIdx] = String(value).trim();
    }
    if (rowArr.some((v) => v && v.length > 0)) {
      matrix.push(rowArr);
    }
  }

  if (matrix.length < 2) return [];

  const headers = matrix[0].map((h) =>
    String(h || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
  );

  const rows = [];
  for (let r = 1; r < matrix.length; r++) {
    const cols = matrix[r];
    if (!cols || cols.every((c) => !c)) continue;
    const obj = {};
    headers.forEach((key, idx) => {
      if (key) obj[key] = cols[idx] !== undefined ? cols[idx] : "";
    });
    rows.push(obj);
  }
  return rows;
};

/**
 * Normalize parsed rows into inward items: { skuId, qty, poNumber, warehouseCode, reorderLevel, reason }
 */
const parseBulkInwardFile = (buffer, originalFilename = "") => {
  const isZipXlsx =
    originalFilename.toLowerCase().endsWith(".xlsx") ||
    (buffer.length >= 4 &&
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      buffer[2] === 0x03 &&
      buffer[3] === 0x04);

  const rawRows = isZipXlsx ? parseXlsxBuffer(buffer) : parseCsvBuffer(buffer);

  return rawRows.map((row, index) => {
    const skuId = (
      row.skuid ||
      row.sku ||
      row.skucode ||
      row.itemsku ||
      ""
    )
      .toString()
      .trim()
      .toUpperCase();

    const qtyRaw =
      row.qty ??
      row.quantity ??
      row.inwardqty ??
      row.stock ??
      row.pcs ??
      row.units ??
      "";
    const qty = parseInt(qtyRaw, 10);

    const poNumber = (
      row.ponumber ||
      row.po ||
      row.refid ||
      row.reference ||
      row.challan ||
      ""
    )
      .toString()
      .trim();

    const warehouseCode = (
      row.warehousecode ||
      row.warehouse ||
      row.hub ||
      ""
    )
      .toString()
      .trim()
      .toUpperCase();

    const reorderRaw = row.reorderlevel ?? row.reorder ?? row.minstock;
    const reorderLevel =
      reorderRaw !== undefined && reorderRaw !== "" && !isNaN(Number(reorderRaw))
        ? Math.max(0, parseInt(reorderRaw, 10))
        : undefined;

    const reason = (row.reason || row.notes || row.remarks || "").toString().trim();

    return {
      rowNumber: index + 2,
      skuId,
      qty,
      poNumber,
      warehouseCode,
      reorderLevel,
      reason,
    };
  });
};

module.exports = {
  parseCsvBuffer,
  parseXlsxBuffer,
  parseBulkInwardFile,
};
