import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { composeOpenSlots, type Block, type Instructor } from "../../privateBooking-core";

function client(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_open_private_slots",
  title: "List open private lesson slots",
  description:
    "List open 30-minute private lesson slots for a specific date. Uses the same availability computation as the public /book-private-lesson picker (instructor booking blocks minus existing bookings, active holds, and blackouts).",
  inputSchema: {
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe("Target date (YYYY-MM-DD)."),
    instructorIds: z
      .array(z.string().uuid())
      .optional()
      .describe("Optional list of instructor UUIDs to restrict to."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ date, instructorIds }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = client(ctx);

    const { data: instData, error: instErr } = await supabase.rpc("get_active_instructors_public");
    if (instErr) return { content: [{ type: "text", text: instErr.message }], isError: true };
    const instructors = (instData as Instructor[]) || [];
    const allowed = new Set(instructorIds && instructorIds.length ? instructorIds : instructors.map((i) => i.id));

    const [blocksRes, occsRes, holdsRes] = await Promise.all([
      supabase.rpc("get_public_booking_blocks", { _instructor_ids: Array.from(allowed) }),
      supabase.rpc("get_public_taken_occurrences", { p_from_date: date, p_to_date: date }),
      supabase.rpc("get_active_slot_holds", { p_from_date: date, p_to_date: date, p_session_token: null }),
    ]);
    for (const r of [blocksRes, occsRes, holdsRes]) {
      if (r.error) return { content: [{ type: "text", text: r.error.message }], isError: true };
    }

    // Parse the date as a local calendar day (composeOpenSlots iterates days from fromDate).
    const [y, m, d] = date.split("-").map(Number);
    const fromDate = new Date(y, m - 1, d);

    const slots = composeOpenSlots({
      fromDate,
      weeks: 1,
      instructors: instructors.filter((i) => allowed.has(i.id)),
      blocks: (blocksRes.data as Block[]) || [],
      taken: (occsRes.data as any[]) || [],
      holds: (holdsRes.data as any[]) || [],
    })
      .filter((s) => s.slot_date === date)
      .sort((a, b) =>
        a.start_time === b.start_time
          ? a.instructor_name.localeCompare(b.instructor_name)
          : a.start_time.localeCompare(b.start_time),
      );

    return {
      content: [{ type: "text", text: JSON.stringify(slots, null, 2) }],
      structuredContent: { rows: slots, count: slots.length, date },
    };
  },
});
