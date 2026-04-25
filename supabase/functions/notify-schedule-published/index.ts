import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtDate(iso: string) {
  const d = new Date(iso + 'T12:00:00')
  return `${DAY_NAMES[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`
}
function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hr = ((h + 11) % 12) + 1
  return `${hr}:${m.toString().padStart(2, '0')} ${period}`
}
function addDaysISO(iso: string, days: number) {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    const { week_start } = await req.json()
    if (!week_start) {
      return new Response(JSON.stringify({ error: 'week_start required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const week_end = addDaysISO(week_start, 6)

    const [{ data: instructors }, { data: shifts }, { data: positions }] = await Promise.all([
      supabase.from('instructors').select('id, name, email').eq('is_active', true),
      supabase.from('shifts').select('*').gte('shift_date', week_start).lte('shift_date', week_end),
      supabase.from('shift_positions').select('id, name'),
    ])

    const posMap = new Map((positions ?? []).map((p: any) => [p.id, p.name]))
    const weekLabel = fmtDate(week_start)
    let sent = 0

    for (const inst of instructors ?? []) {
      if (!inst.email) continue
      const myShifts = (shifts ?? [])
        .filter((s: any) => s.instructor_id === inst.id)
        .sort((a: any, b: any) =>
          a.shift_date.localeCompare(b.shift_date) || a.start_time.localeCompare(b.start_time))
        .map((s: any) => ({
          date: fmtDate(s.shift_date),
          time: `${fmtTime(s.start_time)} – ${fmtTime(s.end_time)}`,
          position: posMap.get(s.position_id) || undefined,
          notes: s.notes || undefined,
        }))

      await supabase.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'instructor-schedule',
          recipientEmail: inst.email,
          templateData: { instructorName: inst.name, weekLabel, shifts: myShifts },
        },
      })
      sent++
    }

    return new Response(JSON.stringify({ success: true, sent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('notify-schedule-published error', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
