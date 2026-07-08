import { describe, expect, it } from "vitest";
import { heuristicExtract } from "./heuristicExtractor.js";

describe("heuristicExtract", () => {
  it("maps messy lead rows and preserves extra contact details in notes", () => {
    const [record] = heuristicExtract([
      {
        "Lead Name": "Asha Rao",
        "Phone / WhatsApp": "+91 98765 43210, +91 91234 56789",
        "E-mail": "asha@example.com secondary@example.com",
        "Campaign": "Eden Park Facebook",
        "Disposition": "Interested follow up",
        "Agent": "owner@groweasy.ai"
      }
    ]);

    expect(record.name).toBe("Asha Rao");
    expect(record.email).toBe("asha@example.com");
    expect(record.country_code).toBe("+91");
    expect(record.mobile_without_country_code).toBe("9876543210");
    expect(record.crm_status).toBe("GOOD_LEAD_FOLLOW_UP");
    expect(record.data_source).toBe("eden_park");
    expect(record.crm_note).toContain("secondary@example.com");
  });
  it("finds contact details embedded in generic text columns", () => {
    const [record] = heuristicExtract([
      {
        "First Name": "Rohan",
        "Last Name": "Mehta",
        "Lead Details": "Interested in Meridian Tower. Call +91 99887 76655 or email rohan@example.com tomorrow.",
        "Comments": "warm prospect"
      }
    ]);

    expect(record.name).toBe("Rohan Mehta");
    expect(record.email).toBe("rohan@example.com");
    expect(record.country_code).toBe("+91");
    expect(record.mobile_without_country_code).toBe("9988776655");
    expect(record.data_source).toBe("meridian_tower");
    expect(record.crm_status).toBe("GOOD_LEAD_FOLLOW_UP");
  });
  it("does not use owner emails or dates as lead contact details", () => {
    const [record] = heuristicExtract([
      {
        "Lead Created": "2026-05-13 15:00:00",
        "Full Name": "No Contact Lead",
        "Owner": "test@gmail.com",
        "Remarks": "Missing contact details should be skipped"
      }
    ]);

    expect(record.email).toBe("");
    expect(record.mobile_without_country_code).toBe("");
    expect(record.lead_owner).toBe("test@gmail.com");
  });
});
