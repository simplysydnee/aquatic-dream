import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { adminClient, errResult, notAuthed, okResult } from "./_client";

const FORBIDDEN =
  /(^|[^a-z_])(insert|update|delete|merge|alter|drop|create|grant|revoke|truncate|comment|vacuum|analyze|copy|call|do|set|reset|refresh|reindex|cluster|listen|notify|lock|prepare|execute|begin|commit|rollback|savepoint)([^a-z_]|$)/i;

export default defineTool({
  name: "run_readonly_sql",
  title: "Run read-only SQL",
  description:
    "Run a single read-only SELECT (or WITH ... SELECT) query against the database and return the rows. Writes and DDL are rejected and the query runs inside a read-only transaction. Admin only. Results are capped.",
  inputSchema: {
    query: z
      .string()
      .trim()
      .min(1)
      .max(10000)
      .describe("A single SELECT or WITH ... SELECT statement. No semicolon-separated statements."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .default(200)
      .describe("Maximum number of rows to return (default 200, max 1000)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();

    const q = query.trim().replace(/;\s*$/, "");
    if (q.includes(";")) return errResult("Multiple statements are not allowed.");
    if (!/^(select|with)\s/i.test(q)) {
      return errResult("Only a single SELECT (or WITH ... SELECT) statement is allowed.");
    }
    if (FORBIDDEN.test(q)) {
      return errResult("Query contains a disallowed keyword; only read-only SELECT queries are permitted.");
    }

    const { data, error } = await adminClient(ctx).rpc("mcp_run_readonly_sql", {
      _query: q,
      _limit: limit,
    });
    if (error) return errResult(error.message);
    return okResult(data);
  },
});
