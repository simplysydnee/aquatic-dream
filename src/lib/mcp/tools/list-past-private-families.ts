import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function client(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("+")) {
    const d = "+" + trimmed.slice(1).replace(/\D/g, "");
    return d.length > 1 ? d : null;
  }
  const just = trimmed.replace(/\D/g, "");
  if (just.length === 10) return `+1${just}`;
  if (just.length === 11 && just.startsWith("1")) return `+${just}`;
  return just ? `+${just}` : null;
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export default defineTool({
  name: "list_past_private_families",
  title: "List past private lesson families",
  description:
    "List distinct families who have had a private (or semi-private) lesson occurrence on or after sinceDate. Deduped by normalized phone number. Returns phone (E.164), parent name, child first names, and the most recent lesson date. Intended for outreach/blast lists.",
  inputSchema: {
    sinceDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("Only include families with a lesson on/after this date (default: 365 days ago)."),
    includeSemiPrivate: z.boolean().default(true).describe("Include semi-private bookings alongside private."),
    limit: z.number().int().min(1).max(1000).default(500),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ sinceDate, includeSemiPrivate, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = client(ctx);
    const since = sinceDate ?? isoDaysAgo(365);
    const types = includeSemiPrivate ? ["private", "semi-private"] : ["private"];

    const { data, error } = await supabase
      .from("lesson_booking_occurrences")
      .select(
        `occurrence_date, status,
         booking:lesson_bookings!inner(id, lesson_type, status,
           parent_name, parent_first_name, parent_last_name, parent_phone,
           child_first_name, child_name)`,
      )
      .gte("occurrence_date", since)
      .neq("status", "cancelled")
      .in("booking.lesson_type", types)
      .neq("booking.status", "cancelled")
      .not("booking.parent_phone", "is", null);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    type Row = {
      phone: string;
      parent_name: string;
      childNames: string[];
      last_lesson_date: string;
    };
    const byPhone = new Map<string, Row & { _children: Set<string> }>();

    for (const r of (data as any[]) || []) {
      const b = r.booking;
      if (!b) continue;
      const phone = normalizePhone(b.parent_phone);
      if (!phone) continue;
      const parentName =
        b.parent_name ||
        [b.parent_first_name, b.parent_last_name].filter(Boolean).join(" ") ||
        "";
      const child =
        (b.child_first_name || "").trim() ||
        ((b.child_name || "").split(" ")[0] || "").trim();

      const existing = byPhone.get(phone);
      if (existing) {
        if (child) existing._children.add(child);
        if (r.occurrence_date > existing.last_lesson_date) {
          existing.last_lesson_date = r.occurrence_date;
        }
        if (!existing.parent_name && parentName) existing.parent_name = parentName;
      } else {
        const children = new Set<string>();
        if (child) children.add(child);
        byPhone.set(phone, {
          phone,
          parent_name: parentName,
          childNames: [],
          last_lesson_date: r.occurrence_date,
          _children: children,
        });
      }
    }

    const rows: Row[] = Array.from(byPhone.values())
      .map((r) => ({
        phone: r.phone,
        parent_name: r.parent_name,
        childNames: Array.from(r._children).sort(),
        last_lesson_date: r.last_lesson_date,
      }))
      .sort((a, b) => (a.last_lesson_date < b.last_lesson_date ? 1 : -1))
      .slice(0, limit);

    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      structuredContent: { rows, count: rows.length, since_date: since },
    };
  },
});
