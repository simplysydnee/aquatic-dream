import { createClient } from 'npm:@supabase/supabase-js@2'
import { createStripeClient, type StripeEnv } from '../_shared/stripe.ts'
import { getPrivateLessonPrice } from '../_shared/private-lesson-pricing.ts'
import { buildSessionCalendarLinks } from '../_shared/calendar-links.ts'
import { requireAdminOrServiceRole } from '../_shared/auth-guard.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SITE_BASE = 'https://aquaticdreamsswim.com'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const guard = await requireAdminOrServiceRole(req)
  if (!guard.ok) {
    return new Response(JSON.stringify({ error: guard.error }), {
      status: guard.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const { bookingId, environment, siteUrl } = await req.json()
    if (!bookingId) return json({ error: 'bookingId required' }, 400)

    const { data: booking, error: bErr } = await supabase
      .from('lesson_bookings')
      .select('*')
      .eq('id', bookingId)
      .maybeSingle()
    if (bErr || !booking) return json({ error: 'Booking not found' }, 404)

    const { data: occs, error: oErr } = await supabase
      .from('lesson_booking_occurrences')
      .select('*')
      .eq('booking_id', bookingId)
      .neq('payment_status', 'paid')
      .neq('payment_status', 'comp')
      .order('occurrence_date', { ascending: true })
    if (oErr) return json({ error: oErr.message }, 500)
    if (!occs || occs.length === 0) return json({ error: 'No unpaid occurrences' }, 400)

    // Promo-aware per-occurrence pricing. Each occurrence resolves independently
    // (Summer Special $50 vs regular $65 for private; semi-private always $45),
    // so a mixed-date series totals correctly.
    const perPrices = occs.map((o: any) => Number(getPrivateLessonPrice(booking.lesson_type, o.occurrence_date)))
    if (perPrices.some((p) => !p || p <= 0)) return json({ error: 'Invalid price' }, 400)
    const total = perPrices.reduce((s, p) => s + p, 0)

    const env: StripeEnv = environment === 'live' ? 'live' : 'sandbox'
    const stripe = createStripeClient(env)
    const returnBase = siteUrl || SITE_BASE
    const lessonTypeLabel = booking.lesson_type === 'private' ? 'Private Lesson' : 'Semi-Private Lesson'

    const fmtTime = (t: string) =>
      new Date(`2000-01-01T${t}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    const fmtDate = (d: string) =>
      new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

    const firstDateLabel = new Date(occs[0].occurrence_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    const lastDateLabel = new Date(occs[occs.length - 1].occurrence_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    const lessonTimeLabel = `${fmtTime(booking.start_time)} – ${fmtTime(booking.end_time)}`

    const checkoutSession = await stripe.checkout.sessions.create({
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${lessonTypeLabel} Series — ${occs.length} lessons`,
            description: `${booking.child_name || booking.parent_name} • ${firstDateLabel} – ${lastDateLabel} • ${lessonTimeLabel}`,
          },
          unit_amount: Math.round(price * 100),
        },
        quantity: occs.length,
      }],
      mode: 'payment',
      // Stripe default expiry is 24h; extend to the 30-day max so emailed
      // links don't go stale before the parent gets to them.
      // Stripe enforces a max of 24h; use 23h to stay safely under the limit
      expires_at: Math.floor(Date.now() / 1000) + 23 * 60 * 60,
      success_url: `${returnBase}/?lesson_paid=1`,
      cancel_url: `${returnBase}/`,
      customer_email: booking.parent_email,
      metadata: {
        type: 'lesson_booking_series',
        bookingId: booking.id,
      },
    })

    const paymentLink = checkoutSession.url

    // Stamp every unpaid occurrence with the same series checkout URL.
    // IMPORTANT: do NOT write the cs_ session id to stripe_session_id —
    // that column is reserved for the verified pi_ PaymentIntent written
    // by payments-webhook on checkout.session.completed.
    const occIds = occs.map((o: any) => o.id)
    await supabase.from('lesson_booking_occurrences').update({
      stripe_checkout_url: paymentLink,
      payment_link_sent_at: new Date().toISOString(),
      payment_link_email_status: 'queued',
      payment_link_email_error: null,
    }).in('id', occIds)

    // Backfill waiver_token if missing AND not yet signed, so the email
    // can always render the "Sign Waiver" button when needed.
    let waiverToken = booking.waiver_token as string | null
    if (!waiverToken && !booking.waiver_signed_at) {
      waiverToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
      await supabase.from('lesson_bookings').update({ waiver_token: waiverToken }).eq('id', booking.id)
    }
    const waiverLink = waiverToken && !booking.waiver_signed_at
      ? `${returnBase}/lesson-waiver/${waiverToken}`
      : undefined

    // ICS with all dates
    const calTitle = `${booking.child_name || booking.parent_name || 'Swim'} — ${lessonTypeLabel} (Aquatic Dreams)`
    const calDesc = `${lessonTypeLabel} at Aquatic Dreams${booking.instructor_name ? ` with ${booking.instructor_name}` : ''}. Questions? (209) 577-3483 or info@aquaticdreamsswim.com`
    const { icsUrl, googleUrl } = buildSessionCalendarLinks({
      uid: `series-${booking.id}`,
      title: calTitle,
      dates: occs.map((o: any) => o.occurrence_date),
      start: booking.start_time,
      end: booking.end_time,
      location: '1212 Kansas Ave, Modesto, CA 95351',
      description: calDesc,
    })

    const scheduleList = occs.map((o: any) => ({
      date: fmtDate(o.occurrence_date),
      time: lessonTimeLabel,
    }))

    const sendEmail = async () => {
      try {
        const { error: invokeErr } = await supabase.functions.invoke('send-transactional-email', {
          body: {
            templateName: 'lesson-booking-confirmation',
            recipientEmail: booking.parent_email,
            idempotencyKey: `lesson-series-${booking.id}-${booking.waiver_signed_at ? 'signed' : 'unsigned'}`,
            templateData: {
              parentName: booking.parent_name,
              childName: booking.child_name,
              lessonTypeLabel,
              instructorName: booking.instructor_name,
              paymentLink,
              waiverLink,
              waiverSigned: !!booking.waiver_signed_at,
              icsLink: icsUrl,
              googleCalendarLink: googleUrl,
              seriesMode: true,
              totalAmountDue: `$${total.toFixed(2)}`,
              totalOccurrences: occs.length,
              scheduleList,
              lessonTime: lessonTimeLabel,
            },
          },
        })
        if (invokeErr) throw invokeErr
        await supabase.from('lesson_booking_occurrences')
          .update({ payment_link_email_status: 'sent', payment_link_email_error: null })
          .in('id', occIds)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('background series email send failed for booking', booking.id, msg)
        await supabase.from('lesson_booking_occurrences')
          .update({ payment_link_email_status: 'failed', payment_link_email_error: msg })
          .in('id', occIds)
      }
    }

    // @ts-ignore — EdgeRuntime is provided by the Supabase Edge runtime
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(sendEmail())
    } else {
      sendEmail()
    }

    return json({ success: true, paymentLink, count: occs.length, emailQueued: true })
  } catch (e) {
    console.error('send-lesson-series-confirmation error:', e)
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
