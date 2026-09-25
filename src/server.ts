import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { APIError, TypeSafeClient } from "@typesafe-ai/sdk";
import { triage, type Ticket } from "./triage.js";

// The API key stays on the server; the browser only talks to /api/triage.
const client = new TypeSafeClient();
const PORT = Number(process.env.PORT ?? 3000);
const PLANS = ["free", "pro", "enterprise"] as const;

function parseTicket(raw: unknown): Ticket {
  const input = (raw ?? {}) as Record<string, unknown>;
  const subject = String(input.subject ?? "").trim();
  const body = String(input.body ?? "").trim();
  if (!body) throw new Error("body is required");
  if (subject.length > 300 || body.length > 10_000) throw new Error("ticket too long");
  const plan = PLANS.includes(input.plan as Ticket["customer"]["plan"])
    ? (input.plan as Ticket["customer"]["plan"])
    : "free";
  return { id: `WEB-${Date.now()}`, subject, body, customer: { plan, accountAgeMonths: 0 } };
}

createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(await readFile(new URL("../public/index.html", import.meta.url)));
      return;
    }
    if (req.method === "POST" && req.url === "/api/triage") {
      let body = "";
      for await (const chunk of req) body += chunk;
      let ticket: Ticket;
      try {
        ticket = parseTicket(JSON.parse(body));
      } catch (err) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: (err as Error).message }));
        return;
      }
      const decision = await triage(client, ticket);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(decision));
      return;
    }
    res.writeHead(404).end();
  } catch (err) {
    const status = err instanceof APIError ? 502 : 500;
    console.error(err);
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "triage failed" }));
  }
}).listen(PORT, () => console.log(`Ticket triage demo on http://localhost:${PORT}`));
