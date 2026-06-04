// Public endpoint: returns an .ics calendar file for a swim lesson.
// All event data is passed via query params so this works for both
// private bookings and group enrollments without DB lookups.
//
// Single-event mode params:
//   uid       - stable unique id (e.g. occurrence id, or `enroll-<id>-<date>`)
//   title     - event title
//   date      - YYYY-MM-DD (Pacific Time)
//   start     - HH:MM or HH:MM:SS (24h, Pacific Time)
//   end       - HH:MM or HH:MM:SS (24h, Pacific Time)
//   location  - optional address
//   desc      - optional description
//
// Multi-event mode (used for 8-week sessions):
//   dates=YYYY-MM-DD,YYYY-MM-DD,...  (comma-separated)
//   Same start/end/title/location/desc applied to every date.
//   uid is used as a base; each VEVENT gets `<uid>-<date>` to keep
//   updates idempotent across re-imports.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function pad(n: number) {
  return n.toString().padStart(2, '0')
}

// Convert PT wall-clock date+time to a UTC ICS timestamp (YYYYMMDDTHHMMSSZ).
function ptWallClockToUtc(dateStr: string, timeStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const parts = timeStr.split(':').map(Number)
  const hh = parts[0] || 0
  const mm = parts[1] || 0
  const ss = parts[2] || 0

  const probe = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    timeZoneName: 'shortOffset',
  })
  const tzPart = fmt.formatToParts(probe).find(p => p.type === 'timeZoneName')?.value || 'GMT-8'
  const offsetMatch = tzPart.match(/GMT([+-]\d+)/)
  const offsetHours = offsetMatch ? parseInt(offsetMatch[1], 10) : -8

  const utcMs = Date.UTC(y, m - 1, d, hh - offsetHours, mm, ss)
  const u = new Date(utcMs)
  return `${u.getUTCFullYear()}${pad(u.getUTCMonth() + 1)}${pad(u.getUTCDate())}T${pad(u.getUTCHours())}${pad(u.getUTCMinutes())}${pad(u.getUTCSeconds())}Z`
}

function escapeIcs(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

interface MultiEvent {
  uid?: string
  title?: string
  date: string
  start: string
  end: string
  location?: string
  desc?: string
}

function decodeEventsParam(raw: string): MultiEvent[] | null {
  try {
    const b64 = raw.replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
    const binary = atob(b64 + pad)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const json = new TextDecoder().decode(bytes)
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) return null
    return parsed.filter((e) => e && e.date && e.start && e.end)
  } catch {
    return null
  }
}

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const url = new URL(req.url)
    const uid = url.searchParams.get('uid') || crypto.randomUUID()
    const title = url.searchParams.get('title') || 'Swim Lesson — Aquatic Dreams'
    const date = url.searchParams.get('date')
    const datesParam = url.searchParams.get('dates')
    const eventsParam = url.searchParams.get('events')
    const start = url.searchParams.get('start')
    const end = url.searchParams.get('end')
    const defaultLocation =
      url.searchParams.get('location') || '1212 Kansas Ave, Modesto, CA 95351'
    const defaultDesc = url.searchParams.get('desc') || ''

    const dtStamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
    const events: string[] = []
    let isMulti = false

    if (eventsParam) {
      // Multi-event mode: each event has its own title/date/start/end.
      const decoded = decodeEventsParam(eventsParam)
      if (!decoded || decoded.length === 0) {
        return new Response('Invalid events param', { status: 400, headers: corsHeaders })
      }
      isMulti = decoded.length > 1
      for (let i = 0; i < decoded.length; i++) {
        const ev = decoded[i]
        const dtStart = ptWallClockToUtc(ev.date, ev.start)
        const dtEnd = ptWallClockToUtc(ev.date, ev.end)
        const eventUid = ev.uid || `${uid}-${i}-${ev.date}`
        events.push(
          [
            'BEGIN:VEVENT',
            `UID:${escapeIcs(eventUid)}@aquaticdreamsswim.com`,
            `DTSTAMP:${dtStamp}`,
            `DTSTART:${dtStart}`,
            `DTEND:${dtEnd}`,
            `SUMMARY:${escapeIcs(ev.title || title)}`,
            `LOCATION:${escapeIcs(ev.location || defaultLocation)}`,
            `DESCRIPTION:${escapeIcs(ev.desc || defaultDesc)}`,
            'STATUS:CONFIRMED',
            'END:VEVENT',
          ].join('\r\n')
        )
      }
    } else {
      if (!start || !end) {
        return new Response('Missing required params: start, end', { status: 400, headers: corsHeaders })
      }
      const dates: string[] = datesParam
        ? datesParam.split(',').map(d => d.trim()).filter(Boolean)
        : (date ? [date] : [])
      if (dates.length === 0) {
        return new Response('Missing required params: date or dates', { status: 400, headers: corsHeaders })
      }
      isMulti = dates.length > 1
      for (const d of dates) {
        const dtStart = ptWallClockToUtc(d, start)
        const dtEnd = ptWallClockToUtc(d, end)
        const eventUid = isMulti ? `${uid}-${d}` : uid
        events.push(
          [
            'BEGIN:VEVENT',
            `UID:${escapeIcs(eventUid)}@aquaticdreamsswim.com`,
            `DTSTAMP:${dtStamp}`,
            `DTSTART:${dtStart}`,
            `DTEND:${dtEnd}`,
            `SUMMARY:${escapeIcs(title)}`,
            `LOCATION:${escapeIcs(defaultLocation)}`,
            `DESCRIPTION:${escapeIcs(defaultDesc)}`,
            'STATUS:CONFIRMED',
            'END:VEVENT',
          ].join('\r\n')
        )
      }
    }

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Aquatic Dreams//Swim Lesson//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      ...events,
      'END:VCALENDAR',
    ].join('\r\n')

    const filename = isMulti ? 'aquatic-dreams-session.ics' : 'aquatic-dreams-lesson.ics'

    return new Response(ics, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (e) {
    console.error('lesson-calendar-ics error:', e)
    return new Response('Error generating calendar file', { status: 500, headers: corsHeaders })
  }
})
