import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

interface ChildPayload {
  level: string;
  childName: string;
  childAge: number;
  childDob: string | null;
  sessionIds: string[];
  isFirstTime: boolean;
  /** First-timers only: pay the full session fee at checkout instead of day 1. */
  payAhead?: boolean;
  parentName: string;
  parentEmail: string;
  parentPhone: string | null;
  medicalNotes: string | null;
  notes: string | null;
  agreement: {
    waiverAccepted: boolean;
    photoReleaseAccepted: boolean;
    privacyPolicyAccepted: boolean;
    termsAccepted: boolean;
    signatureText: string;
    emergencyContactName: string;
    emergencyContactPhone: string;
    emergencyContactRelationship: string;
  };
}

interface CheckoutPayload {
  children: ChildPayload[];
  signerIp: string | null;
  versions: { waiver: string; tos: string; privacy: string };
}

const REGISTRATION_FEE_CENTS = 4500;

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { payload, customerEmail, returnUrl, environment } = await req.json();

    // Validate payload
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.children) || payload.children.length === 0) {
      console.error("[create-checkout] invalid payload", { customerEmail, hasPayload: !!payload });
      return new Response(JSON.stringify({ error: "Invalid payload: children required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[create-checkout] start", {
      parentEmail: customerEmail ?? payload.children[0]?.parentEmail,
      environment,
      children: payload.children.map((c: { childName?: string; isFirstTime?: boolean; sessionIds?: string[] }) => ({
        childName: c.childName,
        isFirstTime: c.isFirstTime,
        sessionIds: c.sessionIds,
      })),
    });

    const typedPayload = payload as CheckoutPayload;

    // Collect & validate session IDs
    const allSessionIds: string[] = [];
    for (const child of typedPayload.children) {
      if (!Array.isArray(child.sessionIds) || child.sessionIds.length === 0) {
        return new Response(JSON.stringify({ error: "Each child must have at least one session" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      for (const sid of child.sessionIds) {
        if (typeof sid !== "string" || !uuidRe.test(sid)) {
          return new Response(JSON.stringify({ error: `Invalid session id: ${sid}` }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        allSessionIds.push(sid);
      }
    }
    const uniqueSessionIds = [...new Set(allSessionIds)];

    // Fetch sessions
    const { data: sessions, error: sessErr } = await supabaseAdmin
      .from("swim_sessions")
      .select("id, max_students, session_price, session_start_date, price_per_lesson, total_lessons")
      .in("id", uniqueSessionIds);

    if (sessErr || !sessions || sessions.length !== uniqueSessionIds.length) {
      console.error("[create-checkout] sessions not found", { sessErr, uniqueSessionIds, found: sessions?.length });
      return new Response(JSON.stringify({ error: "One or more sessions not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Count remaining (non-cancelled, future) lesson dates per session.
    // Today is computed in America/Los_Angeles to match how lesson_dates
    // are managed in the admin UI.
    const todayPT = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    const { data: lessonDates } = await supabaseAdmin
      .from("session_lesson_dates")
      .select("session_id, lesson_date")
      .in("session_id", uniqueSessionIds)
      .eq("is_cancelled", false)
      .gte("lesson_date", todayPT);
    const remainingMap: Record<string, number> = {};
    (lessonDates || []).forEach((d: any) => {
      remainingMap[d.session_id] = (remainingMap[d.session_id] || 0) + 1;
    });

    // Compute effective (prorated) charge per session in cents.
    const sessionChargeCents: Record<string, number> = {};
    const sessionStarted: Record<string, boolean> = {};
    for (const s of sessions) {
      const totalLessons = Number(s.total_lessons) || 8;
      const perLesson = Number(s.price_per_lesson) || 30;
      const fullDollars = Number(s.session_price) || (totalLessons * perLesson);
      const remaining = remainingMap[s.id] ?? totalLessons;
      if (remaining <= 0) {
        return new Response(JSON.stringify({ error: `Session ${s.id} has no remaining classes` }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const started = remaining < totalLessons;
      const dollars = started
        ? Math.min(remaining * perLesson, fullDollars)
        : fullDollars;
      sessionChargeCents[s.id] = Math.round(dollars * 100);
      sessionStarted[s.id] = started;
    }

    // Server-side capacity check — only confirmed rows count
    const { data: existingEnrollments } = await supabaseAdmin
      .from("swim_enrollments")
      .select("session_id")
      .in("session_id", uniqueSessionIds)
      .eq("status", "confirmed");

    const countMap: Record<string, number> = {};
    existingEnrollments?.forEach((e) => {
      if (e.session_id) countMap[e.session_id] = (countMap[e.session_id] || 0) + 1;
    });

    // Count how many seats this checkout would consume per session
    const requestedMap: Record<string, number> = {};
    for (const child of typedPayload.children) {
      for (const sid of child.sessionIds) {
        requestedMap[sid] = (requestedMap[sid] || 0) + 1;
      }
    }

    const sessionMap = Object.fromEntries(sessions.map((s) => [s.id, s]));
    for (const sid of uniqueSessionIds) {
      const s = sessionMap[sid];
      const used = countMap[sid] || 0;
      const wanted = requestedMap[sid] || 0;
      if (used + wanted > s.max_students) {
        return new Response(JSON.stringify({ error: `Session ${sid} is full` }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Build line items from DB-truth using INLINE price_data.
    // The database (swim_sessions.session_price + 45 reg fee) is the SINGLE
    // source of truth. We do NOT use Stripe lookup_keys, because a Stripe
    // price object that drifts from session_price would silently overcharge.
    //
    // RULE (per business owner): No Stripe = no enrollment row.
    //   - Returning child: charge the full session_price per enrolled session row.
    //   - First-time child + payAhead=false (default): charge ONLY the $45 reg fee.
    //                       Session fee collected in person on day 1.
    //   - First-time child + payAhead=true: charge $45 reg fee + the session_price.
    //   - First-time child whose session has ALREADY STARTED: server forces
    //                       payAhead=true and uses the prorated session charge.
    //                       There's no day-1 to collect in person.
    type LineItem = {
      price_data: {
        currency: string;
        product_data: { name: string };
        unit_amount: number;
      };
      quantity: number;
    };
    const lineItems: LineItem[] = [];

    const env = (environment || "sandbox") as StripeEnv;
    const stripe = createStripeClient(env);

    for (const child of typedPayload.children) {
      // Force pay-ahead if any of this child's sessions has already started.
      const childHasStartedSession = child.sessionIds.some((sid) => sessionStarted[sid]);
      const effectivePayAhead = child.isFirstTime && (child.payAhead || childHasStartedSession);

      if (child.isFirstTime) {
        lineItems.push({
          price_data: {
            currency: "usd",
            product_data: { name: `Registration fee — ${child.childName}` },
            unit_amount: REGISTRATION_FEE_CENTS,
          },
          quantity: 1,
        });
        if (effectivePayAhead) {
          for (const sid of child.sessionIds) {
            const s = sessionMap[sid];
            const cents = sessionChargeCents[sid];
            const label = sessionStarted[sid] ? "Prorated session fee" : "Session fee";
            lineItems.push({
              price_data: {
                currency: "usd",
                product_data: { name: `${label} — ${child.childName} (${s.session_start_date ?? ""})` },
                unit_amount: cents,
              },
              quantity: 1,
            });
          }
        }
      } else {
        for (const sid of child.sessionIds) {
          const s = sessionMap[sid];
          const cents = sessionChargeCents[sid];
          const label = sessionStarted[sid] ? "Prorated session fee" : "Session fee";
          lineItems.push({
            price_data: {
              currency: "usd",
              product_data: { name: `${label} — ${child.childName} (${s.session_start_date ?? ""})` },
              unit_amount: cents,
            },
            quantity: 1,
          });
        }
      }
    }

    if (lineItems.length === 0) {
      return new Response(JSON.stringify({ error: "No line items to charge" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Defensive guard: a session line item must match either the full DB
    // session_price OR the prorated (remaining-lessons × price_per_lesson)
    // charge we computed above. Anything else is refused.
    const allowedSessionCents = new Set<number>(Object.values(sessionChargeCents));
    for (const li of lineItems) {
      const amt = li.price_data.unit_amount;
      const looksLikeSessionFee =
        li.price_data.product_data.name.startsWith("Session fee") ||
        li.price_data.product_data.name.startsWith("Prorated session fee");
      if (looksLikeSessionFee && !allowedSessionCents.has(amt)) {
        console.error("Session fee unit_amount does not match any computed charge", amt);
        return new Response(JSON.stringify({ error: "Session fee mismatch — refusing to charge" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }


    // Stage payload in pending_enrollments RIGHT BEFORE creating the Stripe session.
    // This minimizes the window during which temporary data exists.
    const { data: pending, error: pendingErr } = await supabaseAdmin
      .from("pending_enrollments")
      .insert({
        payload: typedPayload as unknown as Record<string, unknown>,
        customer_email: customerEmail || typedPayload.children[0].parentEmail,
      })
      .select("id")
      .single();

    if (pendingErr || !pending) {
      console.error("Failed to stage pending enrollment:", pendingErr);
      return new Response(JSON.stringify({ error: "Failed to start checkout" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const session = await stripe.checkout.sessions.create({
      line_items: lineItems,
      mode: "payment",
      ui_mode: "embedded_page",
      // Exclude Stripe Link to avoid the "Confirm it's you" SMS step
      // and the iframe "Something went wrong" loop some parents hit.
      payment_method_types: ["card"],
      return_url:
        returnUrl ||
        `${req.headers.get("origin")}/swim-enrollment?step=done&session_id={CHECKOUT_SESSION_ID}`,
      ...(customerEmail && { customer_email: customerEmail }),
      metadata: { pendingEnrollmentId: pending.id },
    });

    if (!session.client_secret) {
      console.error("Stripe returned no client_secret. Full session:", JSON.stringify(session));
      const gatewayErr = (session as any)?.message || (session as any)?.error?.message;
      const detail = gatewayErr
        ? `Stripe/gateway error: ${gatewayErr}`
        : "Stripe did not return a client_secret — checkout cannot start";
      return new Response(
        JSON.stringify({ error: detail }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ clientSecret: session.client_secret }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("create-checkout error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
