import { createClient } from "npm:@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { sendEnrollmentConfirmation } from "../_shared/send-enrollment-confirmation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface Body {
  enrollmentId: string;
  reason?: string;
  previousSessionLabel?: string;
  previousLevel?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Require an authenticated caller. Admin-only is enforced by the
    // admin pages that invoke this; the JWT presence prevents anonymous abuse.
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.slice(7);
    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userRes?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as Body;
    if (!body?.enrollmentId || typeof body.enrollmentId !== "string") {
      return new Response(JSON.stringify({ error: "enrollmentId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const noticeParts: string[] = [];
    if (body.previousSessionLabel) {
      noticeParts.push(`Previously: ${body.previousSessionLabel}`);
    }
    if (body.previousLevel) {
      noticeParts.push(`Previous level: ${body.previousLevel}`);
    }
    const changeNotice =
      body.reason === "moved"
        ? `Your class details were updated.${noticeParts.length ? " " + noticeParts.join(" · ") : ""}`
        : undefined;

    const result = await sendEnrollmentConfirmation(supabase, body.enrollmentId, {
      reason: body.reason || "manual",
      changeNotice,
    });

    if (!result.ok) {
      return new Response(JSON.stringify({ error: result.error || "send failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
