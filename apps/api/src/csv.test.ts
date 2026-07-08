import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv.js";

describe("parseCsv", () => {
  it("rejects CSV files without data rows", () => {
    expect(() => parseCsv(Buffer.from("name,email\n"))).toThrow("CSV file does not contain any data rows.");
  });

  it("trims headers and cell values", () => {
    expect(parseCsv(Buffer.from(" Name , Email \n Asha Rao , asha@example.com \n"))).toEqual([
      { Name: "Asha Rao", Email: "asha@example.com" }
    ]);
  });
});