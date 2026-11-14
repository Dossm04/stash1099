/**
 * Tax-year 2026 federal parameters. Every number lives here (never inline in the engine)
 * so a new tax year is a new config file, not a code change.
 *
 * Sources:
 *  - Brackets & standard deduction: IRS Rev. Proc. 2025-32 (IR-2025-103)
 *    https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill
 *  - Social Security wage base $184,500: SSA 2026 COLA fact sheet
 *  - Mileage: IR-2025-128 (72.5¢ Jan–Jun) and Announcement 2026-11 (76¢ from Jul 1, 2026)
 *  - Underpayment interest rates: IRS quarterly interest rates (IR-2026-98, Rev. Rul. 2026-15)
 *  - No tax on tips (OBBBA §70201): up to $25,000, phase-out above $150k / $300k MAGI
 *  - QBI deduction (IRC §199A, made permanent by OBBBA)
 */

export type FilingStatus = "single" | "mfj" | "hoh";

export interface Bracket {
  /** Upper bound of taxable income for this rate (Infinity for the top bracket). */
  upTo: number;
  rate: number;
}

export interface TaxYearConfig {
  year: number;
  brackets: Record<FilingStatus, Bracket[]>;
  standardDeduction: Record<FilingStatus, number>;
  se: {
    /** Portion of net SE profit subject to SE tax (100% − 7.65%). */
    netEarningsFactor: number;
    socialSecurityRate: number;
    medicareRate: number;
    socialSecurityWageBase: number;
    /** Below this, no SE tax is owed. */
    minimumNetEarnings: number;
  };
  additionalMedicare: { rate: number; threshold: Record<FilingStatus, number> };
  qbi: { rate: number; threshold: Record<FilingStatus, number> };
  tips: { cap: number; phaseOutStart: Record<FilingStatus, number>; phaseOutPer1000: number };
  childTaxCredit: {
    perChild: number;
    /** Refundable part (Additional Child Tax Credit) per child. */
    refundablePerChild: number;
    refundableRate: number;
    earnedIncomeFloor: number;
    phaseOutStart: Record<FilingStatus, number>;
    phaseOutPer1000: number;
  };
  mileage: { periods: { from: string; to: string; centsPerMile: number }[] };
  estimated: {
    /** Due dates of the four installments for this tax year (ISO dates). */
    dueDates: [string, string, string, string];
    /** Date the return is due — penalty stops accruing here at the latest. */
    returnDueDate: string;
    /** Safe harbor: % of current-year tax. */
    currentYearPct: number;
    /** Safe harbor: % of prior-year tax (and the higher % for high earners). */
    priorYearPct: number;
    priorYearPctHighIncome: number;
    highIncomeAgi: Record<FilingStatus, number>;
    /** No penalty if balance due after withholding is under this. */
    minimumBalanceForPenalty: number;
    /** Annual underpayment rates by quarter start date (ISO). */
    interestRates: { from: string; rate: number }[];
  };
}

export const TAX_2026: TaxYearConfig = {
  year: 2026,
  brackets: {
    single: [
      { upTo: 12_400, rate: 0.1 },
      { upTo: 50_400, rate: 0.12 },
      { upTo: 105_700, rate: 0.22 },
      { upTo: 201_775, rate: 0.24 },
      { upTo: 256_225, rate: 0.32 },
      { upTo: 640_600, rate: 0.35 },
      { upTo: Infinity, rate: 0.37 },
    ],
    mfj: [
      { upTo: 24_800, rate: 0.1 },
      { upTo: 100_800, rate: 0.12 },
      { upTo: 211_400, rate: 0.22 },
      { upTo: 403_550, rate: 0.24 },
      { upTo: 512_450, rate: 0.32 },
      { upTo: 768_700, rate: 0.35 },
      { upTo: Infinity, rate: 0.37 },
    ],
    hoh: [
      { upTo: 17_700, rate: 0.1 },
      { upTo: 67_450, rate: 0.12 },
      { upTo: 105_700, rate: 0.22 },
      { upTo: 201_750, rate: 0.24 },
      { upTo: 256_200, rate: 0.32 },
      { upTo: 640_600, rate: 0.35 },
      { upTo: Infinity, rate: 0.37 },
    ],
  },
  standardDeduction: { single: 16_100, mfj: 32_200, hoh: 24_150 },
  se: {
    netEarningsFactor: 0.9235,
    socialSecurityRate: 0.124,
    medicareRate: 0.029,
    socialSecurityWageBase: 184_500,
    minimumNetEarnings: 400,
  },
  additionalMedicare: { rate: 0.009, threshold: { single: 200_000, mfj: 250_000, hoh: 200_000 } },
  qbi: { rate: 0.2, threshold: { single: 201_750, mfj: 403_500, hoh: 201_750 } },
  tips: { cap: 25_000, phaseOutStart: { single: 150_000, mfj: 300_000, hoh: 150_000 }, phaseOutPer1000: 100 },
  // Child Tax Credit after the 2025 budget law: $2,200 per child under 17, up to $1,700 of it refundable.
  childTaxCredit: {
    perChild: 2_200,
    refundablePerChild: 1_700,
    refundableRate: 0.15,
    earnedIncomeFloor: 2_500,
    phaseOutStart: { single: 200_000, mfj: 400_000, hoh: 200_000 },
    phaseOutPer1000: 50,
  },
  mileage: {
    periods: [
      { from: "2026-01-01", to: "2026-06-30", centsPerMile: 72.5 },
      { from: "2026-07-01", to: "2026-12-31", centsPerMile: 76 },
    ],
  },
  estimated: {
    dueDates: ["2026-04-15", "2026-06-15", "2026-09-15", "2027-01-15"],
    returnDueDate: "2027-04-15",
    currentYearPct: 0.9,
    priorYearPct: 1.0,
    priorYearPctHighIncome: 1.1,
    highIncomeAgi: { single: 150_000, mfj: 150_000, hoh: 150_000 },
    minimumBalanceForPenalty: 1_000,
    interestRates: [
      { from: "2026-01-01", rate: 0.07 },
      { from: "2026-04-01", rate: 0.06 },
      { from: "2026-07-01", rate: 0.07 },
      { from: "2026-10-01", rate: 0.07 },
      // Q1 2027 not yet announced — assume unchanged.
      { from: "2027-01-01", rate: 0.07 },
    ],
  },
};

export const FILING_STATUS_LABEL: Record<FilingStatus, string> = {
  single: "Single",
  mfj: "Married filing jointly",
  hoh: "Head of household",
};
