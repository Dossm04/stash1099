import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classify, importBankCsv, parseCsv, toAmount, toIsoDate } from "./importCsv";

describe("CSV primitives", () => {
  it("parses quoted fields with commas and escaped quotes", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\n')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "2", "3"],
    ]);
  });
  it("reads US dates and money formats", () => {
    expect(toIsoDate("11/6/2026")).toBe("2026-11-06");
    expect(toIsoDate("2026-11-06")).toBe("2026-11-06");
    expect(toIsoDate("13/40/2026")).toBeNull();
    expect(toAmount("$1,234.50")).toBe(1234.5);
    expect(toAmount("(86.42)")).toBe(-86.42);
    expect(toAmount("-48.10")).toBe(-48.1);
    expect(toAmount("")).toBeNull();
  });
});

describe("classify", () => {
  it("recognises gig and freelance payers", () => {
    expect(classify("DOORDASH, INC. PAYMENT PPD ID: 555").source).toBe("DoorDash");
    expect(classify("UPWORK ESCROW INC").kind).toBe("platform");
    expect(classify("MAPLEBEAR INC (INSTACART)").source).toBe("Instacart");
  });
  it("never counts transfers, refunds, interest or W-2 payroll as 1099 income", () => {
    expect(classify("ONLINE TRANSFER FROM SAV ...4471").kind).toBe("excluded");
    expect(classify("UBER REFUND").kind).toBe("excluded");
    expect(classify("INTEREST PAYMENT").kind).toBe("excluded");
    expect(classify("ACME CORP PAYROLL DIR DEP").kind).toBe("excluded");
  });
  it("leaves person-to-person deposits for the user to decide", () => {
    expect(classify("ZELLE PAYMENT FROM CEDAR DENTAL LLC").kind).toBe("maybe");
  });
});

describe("importBankCsv", () => {
  it("handles the Chase export layout end to end (sample file shipped with the app)", () => {
    const text = readFileSync("public/sample-chase-export.csv", "utf8");
    const r = importBankCsv(text, 2026);
    expect(r.bankFormat).toBe("Chase");
    expect(r.skippedOutflows).toBe(5);
    const included = r.deposits.filter((d) => d.include);
    expect(included.map((d) => d.source)).toEqual(["Upwork", "Stripe", "DoorDash", "DoorDash", "Upwork"]);
    expect(included.reduce((s, d) => s + d.amount, 0)).toBeCloseTo(10850.85, 2);
    expect(r.deposits.find((d) => d.description.includes("ZELLE"))?.kind).toBe("maybe");
    expect(r.deposits.find((d) => d.date === "2025-12-30")?.reason).toBe("Not tax year 2026");
  });

  it("handles Bank of America (summary block above the header)", () => {
    const boa = [
      "Description,,Summary Amt.",
      "Beginning balance as of 10/01/2026,,1000.00",
      "",
      "Date,Description,Amount,Running Bal.",
      '10/05/2026,"LYFT INC DES:PAYMENT ID:XXXX",310.20,1310.20',
      '10/06/2026,"TARGET T-1234",-45.00,1265.20',
    ].join("\n");
    const r = importBankCsv(boa, 2026);
    expect(r.bankFormat).toBe("Bank of America");
    expect(r.deposits).toHaveLength(1);
    expect(r.deposits[0]).toMatchObject({ source: "Lyft", amount: 310.2, include: true });
  });

  it("handles Capital One style Debit/Credit columns", () => {
    const c1 = [
      "Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit",
      "2026-09-02,2026-09-03,1234,ETSY INC DEPOSIT,Other,,640.00",
      "2026-09-04,2026-09-05,1234,WHOLE FOODS,Groceries,52.10,",
    ].join("\n");
    const r = importBankCsv(c1, 2026);
    expect(r.deposits).toHaveLength(1);
    expect(r.deposits[0]).toMatchObject({ source: "Etsy", amount: 640, date: "2026-09-02" });
    expect(r.skippedOutflows).toBe(1);
  });

  it("handles header-less Wells Fargo exports", () => {
    const wf = ['"08/14/2026","1520.00","*","","UBER USA 6787 PAYMENT"', '"08/15/2026","-20.00","*","","NETFLIX"'].join(
      "\n",
    );
    const r = importBankCsv(wf, 2026);
    expect(r.deposits).toEqual([expect.objectContaining({ source: "Uber", amount: 1520, include: true })]);
  });

  it("explains files it cannot read instead of guessing", () => {
    expect(importBankCsv("hello\nworld", 2026).error).toMatch(/Could not find/);
  });
});
