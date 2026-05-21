import { createClient } from 'npm:@supabase/supabase-js@2'
import { createStripeClient, type StripeEnv } from '../_shared/stripe.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const { enrollmentId, environment, siteUrl, amountOverrideCents } = await req.json()
    if (!enrollmentId) {
      return new Response(JSON.stringify({ error: 'enrollmentId is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const overrideCents = (typeof amountOverrideCents === 'number' && amountOverrideCents >= 50)
      ? Math.round(amountOverrideCents)
      : null

    // Fetch enrollment + session details
    const { data: enrollment, error: enrollErr } = await supabase
      .from('swim_enrollments')
      .select('*, swim_sessions(session_name, day_of_week, start_time, swim_level, session_start_date, session_price)')
      .eq('id', enrollmentId)
      .maybeSingle()

    if (enrollErr || !enrollment) {
      return new Response(JSON.stringify({ error: 'Enrollment not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Session fee = swim_sessions.session_price (default $240).
    // Only send if session_fee_status === 'due_day_1' (already paid or comp shouldn't re-charge).
    if (enrollment.session_fee_status === 'paid') {
      return new Response(JSON.stringify({ error: 'Session fee already paid' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (enrollment.session_fee_status === 'comp') {
      return new Response(JSON.stringify({ error: 'Session fee is comped' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const sessionFee = Number(enrollment.swim_sessions?.session_price ?? 240)
    if (sessionFee <= 0) {
      return new Response(JSON.stringify({ error: 'No session fee due' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Create a hosted Stripe checkout session for the session fee
    const env = (environment || 'sandbox') as StripeEnv
    const stripe = createStripeClient(env)

    let lineItem: any
    let chargeAmount: number

    if (overrideCents !== null) {
      // Admin-specified custom amount — use inline price_data, skip lookup_key.
      chargeAmount = overrideCents / 100
      lineItem = {
        price_data: {
          currency: 'usd',
          product_data: { name: 'Aquatic Dreams — Custom Charge' },
          unit_amount: overrideCents,
        },
        quantity: 1,
      }
    } else {
      const prices = await stripe.prices.list({ lookup_keys: ['swim_session_fee'] })
      if (!prices.data.length) {
        return new Response(JSON.stringify({ error: 'Session fee price not configured in Stripe' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const stripePrice = prices.data[0]
      const stripeAmountDollars = (stripePrice.unit_amount ?? 0) / 100
      if (stripeAmountDollars > 0 && Math.abs(stripeAmountDollars - sessionFee) > 0.01) {
        console.warn(
          `Price drift detected for enrollment ${enrollmentId}: ` +
          `swim_sessions.session_price=$${sessionFee} vs Stripe swim_session_fee=$${stripeAmountDollars}. ` +
          `Charging Stripe amount ($${stripeAmountDollars}); update the DB or rotate the Stripe price to resolve.`
        )
      }
      chargeAmount = stripeAmountDollars > 0 ? stripeAmountDollars : sessionFee
      lineItem = { price: stripePrice.id, quantity: 1 }
    }

    const returnBase = siteUrl || 'https://aquatic-dream-quest.lovable.app'
    const checkoutSession = await stripe.checkout.sessions.create({
      line_items: [lineItem],
      mode: 'payment',
      ui_mode: 'hosted',
      // Stripe enforces a max of 24h on expires_at; use 23h to stay safely under the limit.
      expires_at: Math.floor(Date.now() / 1000) + 23 * 60 * 60,
      success_url: `${returnBase}/swim-enrollment?step=done`,
      cancel_url: `${returnBase}/swim-enrollment`,
      customer_email: enrollment.parent_email,
      metadata: { enrollmentId, type: 'session_fee' },
    })

    const paymentLink = checkoutSession.url
    if (!paymentLink) {
      console.error('Stripe returned no checkout URL', { enrollmentId, sessionId: checkoutSession.id })
      return new Response(JSON.stringify({ error: 'Stripe did not return a checkout URL — payment link not sent' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Send email via transactional email system in the background so the
    // caller (admin UI) gets a fast response. Failures are logged in
    // email_send_log so admins can still see real failures.
    const session = enrollment.swim_sessions
    const sessionInfo = session
      ? `${session.session_name || session.swim_level} — ${session.day_of_week} ${session.start_time}`
      : undefined
    const dueDate = session?.session_start_date
      ? new Date(session.session_start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : undefined

    // Update reminder timestamp before returning so admin UI reflects state.
    await supabase
      .from('swim_enrollments')
      .update({ payment_reminder_sent_at: new Date().toISOString() })
      .eq('id', enrollmentId)

    const sendEmail = async () => {
      try {
        const { error: invokeErr } = await supabase.functions.invoke('send-transactional-email', {
          body: {
            templateName: 'session-payment-link',
            recipientEmail: enrollment.parent_email,
            idempotencyKey: `session-payment-${enrollmentId}-${Date.now()}`,
            templateData: {
              parentName: enrollment.parent_name,
              childName: enrollment.child_name,
              sessionInfo,
              amountDue: `$${chargeAmount}`,
              paymentLink,
              dueDate,
            },
          },
        })
        if (invokeErr) throw invokeErr
      } catch (err) {
        console.error('session-payment-link background email failed:', err)
      }
    }

    // @ts-ignore — EdgeRuntime is provided by the Supabase Edge runtime
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(sendEmail())
    } else {
      sendEmail()
    }

    return new Response(JSON.stringify({ success: true, paymentLink, emailQueued: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error sending payment link:', error)
    const message = error instanceof Error ? error.message : String(error)
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
