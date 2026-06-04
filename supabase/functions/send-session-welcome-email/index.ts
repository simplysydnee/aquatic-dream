import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildMultiEventCalendarLinks } from '../_shared/calendar-links.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const FACILITY_ADDRESS = '1212 Kansas Ave, Modesto, CA 95351'

function fmtTime(t: string | null | undefined): string {
  if (!t) return ''
  const [hh, mm] = t.split(':')
  const h = parseInt(hh, 10)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = ((h + 11) % 12) + 1
  return `${h12}:${mm} ${period}`
}

function fmtDateRange(start: string | null, end: string | null): string {
  if (!start) return ''
  const opts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric' }
  const s = new Date(start + 'T00:00:00').toLocaleDateString('en-US', opts)
  if (!end) return s
  const e = new Date(end + 'T00:00:00').toLocaleDateString('en-US', { ...opts, year: 'numeric' })
  return `${s} – ${e}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const { enrollmentId, sessionPeriodId, environment, dryRun } = await req.json()

    if (!enrollmentId && !sessionPeriodId) {
      return new Response(JSON.stringify({ error: 'enrollmentId or sessionPeriodId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Resolve the target session_period_id
    let targetPeriodId: string | null = sessionPeriodId || null
    if (!targetPeriodId && enrollmentId) {
      const { data: e } = await supabase
        .from('swim_enrollments')
        .select('swim_sessions(session_period_id)')
        .eq('id', enrollmentId)
        .maybeSingle()
      targetPeriodId = (e as any)?.swim_sessions?.session_period_id || null
    }

    if (!targetPeriodId) {
      return new Response(JSON.stringify({ error: 'could not resolve session_period_id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Load ALL enrollments for that session period
    const { data: enrollments, error: enrErr } = await supabase
      .from('swim_enrollments')
      .select('id, parent_name, parent_first_name, parent_last_name, parent_email, child_name, child_first_name, session_id, session_fee_status, status, swim_sessions!inner(session_name, swim_level, day_of_week, start_time, end_time, session_start_date, session_end_date, session_price, session_period_id, session_periods(name))')
      .in('status', ['confirmed','enrolled','pending_payment','pending'])
      .eq('swim_sessions.session_period_id', targetPeriodId)

    if (enrErr) {
      return new Response(JSON.stringify({ error: enrErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!enrollments?.length) {
      return new Response(JSON.stringify({ sent: 0, groups: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Group by parent_email (lowercased)
    const groups = new Map<string, any[]>()
    for (const e of enrollments) {
      const key = (e.parent_email || '').trim().toLowerCase()
      if (!key) continue
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(e)
    }

    // If a specific enrollmentId was requested, narrow to that parent's group only
    let groupEntries = Array.from(groups.entries())
    if (enrollmentId) {
      const requested = enrollments.find((e) => e.id === enrollmentId)
      if (requested) {
        const key = (requested.parent_email || '').trim().toLowerCase()
        groupEntries = groupEntries.filter(([k]) => k === key)
      }
    }

    if (dryRun) {
      return new Response(JSON.stringify({
        dryRun: true,
        groups: groupEntries.map(([email, list]) => ({
          email,
          enrollments: list.map((e) => ({ id: e.id, child: e.child_name })),
        })),
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const results: any[] = []

    for (const [parentEmail, list] of groupEntries) {
      try {
        // Build swimmers[] + combined calendar events
        const swimmers: any[] = []
        const events: any[] = []
        const period = (list[0] as any).swim_sessions?.session_periods
        const periodName = period?.name || 'Session 1'
        let firstStart: string | null = null
        let firstEnd: string | null = null

        for (const e of list) {
          const s: any = e.swim_sessions
          const alreadyPaid = e.session_fee_status === 'paid' || e.session_fee_status === 'comp'
          const swimmerName = e.child_first_name || e.child_name
          const className = s?.session_name || s?.swim_level
          const classDays = s?.day_of_week !== null && s?.day_of_week !== undefined
            ? `${DAY_NAMES[s.day_of_week]}s` : ''
          const classTime = fmtTime(s?.start_time)
          swimmers.push({ swimmerName, className, classDays, classTime, alreadyPaid })

          if (!firstStart) {
            firstStart = s?.session_start_date
            firstEnd = s?.session_end_date
          }

          // Fetch lesson dates for this enrollment's session
          const { data: dates } = await supabase
            .from('session_lesson_dates')
            .select('lesson_date')
            .eq('session_id', e.session_id)
            .eq('is_cancelled', false)
            .order('lesson_date')

          if (dates && s?.start_time && s?.end_time) {
            for (const d of dates) {
              events.push({
                uid: `enroll-${e.id}-${(d as any).lesson_date}`,
                title: `${swimmerName} — ${className || 'Swim Lesson'} (${classTime})`,
                date: (d as any).lesson_date,
                start: s.start_time,
                end: s.end_time,
                location: FACILITY_ADDRESS,
                description: `Aquatic Dreams swim lesson for ${swimmerName}. Questions: info@aquaticdreamsswim.com / (209) 577-3483`,
              })
            }
          }
        }

        // Sort events chronologically (date + start time)
        events.sort((a, b) => {
          if (a.date !== b.date) return a.date < b.date ? -1 : 1
          return a.start < b.start ? -1 : a.start > b.start ? 1 : 0
        })

        let icsLink: string | undefined
        let googleCalendarLink: string | undefined
        if (events.length > 0) {
          const links = buildMultiEventCalendarLinks(events, `welcome-${parentEmail}-${targetPeriodId}`)
          icsLink = links.icsUrl
          googleCalendarLink = links.googleUrl
        }

        // Payment link: pick the first enrollment that still owes the session fee
        const unpaid = list.find(
          (e) => e.session_fee_status !== 'paid' && e.session_fee_status !== 'comp',
        )
        let paymentLink: string | undefined
        let amountDue: string | undefined
        if (unpaid) {
          const { data: linkData, error: linkErr } = await supabase.functions.invoke(
            'get-or-create-session-payment-link',
            { body: { enrollmentId: unpaid.id, environment: environment || 'live' } },
          )
          if (linkErr) {
            console.error('payment link error', linkErr)
          } else {
            paymentLink = linkData?.paymentLink
            const price = (unpaid.swim_sessions as any)?.session_price ?? 240
            amountDue = `$${price}`
          }
        }

        const sample = list[0]
        const familyName = sample.parent_last_name
          || (sample.parent_name?.split(' ').slice(-1)[0])
          || sample.parent_name
          || 'Swim'

        const allPaid = swimmers.every((s) => s.alreadyPaid)

        const templateData = {
          familyName,
          swimmers,
          sessionLabel: periodName,
          sessionDates: fmtDateRange(firstStart, firstEnd),
          totalClasses: '8 classes',
          amountDue,
          paymentLink,
          alreadyPaid: allPaid,
          icsLink,
          googleCalendarLink,
          facilityAddress: FACILITY_ADDRESS,
        }

        const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
        const sendRes = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-transactional-email`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${anonKey}`,
              'apikey': anonKey,
            },
            body: JSON.stringify({
              templateName: 'session-welcome',
              recipientEmail: parentEmail,
              idempotencyKey: `session-welcome-${targetPeriodId}-${parentEmail}`,
              templateData,
            }),
          },
        )
        if (!sendRes.ok) {
          const errText = await sendRes.text()
          throw new Error(`send-transactional-email ${sendRes.status}: ${errText}`)
        }

        await supabase
          .from('swim_enrollments')
          .update({ session_welcome_sent_at: new Date().toISOString() })
          .in('id', list.map((e) => e.id))

        results.push({
          email: parentEmail,
          status: 'sent',
          swimmers: swimmers.length,
          events: events.length,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`welcome email failed for ${parentEmail}:`, message)
        results.push({ email: parentEmail, status: 'failed', error: message })
      }
    }

    const sent = results.filter((r) => r.status === 'sent').length
    return new Response(JSON.stringify({ sent, total: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('send-session-welcome-email error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
