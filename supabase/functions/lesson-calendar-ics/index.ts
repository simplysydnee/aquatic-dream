// Public endpoint: returns an .ics calendar file for a swim lesson.
// All event data is passed via query params so this works for both
// private bookings and group enrollments without DB lookups.
//
// Query params:
//   uid       - stable unique id (e.g. occurrence id, or `enroll-<id>-<date>`)
//   title     - event title
//   date      - YYYY-MM-DD (Pacific Time)
//   start     - HH:MM or HH:MM:SS (24h, Pacific Time)
//   end       - HH:MM or HH:MM:SS (24h, Pacific Time)
//   location  - optional address
//   desc      - optional description

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function pad(n: number) {
  return n.toString().padStart(2, '0')
}

// Convert PT wall-clock date+time to a UTC ICS timestamp (YYYYMMDDTHHMMSSZ).
// Pacific is UTC-7 (PDT) most of the year and UTC-8 (PST) in winter.
// We compute the offset by formatting the same instant in PT and comparing.
function ptWallClockToUtc(dateStr: string, timeStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const parts = timeStr.split(':').map(Number)
  const hh = parts[0] || 0
  const mm = parts[1] || 0
  const ss = parts[2] || 0

  // Determine Pacific offset for this date by checking what the UTC instant
  // for "midnight UTC of that date" looks like when formatted in PT.
  // We use Intl with timeZone to get the offset in minutes.
  const probe = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    timeZoneName: 'shortOffset',
  })
  const tzPart = fmt.formatToParts(probe).find(p => p.type === 'timeZoneName')?.value || 'GMT-8'
  // tzPart looks like "GMT-7" or "GMT-8"
  const offsetMatch = tzPart.match(/GMT([+-]\d+)/)
  const offsetHours = offsetMatch ? parseInt(offsetMatch[1], 10) : -8

  // PT wall clock -> UTC: subtract offset (offset is negative)
  const utcMs = Date.UTC(y, m - 1, d, hh - offsetHours, mm, ss)
  const u = new Date(utcMs)
  return `${u.getUTCFullYear()}${pad(u.getUTCMonth() + 1)}${pad(u.getUTCDate())}T${pad(u.getUTCHours())}${pad(u.getUTCMinutes())}${pad(u.getUTCSeconds())}Z`
}

function escapeIcs(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const url = new URL(req.url)
    const uid = url.searchParams.get('uid') || crypto.randomUUID()
    const title = url.searchParams.get('title') || 'Swim Lesson — Aquatic Dreams'
    const date = url.searchParams.get('date')
    const start = url.searchParams.get('start')
    const end = url.searchParams.get('end')
    const location = url.searchParams.get('location') || '1212 Kansas Ave, Modesto, CA 95351'
    const desc = url.searchParams.get('desc') || ''

    if (!date || !start || !end) {
      return new Response('Missing required params: date, start, end', { status: 400, headers: corsHeaders })
    }

    const dtStart = ptWallClockToUtc(date, start)
    const dtEnd = ptWallClockToUtc(date, end)
    const dtStamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Aquatic Dreams//Swim Lesson//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${escapeIcs(uid)}@aquaticdreamsswim.com`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${escapeIcs(title)}`,
      `LOCATION:${escapeIcs(location)}`,
      `DESCRIPTION:${escapeIcs(desc)}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')

    return new Response(ics, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="aquatic-dreams-lesson.ics"',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (e) {
    console.error('lesson-calendar-ics error:', e)
    return new Response('Error generating calendar file', { status: 500, headers: corsHeaders })
  }
})
