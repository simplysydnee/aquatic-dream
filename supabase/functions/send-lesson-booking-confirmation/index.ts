import { createClient } from 'npm:@supabase/supabase-js@2'
import { createStripeClient, type StripeEnv } from '../_shared/stripe.ts'
import { buildCalendarLinks } from '../_shared/calendar-links.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SITE_BASE = 'https://aquaticdreamsswim.com'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const { occurrenceId, environment, siteUrl } = await req.json()
    if (!occurrenceId) {
      return json({ error: 'occurrenceId required' }, 400)
    }

    const { data: occ, error: occErr } = await supabase
      .from('lesson_booking_occurrences')
      .select('*, lesson_bookings(*)')
      .eq('id', occurrenceId)
      .maybeSingle()

    if (occErr || !occ) return json({ error: 'Occurrence not found' }, 404)
    if (occ.payment_status === 'paid') return json({ error: 'Already paid' }, 400)
    if (occ.payment_status === 'comp') return json({ error: 'Comped — no charge' }, 400)

    const booking = (occ as any).lesson_bookings
    if (!booking) return json({ error: 'Parent booking missing' }, 500)

    const price = Number(booking.price_per_session)
    if (!price || price <= 0) return json({ error: 'Invalid price' }, 400)

    const env: StripeEnv = (environment === 'live' ? 'live' : 'sandbox')
    const stripe = createStripeClient(env)
    const returnBase = siteUrl || SITE_BASE
    const lessonTypeLabel = booking.lesson_type === 'private' ? 'Private Lesson' : 'Semi-Private Lesson'

    // Count series occurrences for the email message
    const { count: totalOccurrences } = await supabase
      .from('lesson_booking_occurrences')
      .select('*', { count: 'exact', head: true })
      .eq('booking_id', booking.id)

    const occDate = new Date(occ.occurrence_date + 'T00:00:00')
    const lessonDateLabel = occDate.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    })

    const fmtTime = (t: string) =>
      new Date(`2000-01-01T${t}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    const lessonTimeLabel = `${fmtTime(booking.start_time)} – ${fmtTime(booking.end_time)}`

    // Determine if this is the first occurrence in the series
    const { data: firstOcc } = await supabase
      .from('lesson_booking_occurrences')
      .select('id')
      .eq('booking_id', booking.id)
      .order('occurrence_date', { ascending: true })
      .limit(1)
      .maybeSingle()
    const isFirstOfSeries = firstOcc?.id === occ.id

    // Stripe checkout (hosted, dynamic price_data)
    const checkoutSession = await stripe.checkout.sessions.create({
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${lessonTypeLabel} — ${lessonDateLabel}`,
            description: `${booking.child_name || booking.parent_name} • ${lessonTimeLabel}`,
          },
          unit_amount: Math.round(price * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${returnBase}/?lesson_paid=1`,
      cancel_url: `${returnBase}/`,
      customer_email: booking.parent_email,
      metadata: {
        type: 'lesson_booking_occurrence',
        occurrenceId: occ.id,
        bookingId: booking.id,
      },
    })

    const paymentLink = checkoutSession.url

    // Save link + sent timestamp BEFORE sending the email
    await supabase.from('lesson_booking_occurrences').update({
      stripe_checkout_url: paymentLink,
      stripe_session_id: checkoutSession.id,
      payment_link_sent_at: new Date().toISOString(),
    }).eq('id', occ.id)

    // Build waiver link if booking has a token and isn't signed yet
    const waiverLink = booking.waiver_token && !booking.waiver_signed_at
      ? `${returnBase}/lesson-waiver/${booking.waiver_token}`
      : undefined

    // Send the email
    await supabase.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'lesson-booking-confirmation',
        recipientEmail: booking.parent_email,
        idempotencyKey: `lesson-booking-${occ.id}-${booking.waiver_signed_at ? 'signed' : 'unsigned'}`,
        templateData: {
          parentName: booking.parent_name,
          childName: booking.child_name,
          lessonTypeLabel,
          lessonDate: lessonDateLabel,
          lessonTime: lessonTimeLabel,
          instructorName: booking.instructor_name,
          amountDue: `$${price}`,
          paymentLink,
          isFirstOfSeries,
          totalOccurrences: totalOccurrences || 1,
          waiverLink,
          waiverSigned: !!booking.waiver_signed_at,
        },
      },
    })

    return json({ success: true, paymentLink })
  } catch (e) {
    console.error('send-lesson-booking-confirmation error:', e)
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
