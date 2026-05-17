// Send a Stripe checkout link to the parent for the one-time $45 registration fee.
// The enrollment row stays payment_status='unpaid' until Stripe fires
// checkout.session.completed with metadata.type='registration_fee', at which
// point payments-webhook flips it to 'paid' and stores the pi_... id.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { createStripeClient, type StripeEnv } from '../_shared/stripe.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const REGISTRATION_FEE_CENTS = 4500

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const { enrollmentId, environment, siteUrl, amountOverrideCents } = await req.json()
    if (!enrollmentId) {
      return json({ error: 'enrollmentId is required' }, 400)
    }
    const chargeCents = (typeof amountOverrideCents === 'number' && amountOverrideCents >= 50)
      ? Math.round(amountOverrideCents)
      : REGISTRATION_FEE_CENTS

    const { data: enrollment, error: enrollErr } = await supabase
      .from('swim_enrollments')
      .select(
        '*, swim_sessions(session_name, day_of_week, start_time, swim_level, session_start_date)',
      )
      .eq('id', enrollmentId)
      .maybeSingle()

    if (enrollErr || !enrollment) {
      return json({ error: 'Enrollment not found' }, 404)
    }

    if (!enrollment.is_first_time) {
      return json({ error: 'Registration fee only applies to first-time families' }, 400)
    }
    if (enrollment.payment_status === 'paid') {
      return json({ error: 'Registration fee already paid' }, 400)
    }
    if (enrollment.payment_status === 'comp' || enrollment.payment_status === 'waived') {
      return json({ error: 'Registration fee is comp/waived — nothing to charge' }, 400)
    }

    const env = (environment || 'sandbox') as StripeEnv
    const stripe = createStripeClient(env)

    const returnBase = siteUrl || 'https://aquaticdreamsswim.com'
    const checkoutSession = await stripe.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: 'Aquatic Dreams Registration Fee (one-time)' },
            unit_amount: chargeCents,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      // Stripe enforces a max of 24h on expires_at; use 23h to stay safely under the limit.
      expires_at: Math.floor(Date.now() / 1000) + 23 * 60 * 60,
      success_url: `${returnBase}/swim-enrollment?step=done`,
      cancel_url: `${returnBase}/swim-enrollment`,
      customer_email: enrollment.parent_email,
      metadata: { enrollmentId, type: 'registration_fee' },
    })

    const paymentLink = checkoutSession.url
    const session = enrollment.swim_sessions
    const sessionInfo = session
      ? `${session.session_name || session.swim_level} — ${session.day_of_week} ${session.start_time}`
      : undefined

    // Mark "link sent" before returning so the admin UI immediately reflects state.
    // payment_status stays 'unpaid' — only the webhook flips it on actual payment.
    await supabase
      .from('swim_enrollments')
      .update({ reg_fee_link_sent_at: new Date().toISOString() })
      .eq('id', enrollmentId)

    const waiverLink = enrollment.waiver_token
      ? `${returnBase}/enrollment-waiver/${enrollment.waiver_token}`
      : undefined
    const waiverSigned = !!enrollment.waiver_signed_at

    const sendEmail = async () => {
      try {
        const { error: invokeErr } = await supabase.functions.invoke('send-transactional-email', {
          body: {
            templateName: 'registration-fee-payment-link',
            recipientEmail: enrollment.parent_email,
            idempotencyKey: `reg-fee-${enrollmentId}-${Date.now()}`,
            templateData: {
              parentName: enrollment.parent_name,
              childName: enrollment.child_name,
              sessionInfo,
              amountDue: `$${(chargeCents / 100).toFixed(2)}`,
              paymentLink,
              waiverLink,
              waiverSigned,
            },
          },
        })
        if (invokeErr) throw invokeErr
      } catch (err) {
        console.error('registration-fee-payment-link email failed:', err)
      }
    }

    // @ts-ignore — EdgeRuntime is provided by the Supabase Edge runtime
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(sendEmail())
    } else {
      sendEmail()
    }

    return json({ success: true, paymentLink, emailQueued: true }, 200)
  } catch (error) {
    console.error('send-registration-fee-payment-link error:', error)
    const message = error instanceof Error ? error.message : String(error)
    return json({ error: message }, 500)
  }

  function json(body: unknown, status: number) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
