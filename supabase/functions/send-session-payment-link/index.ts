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
    const {
      enrollmentId,
      environment,
      siteUrl,
      amountOverrideCents,
      includeWaiverLink,
    } = await req.json()
    if (!enrollmentId) {
      return new Response(JSON.stringify({ error: 'enrollmentId is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const overrideCents = (typeof amountOverrideCents === 'number' && amountOverrideCents >= 50)
      ? Math.round(amountOverrideCents)
      : null

    // Fetch enrollment + session details
    const { data: enrollment, error: enrErr } = await supabase
      .from('swim_enrollments')
      .select('*, swim_sessions(session_name, day_of_week, start_time, swim_level, session_start_date, session_price)')
      .eq('id', enrollmentId)
      .maybeSingle()

    if (enrErr || !enrollment) {
      return new Response(JSON.stringify({ error: 'Enrollment not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

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

    const defaultSessionFee = Number(enrollment.swim_sessions?.session_price ?? 240)
    if (!overrideCents && defaultSessionFee <= 0) {
      return new Response(JSON.stringify({ error: 'No session fee due' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const env = (environment || 'sandbox') as StripeEnv
    const stripe = createStripeClient(env)

    // Always build the line item with inline price_data from DB-driven amount.
    // This is the SINGLE source of truth — the email body and the Stripe
    // charge always show the same number.
    const chargeCents = overrideCents ?? Math.round(defaultSessionFee * 100)
    const chargeAmount = chargeCents / 100

    // Compute a friendly proration note if admin used an override below full.
    let prorationNote: string | undefined
    if (overrideCents && chargeAmount < defaultSessionFee) {
      const lessons = Math.round(chargeAmount / 30)
      if (lessons > 0 && lessons * 30 === chargeAmount) {
        prorationNote = `Prorated for ${lessons} remaining lesson${lessons === 1 ? '' : 's'} (${lessons} × $30).`
      } else {
        prorationNote = `Adjusted amount for remaining lessons in this session.`
      }
    }

    const lineItem = {
      price_data: {
        currency: 'usd',
        product_data: {
          name: overrideCents
            ? 'Aquatic Dreams — Swim Session Fee (Prorated)'
            : 'Aquatic Dreams — Swim Session Fee',
        },
        unit_amount: chargeCents,
      },
      quantity: 1,
    }

    const returnBase = siteUrl || 'https://aquaticdreamsswim.com'
    let paymentLink: string | undefined
    try {
      const checkoutSession = await stripe.checkout.sessions.create({
        line_items: [lineItem],
        mode: 'payment',
        ui_mode: 'hosted_page',
        expires_at: Math.floor(Date.now() / 1000) + 23 * 60 * 60,
        success_url: `${returnBase}/swim-enrollment?step=done`,
        cancel_url: `${returnBase}/swim-enrollment`,
        customer_email: enrollment.parent_email,
        payment_intent_data: {
          description: 'Aquatic Dreams — Swim Session Fee',
          metadata: { enrollmentId, type: 'session_fee' },
        },
        metadata: { enrollmentId, type: 'session_fee' },
      })
      paymentLink = checkoutSession?.url || undefined
    } catch (stripeErr) {
      const msg = stripeErr instanceof Error ? stripeErr.message : String(stripeErr)
      console.error('Stripe checkout creation failed:', msg)
      return new Response(JSON.stringify({ error: `Stripe checkout failed: ${msg}` }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!paymentLink) {
      return new Response(JSON.stringify({ error: 'Stripe returned no checkout URL' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Optionally generate / reuse the waiver-signing link.
    let waiverLink: string | undefined
    if (includeWaiverLink === true && !enrollment.waiver_signed_at) {
      let token = (enrollment as any).waiver_token as string | null
      if (!token) {
        token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
        const { error: tokErr } = await supabase
          .from('swim_enrollments')
          .update({ waiver_token: token })
          .eq('id', enrollmentId)
        if (tokErr) {
          console.warn('Could not assign waiver token:', tokErr.message)
          token = null
        }
      }
      if (token) waiverLink = `${returnBase}/enrollment-waiver/${token}`
    }

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

    const amountDueStr = chargeAmount % 1 === 0 ? `$${chargeAmount}` : `$${chargeAmount.toFixed(2)}`

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
              amountDue: amountDueStr,
              paymentLink,
              dueDate,
              waiverLink,
              prorationNote,
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

    return new Response(JSON.stringify({
      success: true,
      paymentLink,
      waiverLink,
      amount: chargeAmount,
      emailQueued: true,
    }), {
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
