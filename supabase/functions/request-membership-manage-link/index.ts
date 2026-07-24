import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const SITE_URL = Deno.env.get("PUBLIC_SITE_URL") || "https://aquaticdreamsswim.com";

function buildManageLink(token: string) {
  return `${SITE_URL.replace(/\/$/, "")}/manage/${token}`;
}

async function sendEmail(recipientEmail: string, familyName: string | undefined, manageUrl: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const idempotencyKey = `manage-link-${crypto.randomUUID()}`;
  const res = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` },
    body: JSON.stringify({
      templateName: "membership-manage-link",
      recipientEmail,
      idempotencyKey,
      purpose: "transactional",
      templateData: { familyName, manageUrl },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("[request-manage-link] email send failed", res.status, body.slice(0, 300));
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { email } = await req.json();
    if (typeof email !== "string" || !email.includes("@")) {
      return new Response(JSON.stringify({ error: "Invalid email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalized = email.trim().toLowerCase();

    // Look up active/pending memberships tied to this parent email.
    const { data: rows, error } = await supabase
      .from("memberships")
      .select("id, parent_first_name, parent_email, manage_token, status")
      .ilike("parent_email", normalized)
      .in("status", ["active", "pending_cancel", "trialing", "past_due"]);

    if (error) {
      console.error("[request-manage-link] lookup failed", error);
    }

    if (rows && rows.length > 0) {
      // Ensure every membership has a manage_token.
      for (const row of rows) {
        let token = row.manage_token as string | null;
        if (!token) {
          const { data: upd } = await supabase
            .from("memberships")
            .update({ manage_token: crypto.randomUUID() })
            .eq("id", row.id)
            .select("manage_token")
            .single();
          token = (upd?.manage_token as string) || null;
        }
        if (token) {
          const familyName = (row.parent_first_name as string | null) || undefined;
          const to = (row.parent_email as string | null) || normalized;
          await sendEmail(to, familyName, buildManageLink(token));
        }
      }
    }

    // Always respond generically — do not reveal whether the email exists.
    return new Response(
      JSON.stringify({ ok: true, message: "If a membership exists for that email, we've emailed you a link." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[request-manage-link] error", e);
    return new Response(JSON.stringify({ error: "Something went wrong" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
