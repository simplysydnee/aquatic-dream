import { createClient } from 'npm:@supabase/supabase-js@2'
import { createStripeClient, type StripeEnv } from '../_shared/stripe.ts'
import { buildCalendarLinks } from '../_shared/calendar-links.ts'
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

    // Parallelize independent reads — saves ~300-600ms vs sequential awaits.
    const [{ count: totalOccurrences }, { data: firstOcc }] = await Promise.all([
      supabase
        .from('lesson_booking_occurrences')
        .select('*', { count: 'exact', head: true })
        .eq('booking_id', booking.id),
      supabase
        .from('lesson_booking_occurrences')
        .select('id')
        .eq('booking_id', booking.id)
        .order('occurrence_date', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ])

    const occDate = new Date(occ.occurrence_date + 'T00:00:00')
    const lessonDateLabel = occDate.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    })

    const fmtTime = (t: string) =>
      new Date(`2000-01-01T${t}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    const lessonTimeLabel = `${fmtTime(booking.start_time)} – ${fmtTime(booking.end_time)}`

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
      // Stripe enforces a max of 24h on expires_at; use 23h to stay safely under the limit.
      expires_at: Math.floor(Date.now() / 1000) + 23 * 60 * 60,
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

    // Save link + sent timestamp BEFORE returning. The Stripe link is the
    // user's actual deliverable, so we must persist it before responding.
    // IMPORTANT: do NOT write the cs_ session id to stripe_session_id — that
    // column is reserved for the verified payment intent (pi_) written by
    // the webhook on checkout.session.completed.
    await supabase.from('lesson_booking_occurrences').update({
      stripe_checkout_url: paymentLink,
      payment_link_sent_at: new Date().toISOString(),
      payment_link_email_status: 'queued',
      payment_link_email_error: null,
    }).eq('id', occ.id)

    // Build waiver link if booking isn't signed yet — backfill the token
    // when missing so the email's waiver section always renders correctly.
    let waiverToken = booking.waiver_token as string | null
    if (!waiverToken && !booking.waiver_signed_at) {
      waiverToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
      await supabase.from('lesson_bookings').update({ waiver_token: waiverToken }).eq('id', booking.id)
    }
    const waiverLink = waiverToken && !booking.waiver_signed_at
      ? `${returnBase}/lesson-waiver/${waiverToken}`
      : undefined

    // Build "Add to Calendar" links (works on iPhone, Android, Outlook + Google)
    const calTitle = `${booking.child_name || booking.parent_name || 'Swim'} — ${lessonTypeLabel} (Aquatic Dreams)`
    const calDesc = `${lessonTypeLabel} at Aquatic Dreams${booking.instructor_name ? ` with ${booking.instructor_name}` : ''}. Questions? (209) 577-3483 or info@aquaticdreamsswim.com`
    const { icsUrl, googleUrl } = buildCalendarLinks({
      uid: occ.id,
      title: calTitle,
      date: occ.occurrence_date,
      start: booking.start_time,
      end: booking.end_time,
      location: '1212 Kansas Ave, Modesto, CA 95351',
      description: calDesc,
    })

    // Background the email send so the caller gets a fast response.
    // Failure is recorded on the occurrence row + email_send_log so admins
    // can see real failures (no false success).
    const sendEmail = async () => {
      try {
        const { error: invokeErr } = await supabase.functions.invoke('send-transactional-email', {
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
              icsLink: icsUrl,
              googleCalendarLink: googleUrl,
            },
          },
        })
        if (invokeErr) throw invokeErr
        await supabase.from('lesson_booking_occurrences')
          .update({ payment_link_email_status: 'sent', payment_link_email_error: null })
          .eq('id', occ.id)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('background email send failed for occ', occ.id, msg)
        await supabase.from('lesson_booking_occurrences')
          .update({ payment_link_email_status: 'failed', payment_link_email_error: msg })
          .eq('id', occ.id)
      }
    }

    // @ts-ignore — EdgeRuntime is provided by the Supabase Edge runtime
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(sendEmail())
    } else {
      // Fallback (local dev): fire-and-forget
      sendEmail()
    }

    return json({ success: true, paymentLink, emailQueued: true })
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
