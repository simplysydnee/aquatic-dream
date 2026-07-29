import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { adminClient, errResult, notAuthed, okResult } from "./_client";

export default defineTool({
  name: "describe_table",
  title: "Describe table",
  description:
    "Return a table's columns (name, data type, nullability, default), enum labels for USER-DEFINED types, and both outgoing and incoming foreign keys. Read-only, admin only.",
  inputSchema: {
    table_name: z.string().trim().min(1).max(120).describe("Table name, e.g. 'memberships'."),
    schema: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .default("public")
      .describe("Schema name (default 'public')."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ table_name, schema }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const { data, error } = await adminClient(ctx).rpc("mcp_describe_table", {
      _table_name: table_name,
      _schema: schema,
    });
    if (error) return errResult(error.message);
    return okResult(data);
  },
});
