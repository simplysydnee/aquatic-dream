import { createClient } from 'npm:@supabase/supabase-js@2'
import { createStripeClient, type StripeEnv } from '../_shared/stripe.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const { enrollmentId, environment } = await req.json()
    if (!enrollmentId) {
      return new Response(JSON.stringify({ error: 'enrollmentId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: enrollment, error } = await supabase
      .from('swim_enrollments')
      .select('id, parent_email, session_fee_status, session_fee_payment_link_id, session_fee_payment_link_url, swim_sessions(session_price)')
      .eq('id', enrollmentId)
      .maybeSingle()

    if (error || !enrollment) {
      return new Response(JSON.stringify({ error: 'Enrollment not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (enrollment.session_fee_status === 'paid' || enrollment.session_fee_status === 'comp') {
      return new Response(JSON.stringify({
        alreadyResolved: true,
        status: enrollment.session_fee_status,
        paymentLink: null,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Reuse existing Payment Link if we already created one
    if (enrollment.session_fee_payment_link_url) {
      return new Response(JSON.stringify({
        paymentLink: enrollment.session_fee_payment_link_url,
        reused: true,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const env = (environment || 'live') as StripeEnv
    const stripe = createStripeClient(env)

    // Use the session's actual price from our DB as the source of truth.
    const sessionPrice = Number((enrollment as any).swim_sessions?.session_price)
    if (!sessionPrice || sessionPrice <= 0) {
      return new Response(JSON.stringify({ error: 'Session price not configured for this enrollment' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const unitAmount = Math.round(sessionPrice * 100)

    // Find-or-create the "Swim Session Fee" product (per Stripe env).
    let productId: string | undefined
    const existingProducts = await stripe.products.search({
      query: "active:'true' AND metadata['lovable_external_id']:'swim_session_fee_product'",
      limit: 1,
    })
    if (existingProducts.data.length) {
      productId = existingProducts.data[0].id
    } else {
      const product = await stripe.products.create({
        name: 'Swim Session Fee',
        metadata: { lovable_external_id: 'swim_session_fee_product' },
      })
      productId = product.id
    }

    // Create a fresh price for this exact amount (Stripe prices are immutable).
    const stripePrice = await stripe.prices.create({
      product: productId!,
      unit_amount: unitAmount,
      currency: 'usd',
      metadata: { enrollmentId, source: 'session_fee' },
    })

    const link = await stripe.paymentLinks.create({
      line_items: [{ price: stripePrice.id, quantity: 1 }],
      metadata: { enrollmentId, type: 'session_fee', amount_usd: String(sessionPrice) },
      payment_intent_data: { metadata: { enrollmentId, type: 'session_fee' } },
      after_completion: {
        type: 'redirect',
        redirect: { url: 'https://aquaticdreamsswim.com/swim-enrollment?step=done' },
      },
    })

    await supabase
      .from('swim_enrollments')
      .update({
        session_fee_payment_link_id: link.id,
        session_fee_payment_link_url: link.url,
      })
      .eq('id', enrollmentId)

    return new Response(JSON.stringify({ paymentLink: link.url, reused: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('get-or-create-session-payment-link error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
