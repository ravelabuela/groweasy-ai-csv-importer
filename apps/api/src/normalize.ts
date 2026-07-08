import { allowedDataSources, allowedStatuses, crmFields, type CrmRecord, type RawRecord } from "./types.js";

const emptyRecord = Object.fromEntries(crmFields.map((field) => [field, ""])) as CrmRecord;

export function normalizeRecord(record: Partial<CrmRecord>): CrmRecord {
  const normalized = { ...emptyRecord };

  for (const field of crmFields) {
    const raw = record[field];
    normalized[field] = typeof raw === "string" ? cleanCell(raw) : "";
  }

  if (!allowedStatuses.includes(normalized.crm_status as (typeof allowedStatuses)[number])) {
    normalized.crm_status = "";
  }

  if (!allowedDataSources.includes(normalized.data_source as (typeof allowedDataSources)[number])) {
    normalized.data_source = "";
  }

  if (normalized.created_at && Number.isNaN(new Date(normalized.created_at).getTime())) {
    normalized.crm_note = appendNote(normalized.crm_note, `Unparseable original date: ${normalized.created_at}`);
    normalized.created_at = "";
  }

  const { firstEmail, extraEmails } = splitEmails(normalized.email);
  normalized.email = firstEmail;
  if (extraEmails.length) {
    normalized.crm_note = appendNote(normalized.crm_note, `Extra emails: ${extraEmails.join(", ")}`);
  }

  const phoneParts = splitPhone(normalized.country_code, normalized.mobile_without_country_code);
  normalized.country_code = phoneParts.countryCode;
  normalized.mobile_without_country_code = phoneParts.mobile;
  if (phoneParts.extraPhones.length) {
    normalized.crm_note = appendNote(normalized.crm_note, `Extra phone numbers: ${phoneParts.extraPhones.join(", ")}`);
  }

  return normalized;
}

export function hasContact(record: CrmRecord): boolean {
  return Boolean(record.email || record.mobile_without_country_code);
}

export function cleanCell(value: string): string {
  return value.replace(/\r?\n/g, "\\n").replace(/\s+/g, " ").trim();
}

export function appendNote(existing: string, addition: string): string {
  return [existing, addition].filter(Boolean).join(" | ");
}

export function collectSourceText(row: RawRecord): string {
  return Object.entries(row)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}: ${value}`)
    .join(" | ");
}

function splitEmails(value: string): { firstEmail: string; extraEmails: string[] } {
  const emails = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  return {
    firstEmail: emails[0] ?? value,
    extraEmails: emails.slice(1)
  };
}

function splitPhone(countryCode: string, mobile: string) {
  const combined = [countryCode, mobile].filter(Boolean).join(" ");
  const matches = combined.match(/\+?\d[\d\s().-]{6,}\d/g) ?? [];
  const first = matches[0] ?? mobile;
  const digits = first.replace(/\D/g, "");
  const guessedCountry = first.trim().startsWith("+") ? `+${digits.slice(0, Math.max(1, digits.length - 10))}` : countryCode;
  const guessedMobile = digits.length > 10 ? digits.slice(-10) : digits;

  return {
    countryCode: guessedCountry || countryCode,
    mobile: guessedMobile || mobile.replace(/\D/g, ""),
    extraPhones: matches.slice(1)
  };
}
