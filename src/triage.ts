import {
  choice,
  noul,
  score,
  TypeSafeClient,
  type SystemOneResult,
} from "@typesafe-ai/sdk";

/** An incoming support ticket plus the customer facts we already know. */
export interface Ticket {
  id: string;
  subject: string;
  body: string;
  customer: {
    plan: "free" | "pro" | "enterprise";
    accountAgeMonths: number;
  };
}

/**
 * The judgments we ask TypeSafe for. All of them are sent in ONE request and
 * evaluated in parallel; some are speculative (e.g. refund_requested only
 * matters for billing) and the routing code simply ignores irrelevant ones.
 */
export const QUESTIONS = {
  category: choice(
    "Which team should handle this support ticket? Judge by the customer's main problem in `ticket`.",
    {
      billing: "Charges, invoices, refunds, subscription or plan changes",
      technical_issue: "Something in the product is broken, erroring, slow or behaving unexpectedly",
      account_access: "Cannot log in, password resets, 2FA, permissions, user management",
      how_to: "Asking how to use an existing feature; nothing is broken",
      feature_request: "Asking for functionality the product does not have",
      other: "None of the above, spam, or not enough information to tell",
    },
  ),
  urgency: score(
    "How time-critical is resolving this ticket for the customer's business, based on the impact described in `ticket`?",
    [
      "No time pressure: a question, idea or minor cosmetic issue",
      "Should be handled in the normal queue: an annoyance with a workaround",
      "Important: a key workflow is degraded or blocked for some users",
      "Critical: production is down, money is being lost, or all users are blocked right now",
    ],
  ),
  frustration: score("How frustrated does the customer sound in `ticket`?", [
    "Calm and matter-of-fact",
    "Mildly annoyed but civil",
    "Clearly frustrated or repeating themselves",
    "Very angry, hostile or threatening",
  ]),
  security_concern: noul(
    "Does `ticket` describe a possible security or data-protection incident, such as a compromised account, unauthorized access, leaked personal data or suspicious activity?",
  ),
  churn_risk: noul(
    "Does the customer in `ticket` say or strongly imply they may cancel, leave, or switch to a competitor?",
  ),
  refund_requested: noul(
    "Is the customer in `ticket` explicitly asking for a refund, credit or reversal of a charge?",
  ),
  has_repro_steps: noul(
    "Does `ticket` give concrete steps, inputs or error messages that would let an engineer reproduce the problem?",
  ),
} as const;

export type TriageAnswers = SystemOneResult<typeof QUESTIONS>["answers"];
export type Category = TriageAnswers["category"]["choice"];

export type Queue =
  | "billing"
  | "engineering"
  | "account_support"
  | "customer_success"
  | "product_feedback"
  | "security"
  | "human_triage";

export interface TriageDecision {
  ticketId: string;
  queue: Queue;
  priority: "P1" | "P2" | "P3" | "P4";
  /** True when the ticket is simple enough to send a suggested help-article reply. */
  suggestAutoReply: boolean;
  flags: string[];
  /** Why a human should double-check this routing, if at all. */
  reviewReasons: string[];
  answers: TriageAnswers;
}

/**
 * Routing policy. Every threshold here is a business rule you own; the numbers
 * are starting points to tune against your own labelled tickets.
 */
export const POLICY = {
  minCategoryConfidence: 0.5,
  securityThreshold: 0.5,
  churnThreshold: 0.6,
  refundThreshold: 0.7,
  reproThreshold: 0.6,
  highFrustration: 2,
  autoReplyMinConfidence: 0.8,
} as const;

const QUEUE_BY_CATEGORY: Record<Category, Queue> = {
  billing: "billing",
  technical_issue: "engineering",
  account_access: "account_support",
  how_to: "customer_success",
  feature_request: "product_feedback",
  other: "human_triage",
};

const PRIORITIES = ["P1", "P2", "P3", "P4"] as const;

/** Pure function: turns answers + known facts into a routing decision. No network calls. */
export function decide(ticket: Ticket, answers: TriageAnswers): TriageDecision {
  const { category, urgency, frustration, security_concern, churn_risk, refund_requested, has_repro_steps } =
    answers;
  const flags: string[] = [];
  const reviewReasons: string[] = [];

  let queue = QUEUE_BY_CATEGORY[category.choice];

  if (category.confidence < POLICY.minCategoryConfidence) {
    queue = "human_triage";
    reviewReasons.push(`category unclear (${category.choice}, confidence ${category.confidence.toFixed(2)})`);
  }

  // Urgency 0..3 maps to P4..P1.
  let priorityIndex = 3 - Math.round(urgency.score);
  if (urgency.confidence < 0.4) reviewReasons.push(`urgency uncertain (confidence ${urgency.confidence.toFixed(2)})`);

  // Known customer facts are plain code, not AI judgments.
  if (ticket.customer.plan === "enterprise") {
    priorityIndex -= 1;
    flags.push("enterprise customer");
  }
  if (frustration.score >= POLICY.highFrustration) {
    priorityIndex -= 1;
    flags.push("frustrated customer");
  }
  if (churn_risk.noul >= POLICY.churnThreshold) {
    priorityIndex -= 1;
    flags.push("churn risk");
    if (ticket.customer.plan !== "free") flags.push("notify account manager");
  }

  // Branch-specific (speculative) answers are only read where they apply.
  if (queue === "billing" && refund_requested.noul >= POLICY.refundThreshold) flags.push("refund requested");
  if (queue === "engineering") {
    flags.push(has_repro_steps.noul >= POLICY.reproThreshold ? "has repro steps" : "ask for repro steps");
  }

  // Security overrides everything: always P1, always the security queue.
  if (security_concern.noul >= POLICY.securityThreshold) {
    queue = "security";
    priorityIndex = 0;
    flags.push("possible security incident");
  }

  const priority = PRIORITIES[Math.min(3, Math.max(0, priorityIndex))];

  const suggestAutoReply =
    queue === "customer_success" &&
    category.confidence >= POLICY.autoReplyMinConfidence &&
    urgency.score < 1.5 &&
    frustration.score < 1.5;

  return { ticketId: ticket.id, queue, priority, suggestAutoReply, flags, reviewReasons, answers };
}

/** Asks all questions in a single TypeSafe request, then applies the routing policy. */
export async function triage(client: TypeSafeClient, ticket: Ticket): Promise<TriageDecision> {
  const { answers } = await client.systemOne({
    state: {
      ticket: { subject: ticket.subject, body: ticket.body },
    },
    questions: QUESTIONS,
  });
  return decide(ticket, answers);
}
