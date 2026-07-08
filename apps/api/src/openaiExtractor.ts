import { heuristicExtract } from "./heuristicExtractor.js";
import { normalizeRecord } from "./normalize.js";
import { crmFields, type CrmRecord, type RawRecord } from "./types.js";

const batchSize = 25;
const maxAiAttempts = 2;

export async function extractWithAi(rows: RawRecord[]): Promise<{ provider: "openai" | "heuristic"; records: CrmRecord[] }> {
  if (!process.env.OPENAI_API_KEY) {
    return { provider: "heuristic", records: heuristicExtract(rows) };
  }

  const batches = chunk(rows, batchSize);
  const records: CrmRecord[] = [];

  for (const batch of batches) {
    try {
      const extracted = await callOpenAIWithRetry(batch);
      if (extracted.length !== batch.length) {
        throw new Error(`OpenAI returned ${extracted.length} records for a ${batch.length}-row batch`);
      }
      records.push(...extracted);
    } catch (error) {
      console.error("OpenAI batch failed, falling back to heuristic extraction", error);
      records.push(...heuristicExtract(batch));
    }
  }

  return { provider: "openai", records };
}

async function callOpenAIWithRetry(rows: RawRecord[]): Promise<CrmRecord[]> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAiAttempts; attempt += 1) {
    try {
      return await callOpenAI(rows);
    } catch (error) {
      lastError = error;
      if (attempt < maxAiAttempts) {
        await wait(300 * attempt);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("OpenAI extraction failed");
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
            "You convert messy CSV lead records into GrowEasy CRM JSON.",
            "Return only JSON with a records array. Do not include markdown.",
            `Each record must contain exactly these string fields: ${crmFields.join(", ")}.`,
            "Allowed crm_status values: GOOD_LEAD_FOLLOW_UP, DID_NOT_CONNECT, BAD_LEAD, SALE_DONE. Leave blank if unclear.",
            "Allowed data_source values: leads_on_demand, meridian_tower, eden_park, varah_swamy, sarjapur_plots. Leave blank if unclear.",
            "created_at must be parseable by JavaScript new Date(created_at), otherwise blank.",
            "Use the first email and first mobile number. Put extra emails, extra phone numbers, remarks, and useful leftovers into crm_note.",
            "country_code should contain the dialing prefix such as +91. mobile_without_country_code should contain only the local digits.",
            "Skip nothing in this step; validation happens after extraction. Escape line breaks as \\n."
          ].join(" ")
        },
        {
          role: "user",
          content: JSON.stringify(rows)
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status} ${await response.text()}`);
  }

  const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned an empty response");

  const parsed = JSON.parse(content) as { records?: Partial<CrmRecord>[] };
  if (!Array.isArray(parsed.records)) throw new Error("OpenAI response did not include records[]");

  return parsed.records.map(normalizeRecord);
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
