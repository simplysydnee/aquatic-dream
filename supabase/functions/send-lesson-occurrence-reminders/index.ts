import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Cron-invoked. For each unpaid occurrence:
//   - If the lesson is ~24h away and no link sent yet → send the payment link.
//   - If the lesson is today and link was sent >22h ago and still unpaid → flag for admin.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  // Auth gate: only service-role (pg_cron) or a configured CRON_SECRET may invoke.
  const authHeader = req.headers.get('Authorization') || ''
  const bearer = authHeader.replace(/^Bearer\s+/i, '')
  const cronSecret = Deno.env.get('CRON_SECRET')
  const providedSecret = req.headers.get('x-cron-secret') || ''
  const isServiceRole = !!bearer && bearer === SERVICE_ROLE
  const isCronSecret = !!cronSecret && providedSecret === cronSecret
  if (!isServiceRole && !isCronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    SERVICE_ROLE,
  )

  try {
    // "Tomorrow" in Pacific Time
    const now = new Date()
    const ptNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
    const tomorrow = new Date(ptNow)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toISOString().slice(0, 10)
    const todayStr = ptNow.toISOString().slice(0, 10)

    let sent = 0
    let flagged = 0

    // 1) Send links for tomorrow's unpaid occurrences without a link yet
    const { data: dueSoon, error: dueSoonErr } = await supabase
      .from('lesson_booking_occurrences')
      .select('id, payment_link_sent_at, payment_status, occurrence_date, lesson_bookings!inner(status)')
      .eq('occurrence_date', tomorrowStr)
      .in('payment_status', ['unpaid'])
      .is('payment_link_sent_at', null)

    if (dueSoonErr) console.error('dueSoon query error:', dueSoonErr)

    for (const occ of dueSoon || []) {
      if ((occ as any).lesson_bookings?.status !== 'active') continue
      try {
        const { error } = await supabase.functions.invoke('send-lesson-booking-confirmation', {
          body: { occurrenceId: occ.id, environment: 'live' },
        })
        if (error) {
          console.error('send link failed for', occ.id, error)
        } else {
          sent++
        }
      } catch (e) {
        console.error('send link exception for', occ.id, e)
      }
    }

    // 2) Flag any still-unpaid occurrence whose lesson is today and the link was sent >22h ago
    const cutoff = new Date(Date.now() - 22 * 3600 * 1000).toISOString()
    const { data: toFlag, error: flagErr } = await supabase
      .from('lesson_booking_occurrences')
      .select('id')
      .eq('occurrence_date', todayStr)
      .eq('payment_status', 'unpaid')
      .not('payment_link_sent_at', 'is', null)
      .lt('payment_link_sent_at', cutoff)

    if (flagErr) console.error('flag query error:', flagErr)

    if (toFlag && toFlag.length > 0) {
      const ids = toFlag.map((r) => r.id)
      const { error: updErr } = await supabase
        .from('lesson_booking_occurrences')
        .update({ payment_status: 'flagged_no_pay', reminder_attempted_at: new Date().toISOString() })
        .in('id', ids)
      if (updErr) console.error('flag update error:', updErr)
      else flagged = ids.length
    }

    return new Response(JSON.stringify({ ok: true, sent, flagged }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('reminder cron error:', e)
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
