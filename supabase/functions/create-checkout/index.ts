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
      return new Response(JSON.stringify({ error: "Invalid payload: children required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      .select("id, max_students, session_price, session_start_date")
      .in("id", uniqueSessionIds);

    if (sessErr || !sessions || sessions.length !== uniqueSessionIds.length) {
      return new Response(JSON.stringify({ error: "One or more sessions not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      if (child.isFirstTime) {
        lineItems.push({
          price_data: {
            currency: "usd",
            product_data: { name: `Registration fee — ${child.childName}` },
            unit_amount: REGISTRATION_FEE_CENTS,
          },
          quantity: 1,
        });
        if (child.payAhead) {
          for (const sid of child.sessionIds) {
            const s = sessionMap[sid];
            const cents = Math.round(Number(s.session_price ?? 240) * 100);
            lineItems.push({
              price_data: {
                currency: "usd",
                product_data: { name: `Session fee — ${child.childName} (${s.session_start_date ?? ""})` },
                unit_amount: cents,
              },
              quantity: 1,
            });
          }
        }
      } else {
        for (const sid of child.sessionIds) {
          const s = sessionMap[sid];
          const cents = Math.round(Number(s.session_price ?? 240) * 100);
          lineItems.push({
            price_data: {
              currency: "usd",
              product_data: { name: `Session fee — ${child.childName} (${s.session_start_date ?? ""})` },
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

    // Defensive guard: never charge a session fee unit_amount that doesn't
    // match what's in the DB. Catches any future regression that re-introduces
    // a price drift.
    for (const li of lineItems) {
      const amt = li.price_data.unit_amount;
      const looksLikeSessionFee = li.price_data.product_data.name.startsWith("Session fee");
      if (looksLikeSessionFee) {
        const matches = sessions.some((s) => Math.round(Number(s.session_price ?? 240) * 100) === amt);
        if (!matches) {
          console.error("Session fee unit_amount does not match any DB session_price", amt);
          return new Response(JSON.stringify({ error: "Session fee mismatch — refusing to charge" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
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
      return_url:
        returnUrl ||
        `${req.headers.get("origin")}/swim-enrollment?step=done&session_id={CHECKOUT_SESSION_ID}`,
      ...(customerEmail && { customer_email: customerEmail }),
      metadata: { pendingEnrollmentId: pending.id },
    });

    if (!session.client_secret) {
      console.error("Stripe returned no client_secret for embedded checkout", { sessionId: session.id });
      return new Response(
        JSON.stringify({ error: "Stripe did not return a client_secret — checkout cannot start" }),
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
