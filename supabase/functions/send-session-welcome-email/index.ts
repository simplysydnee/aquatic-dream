import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

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

    // Resolve enrollments to send
    let enrollmentQ = supabase
      .from('swim_enrollments')
      .select('id, parent_name, parent_first_name, parent_last_name, parent_email, child_name, child_first_name, session_id, session_fee_status, status, swim_sessions!inner(session_name, swim_level, day_of_week, start_time, session_start_date, session_end_date, session_price, session_period_id, session_periods(name))')
      .in('status', ['confirmed','enrolled','pending_payment','pending'])

    if (enrollmentId) {
      enrollmentQ = enrollmentQ.eq('id', enrollmentId)
    } else {
      enrollmentQ = enrollmentQ.eq('swim_sessions.session_period_id', sessionPeriodId)
    }

    const { data: enrollments, error: enrErr } = await enrollmentQ
    if (enrErr) {
      return new Response(JSON.stringify({ error: enrErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!enrollments?.length) {
      return new Response(JSON.stringify({ sent: 0, enrollments: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (dryRun) {
      return new Response(JSON.stringify({
        dryRun: true,
        count: enrollments.length,
        recipients: enrollments.map(e => ({ id: e.id, email: e.parent_email, child: e.child_name })),
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const results: any[] = []

    for (const e of enrollments) {
      try {
        const session: any = e.swim_sessions
        const alreadyPaid = e.session_fee_status === 'paid' || e.session_fee_status === 'comp'

        let paymentLink: string | null = null
        if (!alreadyPaid) {
          const { data: linkData, error: linkErr } = await supabase.functions.invoke(
            'get-or-create-session-payment-link',
            { body: { enrollmentId: e.id, environment: environment || 'live' } },
          )
          if (linkErr) throw new Error(`payment link: ${linkErr.message}`)
          paymentLink = linkData?.paymentLink || null
        }

        const familyName = e.parent_last_name
          || (e.parent_name?.split(' ').slice(-1)[0])
          || e.parent_name
          || 'Swim'

        const amount = Number(session?.session_price ?? 240)
        const sessionLabel = session?.session_periods?.name || 'Session 1'

        const templateData = {
          familyName,
          swimmerName: e.child_first_name || e.child_name,
          className: session?.session_name || session?.swim_level,
          classDays: session?.day_of_week ? `${DAY_NAMES[session.day_of_week]}s` : '',
          classTime: fmtTime(session?.start_time),
          sessionDates: fmtDateRange(session?.session_start_date, session?.session_end_date),
          sessionLabel,
          totalClasses: '8 classes',
          amountDue: `$${amount}`,
          paymentLink: paymentLink || undefined,
          alreadyPaid,
        }

        const { error: sendErr } = await supabase.functions.invoke('send-transactional-email', {
          body: {
            templateName: 'session-welcome',
            recipientEmail: e.parent_email,
            idempotencyKey: `session-welcome-${e.id}`,
            templateData,
          },
        })
        if (sendErr) throw sendErr

        await supabase
          .from('swim_enrollments')
          .update({ session_welcome_sent_at: new Date().toISOString() })
          .eq('id', e.id)

        results.push({ id: e.id, email: e.parent_email, status: 'sent', alreadyPaid })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`welcome email failed for ${e.id}:`, message)
        results.push({ id: e.id, email: e.parent_email, status: 'failed', error: message })
      }
    }

    const sent = results.filter(r => r.status === 'sent').length
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
