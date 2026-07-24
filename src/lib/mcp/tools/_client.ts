import { createClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

export function adminClient(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function notAuthed() {
  return { content: [{ type: "text" as const, text: "Not authenticated" }], isError: true };
}

export function refuseUnconfirmed(summary: string, preview: Record<string, unknown>) {
  return {
    content: [
      {
        type: "text" as const,
        text: `Refusing: confirm=false. ${summary} Re-call with confirm=true to execute.`,
      },
    ],
    structuredContent: { would_do: summary, preview },
  };
}

export function errResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

export function okResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload as any,
  };
}
