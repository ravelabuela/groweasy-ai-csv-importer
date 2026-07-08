export const crmFields = [
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

export type CrmField = (typeof crmFields)[number];

export type RawRecord = Record<string, string>;

export type CrmRecord = Record<CrmField, string>;

export type SkippedRecord = {
  index: number;
  reason: string;
  original: RawRecord;
};

export type ImportResponse = {
  records: CrmRecord[];
  skipped: SkippedRecord[];
  totalImported: number;
  totalSkipped: number;
  aiProvider: "openai" | "heuristic";
};

export const allowedStatuses = [
  "GOOD_LEAD_FOLLOW_UP",
  "DID_NOT_CONNECT",
  "BAD_LEAD",
  "SALE_DONE"
] as const;

export const allowedDataSources = [
  "leads_on_demand",
  "meridian_tower",
  "eden_park",
  "varah_swamy",
  "sarjapur_plots"
] as const;
