import { TypeSafeClient } from "@typesafe-ai/sdk";
import { SAMPLE_TICKETS } from "./sample-tickets.js";
import { triage, type TriageDecision } from "./triage.js";

const client = new TypeSafeClient();

const decisions: TriageDecision[] = await Promise.all(SAMPLE_TICKETS.map((ticket) => triage(client, ticket)));

for (const [i, d] of decisions.entries()) {
  const { category, urgency, frustration } = d.answers;
  console.log(`\n${d.ticketId}  ${SAMPLE_TICKETS[i].subject}`);
  console.log(`  -> ${d.queue}  ${d.priority}${d.suggestAutoReply ? "  (suggest auto-reply)" : ""}`);
  console.log(
    `  category=${category.choice} (conf ${category.confidence.toFixed(2)})  ` +
      `urgency=${urgency.score.toFixed(2)}  frustration=${frustration.score.toFixed(2)}`,
  );
  if (d.flags.length) console.log(`  flags: ${d.flags.join(", ")}`);
  if (d.reviewReasons.length) console.log(`  review: ${d.reviewReasons.join("; ")}`);
}
