import Papa from "papaparse";
import type { RawRecord } from "./types.js";

export function parseCsv(buffer: Buffer): RawRecord[] {
  const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
  const parsed = Papa.parse<RawRecord>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
    transform: (value) => String(value ?? "").trim()
  });

  if (parsed.errors.length > 0) {
    const firstError = parsed.errors[0];
    throw new Error(`CSV parse error on row ${firstError.row ?? "unknown"}: ${firstError.message}`);
  }

  const rows = parsed.data.filter((row) => Object.values(row).some(Boolean));
  if (!rows.length) {
    throw new Error("CSV file does not contain any data rows.");
  }

  return rows;
}
