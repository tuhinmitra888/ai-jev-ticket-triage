import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, QUESTIONS, type Category, type Ticket, type TriageAnswers } from "../src/triage.js";

// Offline tests of the routing policy: fake answers in, decision out. No API key needed.

const ticket = (plan: Ticket["customer"]["plan"] = "pro"): Ticket => ({
  id: "T-TEST",
  subject: "",
  body: "",
  customer: { plan, accountAgeMonths: 12 },
});

function scoreAnswer(value: number, criteria: readonly string[], confidence = 0.9) {
  const legend = Object.fromEntries(criteria.map((c, i) => [String(i), c]));
  const probabilities = Object.fromEntries(criteria.map((_, i) => [String(i), i === Math.round(value) ? 1 : 0]));
  return { type: "score" as const, score: value, confidence, legend, probabilities };
}

function answers(overrides: {
  category?: Category;
  categoryConfidence?: number;
  urgency?: number;
  frustration?: number;
  security?: number;
  churn?: number;
  refund?: number;
  repro?: number;
} = {}): TriageAnswers {
  const category = overrides.category ?? "how_to";
  const labels = Object.keys(QUESTIONS.category.criteria) as Category[];
  return {
    category: {
      type: "choice",
      choice: category,
      confidence: overrides.categoryConfidence ?? 0.9,
      probabilities: Object.fromEntries(labels.map((l) => [l, l === category ? 1 : 0])) as Record<Category, number>,
    },
    urgency: scoreAnswer(overrides.urgency ?? 0, QUESTIONS.urgency.criteria as readonly string[]),
    frustration: scoreAnswer(overrides.frustration ?? 0, QUESTIONS.frustration.criteria as readonly string[]),
    security_concern: { type: "noul", noul: overrides.security ?? 0 },
    churn_risk: { type: "noul", noul: overrides.churn ?? 0 },
    refund_requested: { type: "noul", noul: overrides.refund ?? 0 },
    has_repro_steps: { type: "noul", noul: overrides.repro ?? 0 },
  } as TriageAnswers;
}

test("simple how-to question goes to customer success with an auto-reply suggestion", () => {
  const d = decide(ticket("free"), answers({ category: "how_to" }));
  assert.equal(d.queue, "customer_success");
  assert.equal(d.priority, "P4");
  assert.equal(d.suggestAutoReply, true);
});

test("low category confidence falls back to human triage", () => {
  const d = decide(ticket(), answers({ category: "billing", categoryConfidence: 0.3 }));
  assert.equal(d.queue, "human_triage");
  assert.equal(d.reviewReasons.length, 1);
});

test("security concern overrides category and priority", () => {
  const d = decide(ticket("free"), answers({ category: "account_access", security: 0.8 }));
  assert.equal(d.queue, "security");
  assert.equal(d.priority, "P1");
});

test("critical outage for an enterprise customer is P1 with repro flag", () => {
  const d = decide(ticket("enterprise"), answers({ category: "technical_issue", urgency: 3, repro: 0.9 }));
  assert.equal(d.queue, "engineering");
  assert.equal(d.priority, "P1");
  assert.ok(d.flags.includes("has repro steps"));
});

test("frustration and churn risk each raise priority", () => {
  const d = decide(ticket("pro"), answers({ category: "technical_issue", urgency: 1, frustration: 2.4, churn: 0.8 }));
  assert.equal(d.priority, "P1"); // P3 from urgency, bumped twice
  assert.ok(d.flags.includes("churn risk"));
  assert.ok(d.flags.includes("notify account manager"));
});

test("refund flag only appears on billing tickets", () => {
  assert.ok(decide(ticket(), answers({ category: "billing", refund: 0.9 })).flags.includes("refund requested"));
  assert.ok(!decide(ticket(), answers({ category: "how_to", refund: 0.9 })).flags.includes("refund requested"));
});
