import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Runs daily. Finds session_periods whose start_date is exactly 7 days from
// "today" in Pacific Time, and invokes send-session-welcome-email for each.
// The downstream function uses a per-parent idempotency key, so repeat runs
// won't duplicate sends.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    // Compute today in Pacific and add 7 days as a plain date.
    const todayPT = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date()) // YYYY-MM-DD
    const [y, m, d] = todayPT.split('-').map((n) => parseInt(n, 10))
    const target = new Date(Date.UTC(y, m - 1, d))
    target.setUTCDate(target.getUTCDate() + 7)
    const targetDate = target.toISOString().slice(0, 10)

    const { data: periods, error } = await supabase
      .from('session_periods')
      .select('id, name, start_date')
      .eq('start_date', targetDate)

    if (error) throw error

    const results: any[] = []
    for (const p of periods || []) {
      try {
        const { data, error: invokeErr } = await supabase.functions.invoke(
          'send-session-welcome-email',
          { body: { sessionPeriodId: p.id, environment: 'live' } },
        )
        if (invokeErr) throw invokeErr
        results.push({ period: p.name, id: p.id, ...data })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`welcome-scheduled failed for period ${p.id}:`, message)
        results.push({ period: p.name, id: p.id, error: message })
      }
    }

    return new Response(JSON.stringify({ targetDate, periods: results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('send-session-welcome-scheduled error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
