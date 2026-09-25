import type { Ticket } from "./triage.js";

/** Realistic sample tickets for a fictional B2B invoicing SaaS. */
export const SAMPLE_TICKETS: Ticket[] = [
  {
    id: "T-1001",
    subject: "Charged twice this month",
    body: "Hi, I see two charges of €49 on my card for the March subscription. Can you refund the duplicate please?",
    customer: { plan: "pro", accountAgeMonths: 14 },
  },
  {
    id: "T-1002",
    subject: "URGENT: invoice export failing for ALL users",
    body:
      "Since this morning's update nobody in our company can export invoices to PDF. Clicking Export shows " +
      "'Error 500: renderer timeout'. Steps: open any invoice > Export > PDF. We have to send 300 invoices today " +
      "before month-end close. This is costing us money.",
    customer: { plan: "enterprise", accountAgeMonths: 40 },
  },
  {
    id: "T-1003",
    subject: "How do I add my VAT number?",
    body: "Where can I add our company VAT number so it shows on the invoices we send? Thanks!",
    customer: { plan: "free", accountAgeMonths: 1 },
  },
  {
    id: "T-1004",
    subject: "Someone logged into my account",
    body:
      "I got an email about a login from Brazil at 3am. I have never been there. Now I see a new bank account " +
      "added to our payout settings that I did not add. Please help immediately.",
    customer: { plan: "pro", accountAgeMonths: 22 },
  },
  {
    id: "T-1005",
    subject: "Third time asking - still broken",
    body:
      "This is the third ticket about the dashboard graphs not loading. Nobody has fixed it. Honestly we're " +
      "looking at other tools now, this is not acceptable for what we pay.",
    customer: { plan: "pro", accountAgeMonths: 30 },
  },
  {
    id: "T-1006",
    subject: "Idea: recurring invoices",
    body: "Would be great if we could set invoices to repeat monthly automatically. Any plans for that?",
    customer: { plan: "free", accountAgeMonths: 6 },
  },
  {
    id: "T-1007",
    subject: "hello",
    body: "hi",
    customer: { plan: "free", accountAgeMonths: 0 },
  },
];
