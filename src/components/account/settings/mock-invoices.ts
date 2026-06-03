// TIM-1911: fixture invoice rows for the Billing tab.
// Real rows land in TIM-1910b via /api/account/invoices.
export type MockInvoice = {
  date: string;
  description: string;
  amount: string;
  status: string;
  downloadUrl: string;
};

export const MOCK_INVOICES: MockInvoice[] = [
  {
    date: "May 1, 2026",
    description: "Growth Plan — Monthly",
    amount: "$29.00",
    status: "Paid",
    downloadUrl: "#",
  },
  {
    date: "Apr 1, 2026",
    description: "Growth Plan — Monthly",
    amount: "$29.00",
    status: "Paid",
    downloadUrl: "#",
  },
  {
    date: "Mar 1, 2026",
    description: "Growth Plan — Monthly",
    amount: "$29.00",
    status: "Paid",
    downloadUrl: "#",
  },
];
