// TIM-2500: Location-to-callout-key lookup for the Taxes & Compliance callout.
// Priority: exact city → country → global fallback.
// String content sourced from TIM-2493#document-taxes-compliance-strings.

export type TaxesComplianceLocationKey =
  | "seattle-wa"
  | "melbourne-vic"
  | "mexico-city"
  | "us-generic"
  | "canada-generic"
  | "uk-generic"
  | "australia-generic"
  | "global";

export type TaxesComplianceStrings = {
  calloutKey: string;
  heading: string;
  subcopy: string;
  actionLabel: string;
  /** null = action opens location settings (not an external URL). */
  actionUrl: string | null;
};

export const TAXES_COMPLIANCE_STRINGS: Record<
  TaxesComplianceLocationKey,
  TaxesComplianceStrings
> = {
  "seattle-wa": {
    calloutKey: "financials.taxes-compliance-seattle-wa",
    heading: "Sales Tax Applies to Your Revenue",
    subcopy:
      "Washington state charges 10.25% sales tax on prepared food and drinks in Seattle. The figures above are pre-tax — you collect this from customers and send it to the state. Talk to a local accountant before you finalize your plan.",
    actionLabel: "WA Dept. of Revenue",
    actionUrl: "https://dor.wa.gov",
  },
  "melbourne-vic": {
    calloutKey: "financials.taxes-compliance-melbourne-vic",
    heading: "GST Applies to Your Revenue",
    subcopy:
      "Australia charges 10% GST on café meals and beverages. The figures above are ex-GST — you collect GST from customers and remit it to the ATO quarterly. Talk to a local accountant before you finalize your plan.",
    actionLabel: "ATO — GST for small business",
    actionUrl: "https://www.ato.gov.au/business/gst/",
  },
  "mexico-city": {
    calloutKey: "financials.taxes-compliance-mexico-city",
    heading: "IVA Applies to Your Revenue",
    subcopy:
      "Mexico charges 16% IVA on most food and drink sales. The figures above are before IVA — you collect this from customers and report it to the SAT. Talk to a local accountant before you finalize your plan.",
    actionLabel: "SAT — Información fiscal",
    actionUrl: "https://www.sat.gob.mx",
  },
  "us-generic": {
    calloutKey: "financials.taxes-compliance-us-generic",
    heading: "Sales Tax May Apply to Your Revenue",
    subcopy:
      "Most US states charge sales tax on prepared food and drinks. The figures above don't include this — check your state's rate and factor it into your projections. Talk to a local accountant before you finalize your plan.",
    actionLabel: "IRS small business resources",
    actionUrl: "https://www.irs.gov/businesses/small-businesses-self-employed",
  },
  "canada-generic": {
    calloutKey: "financials.taxes-compliance-canada-generic",
    heading: "GST/HST Applies to Your Revenue",
    subcopy:
      "Canada charges 5% GST on most food and drink sales, plus provincial tax that varies by location. The figures above are pre-tax — you collect this from customers and remit it to the CRA. Talk to a local accountant before you finalize your plan.",
    actionLabel: "CRA — GST/HST for businesses",
    actionUrl:
      "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses.html",
  },
  "uk-generic": {
    calloutKey: "financials.taxes-compliance-uk-generic",
    heading: "VAT Applies to Hot Drinks and Most Café Food",
    subcopy:
      "HMRC charges 20% VAT on hot drinks and most café food. The figures above are ex-VAT — you collect this from customers and report it quarterly once your turnover exceeds the VAT threshold. Talk to a local accountant before you finalize your plan.",
    actionLabel: "HMRC — VAT for businesses",
    actionUrl: "https://www.gov.uk/topic/business-tax/vat",
  },
  "australia-generic": {
    calloutKey: "financials.taxes-compliance-australia-generic",
    heading: "GST Applies to Your Revenue",
    subcopy:
      "Australia charges 10% GST on café meals and beverages. The figures above are ex-GST — you collect GST from customers and remit it to the ATO quarterly. Talk to a local accountant before you finalize your plan.",
    actionLabel: "ATO — GST for small business",
    actionUrl: "https://www.ato.gov.au/business/gst/",
  },
  global: {
    calloutKey: "financials.taxes-compliance-global",
    heading: "Tax Obligations Vary by Location",
    subcopy:
      "Most countries charge sales tax, VAT, or GST on café sales. The figures in this plan don't include those taxes — check the rate for your location and build it into your projections. Talk to a local accountant before you finalize your plan.",
    actionLabel: "Set your location to see specific rates",
    actionUrl: null,
  },
};

function normalizeCountry(country: string | null | undefined): string {
  if (!country) return "";
  const c = country.trim().toLowerCase();
  if (
    c === "us" ||
    c === "usa" ||
    c === "united states" ||
    c === "united states of america"
  )
    return "us";
  if (c === "ca" || c === "can" || c === "canada") return "canada";
  if (
    c === "gb" ||
    c === "uk" ||
    c === "united kingdom" ||
    c === "great britain" ||
    c === "england" ||
    c === "scotland" ||
    c === "wales"
  )
    return "uk";
  if (c === "au" || c === "aus" || c === "australia") return "australia";
  if (c === "mx" || c === "mex" || c === "mexico" || c === "méxico")
    return "mexico";
  return c;
}

function normalizeCity(city: string | null | undefined): string {
  if (!city) return "";
  return city.trim().toLowerCase();
}

export function resolveTaxesComplianceLocationKey(
  city: string | null | undefined,
  country: string | null | undefined,
): TaxesComplianceLocationKey {
  const normCity = normalizeCity(city);
  const normCountry = normalizeCountry(country);

  // 1. Exact city matches — require country agreement (or unknown country) to
  //    avoid false matches (e.g. Melbourne FL ≠ Melbourne VIC).
  if (normCity === "seattle" && (normCountry === "us" || normCountry === "")) {
    return "seattle-wa";
  }
  if (normCity === "melbourne" && normCountry === "australia") {
    return "melbourne-vic";
  }
  if (
    (normCity === "mexico city" ||
      normCity === "ciudad de méxico" ||
      normCity === "ciudad de mexico") &&
    (normCountry === "mexico" || normCountry === "")
  ) {
    return "mexico-city";
  }

  // 2. Country fallback
  if (normCountry === "us") return "us-generic";
  if (normCountry === "canada") return "canada-generic";
  if (normCountry === "uk") return "uk-generic";
  if (normCountry === "australia") return "australia-generic";

  // 3. Global fallback
  return "global";
}

export function resolveTaxesComplianceStrings(
  city: string | null | undefined,
  country: string | null | undefined,
): TaxesComplianceStrings {
  return TAXES_COMPLIANCE_STRINGS[resolveTaxesComplianceLocationKey(city, country)];
}
