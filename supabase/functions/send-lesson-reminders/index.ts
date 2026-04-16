import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Get tomorrow's date in Pacific Time
  const now = new Date()
  const pacificFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  // Add 1 day to get tomorrow
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const tomorrowStr = pacificFormatter.format(tomorrow) // YYYY-MM-DD

  console.log('Checking lesson reminders for:', tomorrowStr)

  // Find all lesson dates for tomorrow that aren't cancelled
  const { data: lessonDates, error: datesError } = await supabase
    .from('session_lesson_dates')
    .select('session_id, lesson_date')
    .eq('lesson_date', tomorrowStr)
    .eq('is_cancelled', false)

  if (datesError) {
    console.error('Failed to fetch lesson dates', datesError)
    return new Response(JSON.stringify({ error: 'Failed to fetch lesson dates' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!lessonDates || lessonDates.length === 0) {
    console.log('No lessons tomorrow')
    return new Response(JSON.stringify({ sent: 0 }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const sessionIds = [...new Set(lessonDates.map(d => d.session_id))]

  // Fetch session details
  const { data: sessions } = await supabase
    .from('swim_sessions')
    .select('id, day_of_week, start_time, end_time, swim_level, session_period_id, age_group')
    .in('id', sessionIds)

  const sessionMap = new Map(sessions?.map(s => [s.id, s]) || [])

  // Fetch period names
  const periodIds = [...new Set(sessions?.map(s => s.session_period_id).filter(Boolean) as string[])]
  let periodMap = new Map<string, string>()
  if (periodIds.length > 0) {
    const { data: periods } = await supabase
      .from('session_periods')
      .select('id, name')
      .in('id', periodIds)
    periodMap = new Map(periods?.map(p => [p.id, p.name]) || [])
  }

  // Find enrolled swimmers for these sessions
  const { data: enrollments, error: enrollError } = await supabase
    .from('swim_enrollments')
    .select('id, parent_name, parent_email, child_name, child_age, swim_level, session_id')
    .in('session_id', sessionIds)
    .in('status', ['enrolled', 'confirmed'])

  if (enrollError) {
    console.error('Failed to fetch enrollments', enrollError)
    return new Response(JSON.stringify({ error: 'Failed to fetch enrollments' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!enrollments || enrollments.length === 0) {
    console.log('No enrollments for tomorrow\'s sessions')
    return new Response(JSON.stringify({ sent: 0 }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Format the lesson date for display
  const lessonDateObj = new Date(tomorrowStr + 'T00:00:00')
  const formattedDate = lessonDateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  // Helper to get level label
  function getLevelLabel(level: string, age: number): string {
    const ageGroup = age <= 5 ? 'preschool' : 'school-age'
    if (ageGroup === 'preschool') {
      if (level === 'white') return 'Little Fins — Preschool 1 (White)'
      if (level === 'red') return 'Reef Explorers — Preschool 2 (Red)'
    }
    if (level === 'yellow') return 'Sea Scouts — School Age 1 (Yellow)'
    if (level === 'blue') return 'Deep Sea Divers — School Age 2 (Blue)'
    if (level === 'green') return 'Ocean Masters — School Age 3 (Green)'
    return level
  }

  let sentCount = 0

  for (const enrollment of enrollments) {
    const session = sessionMap.get(enrollment.session_id!)
    if (!session) continue

    const idempotencyKey = `lesson-reminder-${enrollment.id}-${tomorrowStr}`

    // Format time
    const startTime = session.start_time?.slice(0, 5)
    const formattedTime = startTime
      ? new Date(`2000-01-01T${startTime}`).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })
      : undefined

    const periodName = session.session_period_id ? periodMap.get(session.session_period_id) : undefined

    const templateData = {
      parentName: enrollment.parent_name,
      childName: enrollment.child_name,
      lessonDate: formattedDate,
      lessonTime: formattedTime,
      sessionInfo: periodName || undefined,
      levelLabel: getLevelLabel(enrollment.swim_level, enrollment.child_age),
    }

    try {
      await supabase.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'lesson-reminder',
          recipientEmail: enrollment.parent_email,
          idempotencyKey,
          templateData,
        },
      })
      sentCount++
    } catch (err) {
      console.error('Failed to send reminder for enrollment', enrollment.id, err)
    }
  }

  console.log(`Sent ${sentCount} lesson reminders for ${tomorrowStr}`)

  return new Response(
    JSON.stringify({ sent: sentCount, date: tomorrowStr }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
