// TIM-1957: CSV field escaping with formula-injection neutralization (CWE-1236).
//
// Spreadsheet applications (Excel, Google Sheets, LibreOffice) evaluate any
// cell that begins with =, +, -, @, tab, or newline as a formula. Member
// fields like full_name and signup_source are attacker-controlled (signup_source
// flows from a public ?signup_source= query param), so a row exported to CSV
// and opened by the admin can execute HYPERLINK / DDE / IMPORTDATA payloads
// that exfiltrate the surrounding member PII. We prefix the leading char with
// a single quote so the spreadsheet stores it as a literal string, then apply
// RFC-4180 quoting so the literal quote survives transport.

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@\t\r\n]/.test(s)) s = "'" + s;
  if (s.includes(",") || s.includes("\"") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
