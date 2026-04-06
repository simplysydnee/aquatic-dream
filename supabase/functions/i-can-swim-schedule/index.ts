import { corsHeaders } from '@supabase/supabase-js/cors'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const I_CAN_SWIM_URL = 'https://jtqlamkrhdfwtmaubfrc.supabase.co'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const apiKey = Deno.env.get('I_CAN_SWIM_SUPABASE_KEY')
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'I Can Swim API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const icsClient = createClient(I_CAN_SWIM_URL, apiKey)

    // Query sessions with instructor info and booking counts
    const { data: sessions, error: sessionsError } = await icsClient
      .from('sessions')
      .select(`
        id,
        start_time,
        end_time,
        location,
        session_type,
        status,
        max_capacity,
        booking_count,
        instructor_id
      `)
      .order('start_time', { ascending: true })

    if (sessionsError) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch sessions', details: sessionsError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get instructor profiles
    const instructorIds = [...new Set((sessions || []).map(s => s.instructor_id).filter(Boolean))]
    let instructorMap: Record<string, string> = {}

    if (instructorIds.length > 0) {
      const { data: profiles } = await icsClient
        .from('profiles')
        .select('id, full_name')
        .in('id', instructorIds)

      if (profiles) {
        profiles.forEach((p: any) => {
          instructorMap[p.id] = p.full_name || 'Unknown'
        })
      }
    }

    // Get confirmed booking counts per session
    const sessionIds = (sessions || []).map(s => s.id)
    let bookingCounts: Record<string, number> = {}

    if (sessionIds.length > 0) {
      const { data: bookings } = await icsClient
        .from('bookings')
        .select('session_id')
        .in('session_id', sessionIds)
        .eq('status', 'confirmed')

      if (bookings) {
        bookings.forEach((b: any) => {
          bookingCounts[b.session_id] = (bookingCounts[b.session_id] || 0) + 1
        })
      }
    }

    // Map sessions with enriched data
    const enriched = (sessions || []).map(s => ({
      id: s.id,
      start_time: s.start_time,
      end_time: s.end_time,
      location: s.location,
      session_type: s.session_type,
      status: s.status,
      max_capacity: s.max_capacity,
      instructor_name: s.instructor_id ? (instructorMap[s.instructor_id] || 'Unknown') : null,
      confirmed_bookings: bookingCounts[s.id] || s.booking_count || 0,
    }))

    return new Response(
      JSON.stringify({ sessions: enriched }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Internal error', details: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
