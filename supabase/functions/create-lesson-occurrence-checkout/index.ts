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
    const { occurrenceId, environment, returnUrl } = await req.json()
    if (!occurrenceId) return json({ error: 'occurrenceId required' }, 400)

    const { data: occ, error: occErr } = await supabase
      .from('lesson_booking_occurrences')
      .select('*, lesson_bookings(*)')
      .eq('id', occurrenceId)
      .maybeSingle()

    if (occErr || !occ) return json({ error: 'Occurrence not found' }, 404)
    if (occ.payment_status === 'paid') return json({ error: 'Already paid' }, 400)

    const booking = (occ as any).lesson_bookings
    if (!booking) return json({ error: 'Parent booking missing' }, 500)

    const price = Number(booking.price_per_session)
    if (!price || price <= 0) return json({ error: 'Invalid price' }, 400)

    const env: StripeEnv = environment === 'live' ? 'live' : 'sandbox'
    const stripe = createStripeClient(env)

    const lessonTypeLabel = booking.lesson_type === 'private' ? 'Private Lesson' : 'Semi-Private Lesson'
    const occDate = new Date(occ.occurrence_date + 'T00:00:00')
    const lessonDateLabel = occDate.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    })

    const session = await stripe.checkout.sessions.create({
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${lessonTypeLabel} — ${lessonDateLabel}`,
            description: `${booking.child_name || booking.parent_name}`,
          },
          unit_amount: Math.round(price * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      ui_mode: 'embedded',
      // Stripe enforces a max of 24h on expires_at; use 23h to stay safely under the limit.
      expires_at: Math.floor(Date.now() / 1000) + 23 * 60 * 60,
      return_url: (returnUrl || 'https://aquaticdreamsswim.com/admin') + '?lesson_paid=1&session_id={CHECKOUT_SESSION_ID}',
      customer_email: booking.parent_email || undefined,
      metadata: {
        type: 'lesson_booking_occurrence',
        occurrenceId: occ.id,
        bookingId: booking.id,
      },
    })

    if (!session.client_secret) {
      console.error('Stripe returned no client_secret for lesson occurrence checkout', { sessionId: session.id })
      return json({ error: 'Stripe did not return a client_secret — checkout cannot start' }, 500)
    }

    return json({ clientSecret: session.client_secret })
  } catch (err: any) {
    console.error('create-lesson-occurrence-checkout error', err)
    return json({ error: err?.message || 'Internal error' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
