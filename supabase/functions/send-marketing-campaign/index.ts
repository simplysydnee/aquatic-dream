import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { renderMarketingHtml, renderPlainText, type MarketingBlock } from "../_shared/marketing-template.ts";
import { resolveAudience } from "../_shared/resolve-audience.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const DEFAULT_FROM = Deno.env.get("MARKETING_FROM_ADDRESS")
  || "Aquatic Dreams <info@aquaticdreamsswim.com>";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

async function isAdmin(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization");
  if (!auth) return false;
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

export async function resolveAudience(audience: any): Promise<Array<{ id: string | null; email: string; first_name: string | null }>> {
  const tags: string[] = audience?.tags ?? [];
  const sources: string[] = audience?.sources ?? [];
  const sessionPeriodIds: string[] = audience?.session_period_ids ?? [];
  const swimSessionIds: string[] = audience?.swim_session_ids ?? [];
  const swimLevels: string[] = (audience?.swim_levels ?? []).map((s: string) => String(s).toLowerCase());
  const lessonInterests: string[] = audience?.lesson_interests ?? [];
  const lessonInterestAge: string = audience?.lesson_interest_age ?? "all";
  const hasEnrollmentFilter = sessionPeriodIds.length > 0 || swimSessionIds.length > 0 || swimLevels.length > 0;
  const hasLessonFilter = lessonInterests.length > 0;
  const hasContactFilter = tags.length > 0 || sources.length > 0;
  const includeAll = audience?.include_all !== false && !hasEnrollmentFilter && !hasLessonFilter && !hasContactFilter;

  const byEmail = new Map<string, { id: string | null; email: string; first_name: string | null }>();
  const add = (email: string | null | undefined, first_name: string | null, id: string | null = null) => {
    if (!email) return;
    const key = String(email).trim().toLowerCase();
    if (!key) return;
    const cur = byEmail.get(key);
    if (!cur) byEmail.set(key, { id, email: key, first_name });
    else if (!cur.id && id) cur.id = id;
  };

  // Load all marketing_contacts (paged) so we know unsubscribes and can attach ids
  const PAGE = 1000;
  const allContacts: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("marketing_contacts")
      .select("id, email, first_name, tags, source, subscribed")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data || [];
    allContacts.push(...rows);
    if (rows.length < PAGE) break;
  }
  const unsubscribed = new Set(
    allContacts.filter((r) => r.subscribed === false).map((r) => String(r.email).toLowerCase()),
  );
  const contactByEmail = new Map<string, any>();
  allContacts.forEach((r) => contactByEmail.set(String(r.email).toLowerCase(), r));

  if (includeAll) {
    allContacts.filter((r) => r.subscribed !== false).forEach((r) => add(r.email, r.first_name, r.id));
  } else if (hasContactFilter) {
    allContacts.filter((r: any) => {
      if (r.subscribed === false) return false;
      if (sources.length && sources.includes(r.source)) return true;
      if (tags.length && (r.tags || []).some((t: string) => tags.includes(t))) return true;
      return false;
    }).forEach((r: any) => add(r.email, r.first_name, r.id));
  }

  // Enrollment-driven filters
  if (hasEnrollmentFilter) {
    let q = supabase
      .from("swim_enrollments")
      .select("parent_email, parent_first_name, parent_name, swim_level, session_id, status, swim_sessions(session_period_id)")
      .in("status", ["pending", "confirmed", "enrolled", "pending_payment"]);
    if (swimSessionIds.length) q = q.in("session_id", swimSessionIds);
    if (swimLevels.length) q = q.in("swim_level", swimLevels as any);
    const { data, error } = await q;
    if (error) throw error;
    (data || []).forEach((r: any) => {
      if (sessionPeriodIds.length) {
        const pid = r.swim_sessions?.session_period_id;
        if (!pid || !sessionPeriodIds.includes(pid)) return;
      }
      const first = r.parent_first_name || (r.parent_name ? String(r.parent_name).split(" ")[0] : null);
      add(r.parent_email, first);
    });
  }

  // Lesson-interest filters
  if (hasLessonFilter) {
    let q = supabase
      .from("lesson_requests")
      .select("parent_email, parent_first_name, parent_name, lesson_type, is_adult_swimmer, child_age");
    const types = lessonInterests.filter((t) => t !== "adult");
    const wantsAdult = lessonInterests.includes("adult");
    const orParts: string[] = [];
    if (types.length) orParts.push(`lesson_type.in.(${types.map((t) => `"${t}"`).join(",")})`);
    if (wantsAdult) orParts.push(`is_adult_swimmer.eq.true`);
    if (orParts.length) q = q.or(orParts.join(","));
    const { data, error } = await q;
    if (error) throw error;
    (data || []).forEach((r: any) => {
      if (lessonInterestAge === "u14" && (r.child_age == null || r.child_age >= 14)) return;
      if (lessonInterestAge === "14plus" && (r.child_age == null || r.child_age < 14)) return;
      const first = r.parent_first_name || (r.parent_name ? String(r.parent_name).split(" ")[0] : null);
      add(r.parent_email, first);
    });
  }

  const out: Array<{ id: string | null; email: string; first_name: string | null }> = [];
  for (const [email, rec] of byEmail) {
    if (unsubscribed.has(email)) continue;
    const c = contactByEmail.get(email);
    out.push({ id: rec.id ?? c?.id ?? null, email, first_name: rec.first_name ?? c?.first_name ?? null });
  }
  console.log(`resolveAudience: ${out.length} recipients (contacts=${allContacts.length}, includeAll=${includeAll}, enroll=${hasEnrollmentFilter}, lesson=${hasLessonFilter})`);
  return out;
}


async function getSuppressed(): Promise<Set<string>> {
  const out = new Set<string>();
  const { data } = await supabase.from("suppressed_emails").select("email");
  (data || []).forEach((r: any) => out.add(String(r.email).toLowerCase()));
  return out;
}

async function getOrCreateToken(email: string): Promise<string> {
  const { data } = await supabase.rpc("get_or_create_unsubscribe_token", { _email: email });
  return data as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");

    const body = await req.json();
    const campaignId: string | undefined = body.campaign_id;
    const testEmail: string | undefined = body.test_email;

    if (!campaignId) {
      return new Response(JSON.stringify({ error: "campaign_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Skip admin auth check when invoked via service-role (cron). Otherwise enforce.
    const auth = req.headers.get("Authorization") || "";
    const isServiceRole = auth.includes(SERVICE_ROLE);
    if (!isServiceRole && !(await isAdmin(req))) {
      return new Response(JSON.stringify({ error: "forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: campaign, error: cErr } = await supabase
      .from("marketing_campaigns")
      .select("*")
      .eq("id", campaignId)
      .maybeSingle();
    if (cErr || !campaign) throw new Error("campaign not found");

    if (!testEmail && campaign.status === "sent") {
      return new Response(JSON.stringify({ error: "already sent" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const blocks: MarketingBlock[] = (campaign.body_blocks || []) as MarketingBlock[];
    const fromAddress = campaign.from_address || DEFAULT_FROM;
    const replyTo = campaign.reply_to || undefined;
    const subject = campaign.subject || campaign.name;

    const unsubBase = `${SUPABASE_URL}/functions/v1/marketing-unsubscribe`;

    const renderFor = (email: string) => {
      const tokenUrl = `${unsubBase}?token=__TOKEN__`;
      return tokenUrl;
    };

    // Build recipient list
    let recipients: Array<{ id: string | null; email: string; first_name: string | null }>;
    if (testEmail) {
      recipients = [{ id: null, email: testEmail, first_name: null }];
    } else {
      recipients = await resolveAudience(campaign.audience);
    }
    const suppressed = await getSuppressed();
    recipients = recipients.filter((r) => !suppressed.has(r.email.toLowerCase()));

    if (recipients.length === 0) {
      await supabase.from("marketing_campaigns").update({
        status: testEmail ? campaign.status : "sent",
        sent_at: testEmail ? campaign.sent_at : new Date().toISOString(),
        sent_count: 0,
      }).eq("id", campaignId);
      return new Response(JSON.stringify({ ok: true, sent: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!testEmail) {
      await supabase.from("marketing_campaigns").update({ status: "sending" }).eq("id", campaignId);
    }

    let sent = 0, failed = 0;

    for (const r of recipients) {
      const token = await getOrCreateToken(r.email);
      const unsubscribeUrl = `${unsubBase}?token=${token}`;
      const html = renderMarketingHtml({
        subject,
        preheader: campaign.preheader || undefined,
        blocks,
        unsubscribeUrl,
        companyName: "Aquatic Dreams",
        companyAddress: "Aquatic Dreams, Modesto, CA",
        logoUrl: `${SUPABASE_URL}/storage/v1/object/public/email-assets/aqd-email-logo.jpg`,
      });
      const text = renderPlainText({
        subject, preheader: campaign.preheader || undefined, blocks, unsubscribeUrl,
      });

      try {
        const resp = await fetch(`${GATEWAY_URL}/emails`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": RESEND_API_KEY,
          },
          body: JSON.stringify({
            from: fromAddress,
            to: [r.email],
            subject,
            html,
            text,
            reply_to: replyTo,
            headers: {
              "List-Unsubscribe": `<${unsubscribeUrl}>, <mailto:unsubscribe@aquaticdreamsswim.com?subject=unsubscribe>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
            tags: [
              { name: "campaign_id", value: String(campaignId).slice(0, 32) },
              { name: "type", value: testEmail ? "test" : "campaign" },
            ],
          }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data?.message || `Resend ${resp.status}`);

        if (!testEmail) {
          await supabase.from("marketing_campaign_recipients").insert({
            campaign_id: campaignId,
            contact_id: r.id,
            email: r.email,
            status: "sent",
            resend_message_id: data?.id,
            sent_at: new Date().toISOString(),
          });
          if (r.id) {
            await supabase.from("marketing_contacts")
              .update({ last_sent_at: new Date().toISOString() })
              .eq("id", r.id);
          }
        }
        sent++;
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        if (!testEmail) {
          await supabase.from("marketing_campaign_recipients").insert({
            campaign_id: campaignId,
            contact_id: r.id,
            email: r.email,
            status: "failed",
            error: msg,
          });
        }
        console.error("send failed", r.email, msg);
      }
      // gentle throttle to avoid rate limits
      await new Promise((res) => setTimeout(res, 80));
    }

    if (!testEmail) {
      await supabase.from("marketing_campaigns").update({
        status: failed === recipients.length ? "failed" : "sent",
        sent_at: new Date().toISOString(),
        sent_count: sent,
        failed_count: failed,
      }).eq("id", campaignId);
    }

    return new Response(JSON.stringify({ ok: true, sent, failed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("send-marketing-campaign error", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
