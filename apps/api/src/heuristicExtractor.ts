import { appendNote, cleanCell, collectSourceText, normalizeRecord } from "./normalize.js";
import type { CrmRecord, RawRecord } from "./types.js";

const fieldAliases: Partial<Record<keyof CrmRecord, string[]>> = {
  created_at: ["created", "date", "submitted", "timestamp", "lead date", "created time", "received", "enquired"],
  name: ["name", "full name", "customer", "client", "contact person"],
  email: ["email", "e-mail", "mail"],
  country_code: ["country code", "dial code", "isd"],
  mobile_without_country_code: ["phone", "mobile", "whatsapp", "contact", "number", "telephone", "cell"],
  company: ["company", "organization", "business", "firm"],
  city: ["city", "location", "area", "locality"],
  state: ["state", "province", "region"],
  country: ["country", "nation"],
  lead_owner: ["owner", "assigned", "salesperson", "agent"],
  crm_status: ["status", "stage", "disposition"],
  crm_note: ["note", "remark", "comment", "feedback", "message", "comments"],
  data_source: ["source", "campaign", "project", "adset", "property"],
  possession_time: ["possession", "handover", "move in"],
  description: ["description", "requirement", "query", "details"]
};

export function heuristicExtract(rows: RawRecord[]): CrmRecord[] {
  return rows.map((row) => normalizeRecord(extractRow(row)));
}

function extractRow(row: RawRecord): Partial<CrmRecord> {
  const record: Partial<CrmRecord> = {};
  const entries = Object.entries(row);

  for (const [field, aliases] of Object.entries(fieldAliases) as [keyof CrmRecord, string[]][]) {
    const match = entries.find(([key]) => aliases.some((alias) => normalizeKey(key).includes(alias)));
    if (match) record[field] = cleanCell(match[1]);
  }

  const sourceText = collectSourceText(row);
  const contactSearchText = collectContactSearchText(row);
  record.email ||= findLikelyValue(row, ["email", "e-mail", "mail"]);
  if (!record.email) {
    record.email = contactSearchText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
  }

  const firstName = findLikelyValue(row, ["first name", "firstname"]);
  const lastName = findLikelyValue(row, ["last name", "lastname", "surname"]);
  const combinedName = [firstName, lastName].filter(Boolean).join(" ");
  if (combinedName && (!record.name || record.name === firstName || record.name === lastName)) {
    record.name = combinedName;
  }

  const phoneText = findLikelyValue(row, ["phone", "mobile", "whatsapp", "telephone", "contact", "cell"]) || contactSearchText;
  const phoneMatch = phoneText.match(/\+?\d[\d\s().-]{6,}\d/);
  if (phoneMatch && !record.mobile_without_country_code) {
    record.mobile_without_country_code = phoneMatch[0];
  }
  record.crm_status = mapStatus(record.crm_status || sourceText);
  record.data_source = mapDataSource(record.data_source || sourceText);

  const usedValues = new Set(Object.values(record).filter(Boolean));
  const leftovers = entries
    .filter(([, value]) => value && !usedValues.has(value))
    .map(([key, value]) => `${key}: ${value}`);

  if (leftovers.length) {
    record.crm_note = appendNote(record.crm_note ?? "", leftovers.join("; "));
  }

  return record;
}

function collectContactSearchText(row: RawRecord): string {
  return Object.entries(row)
    .filter(([key, value]) => value && !isNonContactKey(key))
    .map(([key, value]) => `${key}: ${value}`)
    .join(" | ");
}

function isNonContactKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return /owner|assigned|salesperson|agent|created|date|timestamp|time/.test(normalized);
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, " ").trim();
}

function findLikelyValue(row: RawRecord, aliases: string[]): string {
  const match = Object.entries(row).find(([key]) => aliases.some((alias) => normalizeKey(key).includes(alias)));
  return match?.[1] ?? "";
}

function mapStatus(value: string): CrmRecord["crm_status"] {
  const text = value.toLowerCase();
  if (/sold|closed|won|booked|converted|deal/.test(text)) return "SALE_DONE";
  if (/bad|invalid|not interested|junk|lost|spam/.test(text)) return "BAD_LEAD";
  if (/busy|no answer|did not|didn't|not connect|unreachable|callback/.test(text)) return "DID_NOT_CONNECT";
  if (/follow|good|hot|warm|interested|qualified/.test(text)) return "GOOD_LEAD_FOLLOW_UP";
  return "";
}

function mapDataSource(value: string): CrmRecord["data_source"] {
  const text = value.toLowerCase().replace(/[\s-]+/g, "_");
  if (text.includes("leads_on_demand")) return "leads_on_demand";
  if (text.includes("meridian")) return "meridian_tower";
  if (text.includes("eden")) return "eden_park";
  if (text.includes("varah")) return "varah_swamy";
  if (text.includes("sarjapur")) return "sarjapur_plots";
  return "";
}


