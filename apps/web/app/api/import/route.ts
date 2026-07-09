import Papa from "papaparse";
import { NextResponse } from "next/server";

type RawRecord = Record<string, string>;
type CrmRecord = Record<(typeof crmFields)[number], string>;

const crmFields = [
  "created_at",
  "name",
  "email",
  "country_code",
  "mobile_without_country_code",
  "company",
  "city",
  "state",
  "country",
  "lead_owner",
  "crm_status",
  "crm_note",
  "data_source",
  "possession_time",
  "description"
] as const;

const allowedStatuses = ["GOOD_LEAD_FOLLOW_UP", "DID_NOT_CONNECT", "BAD_LEAD", "SALE_DONE"] as const;
const allowedDataSources = ["leads_on_demand", "meridian_tower", "eden_park", "varah_swamy", "sarjapur_plots"] as const;

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

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "CSV file is required under form field 'file'." }, { status: 400 });
    }

    const rows = parseCsv(await file.text());
    const records = await extractRows(rows);
    const skipped: { index: number; reason: string; original: RawRecord }[] = [];
    const imported = records.filter((record, index) => {
      if (record.email || record.mobile_without_country_code) return true;
      skipped.push({ index, reason: "Missing both email and mobile number", original: rows[index] ?? {} });
      return false;
    });

    return NextResponse.json({
      records: imported,
      skipped,
      totalImported: imported.length,
      totalSkipped: skipped.length,
      aiProvider: process.env.OPENAI_API_KEY ? "openai" : "heuristic"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function parseCsv(text: string): RawRecord[] {
  const parsed = Papa.parse<RawRecord>(text.replace(/^\uFEFF/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
    transform: (value) => String(value ?? "").trim()
  });

  if (parsed.errors.length) {
    const firstError = parsed.errors[0];
    throw new Error(`CSV parse error on row ${firstError.row ?? "unknown"}: ${firstError.message}`);
  }

  const rows = parsed.data.filter((row) => Object.values(row).some(Boolean));
  if (!rows.length) throw new Error("CSV file does not contain any data rows.");
  return rows;
}

async function extractRows(rows: RawRecord[]): Promise<CrmRecord[]> {
  if (!process.env.OPENAI_API_KEY) return rows.map((row) => normalizeRecord(extractRow(row)));

  try {
    const records = await callOpenAI(rows);
    if (records.length !== rows.length) throw new Error("AI returned a mismatched number of records");
    return records;
  } catch {
    return rows.map((row) => normalizeRecord(extractRow(row)));
  }
}

async function callOpenAI(rows: RawRecord[]): Promise<CrmRecord[]> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "Convert messy CSV lead records into GrowEasy CRM JSON.",
            "Return only JSON with a records array.",
            `Each record must contain exactly these string fields: ${crmFields.join(", ")}.`,
            "Allowed crm_status values: GOOD_LEAD_FOLLOW_UP, DID_NOT_CONNECT, BAD_LEAD, SALE_DONE. Leave blank if unclear.",
            "Allowed data_source values: leads_on_demand, meridian_tower, eden_park, varah_swamy, sarjapur_plots. Leave blank if unclear.",
            "Use first email and first mobile. Put extra contacts and remarks into crm_note. Skip nothing. Escape line breaks as \\n."
          ].join(" ")
        },
        { role: "user", content: JSON.stringify(rows) }
      ]
    })
  });

  if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
  const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const parsed = JSON.parse(payload.choices?.[0]?.message?.content ?? "{}") as { records?: Partial<CrmRecord>[] };
  if (!Array.isArray(parsed.records)) throw new Error("OpenAI response did not include records[]");
  return parsed.records.map(normalizeRecord);
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
  if (!record.email) record.email = contactSearchText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";

  const firstName = findLikelyValue(row, ["first name", "firstname"]);
  const lastName = findLikelyValue(row, ["last name", "lastname", "surname"]);
  const combinedName = [firstName, lastName].filter(Boolean).join(" ");
  if (combinedName && (!record.name || record.name === firstName || record.name === lastName)) record.name = combinedName;

  const phoneText = findLikelyValue(row, ["phone", "mobile", "whatsapp", "telephone", "contact", "cell"]) || contactSearchText;
  const phoneMatch = phoneText.match(/\+?\d[\d\s().-]{6,}\d/);
  if (phoneMatch && !record.mobile_without_country_code) record.mobile_without_country_code = phoneMatch[0];

  record.crm_status = mapStatus(record.crm_status || sourceText);
  record.data_source = mapDataSource(record.data_source || sourceText);

  const usedValues = new Set(Object.values(record).filter(Boolean));
  const leftovers = entries.filter(([, value]) => value && !usedValues.has(value)).map(([key, value]) => `${key}: ${value}`);
  if (leftovers.length) record.crm_note = appendNote(record.crm_note ?? "", leftovers.join("; "));
  return record;
}

function normalizeRecord(record: Partial<CrmRecord>): CrmRecord {
  const normalized = Object.fromEntries(crmFields.map((field) => [field, cleanCell(record[field] ?? "")])) as CrmRecord;
  if (!allowedStatuses.includes(normalized.crm_status as (typeof allowedStatuses)[number])) normalized.crm_status = "";
  if (!allowedDataSources.includes(normalized.data_source as (typeof allowedDataSources)[number])) normalized.data_source = "";
  if (normalized.created_at && Number.isNaN(new Date(normalized.created_at).getTime())) {
    normalized.crm_note = appendNote(normalized.crm_note, `Unparseable original date: ${normalized.created_at}`);
    normalized.created_at = "";
  }

  const emails = normalized.email.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  if (emails.length) {
    normalized.email = emails[0] ?? "";
    if (emails.length > 1) normalized.crm_note = appendNote(normalized.crm_note, `Extra emails: ${emails.slice(1).join(", ")}`);
  }

  const phoneParts = splitPhone(normalized.country_code, normalized.mobile_without_country_code);
  normalized.country_code = phoneParts.countryCode;
  normalized.mobile_without_country_code = phoneParts.mobile;
  if (phoneParts.extraPhones.length) normalized.crm_note = appendNote(normalized.crm_note, `Extra phone numbers: ${phoneParts.extraPhones.join(", ")}`);
  return normalized;
}

function splitPhone(countryCode: string, mobile: string) {
  const combined = [countryCode, mobile].filter(Boolean).join(" ");
  const matches = combined.match(/\+?\d[\d\s().-]{6,}\d/g) ?? [];
  const first = matches[0] ?? mobile;
  const digits = first.replace(/\D/g, "");
  const guessedCountry = first.trim().startsWith("+") ? `+${digits.slice(0, Math.max(1, digits.length - 10))}` : countryCode;
  return { countryCode: guessedCountry || countryCode, mobile: digits.length > 10 ? digits.slice(-10) : digits, extraPhones: matches.slice(1) };
}

function collectSourceText(row: RawRecord): string {
  return Object.entries(row).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`).join(" | ");
}

function collectContactSearchText(row: RawRecord): string {
  return Object.entries(row).filter(([key, value]) => value && !isNonContactKey(key)).map(([key, value]) => `${key}: ${value}`).join(" | ");
}

function isNonContactKey(key: string): boolean {
  return /owner|assigned|salesperson|agent|created|date|timestamp|time/.test(normalizeKey(key));
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, " ").trim();
}

function findLikelyValue(row: RawRecord, aliases: string[]): string {
  return Object.entries(row).find(([key]) => aliases.some((alias) => normalizeKey(key).includes(alias)))?.[1] ?? "";
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

function cleanCell(value: string): string {
  return value.replace(/\r?\n/g, "\\n").replace(/\s+/g, " ").trim();
}

function appendNote(existing: string, addition: string): string {
  return [existing, addition].filter(Boolean).join(" | ");
}