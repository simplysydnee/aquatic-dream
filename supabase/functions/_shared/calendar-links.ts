// Helpers for building "Add to Calendar" links used in lesson emails.
//
// We support two link styles in emails:
//   - icsUrl:    points at our public lesson-calendar-ics edge function.
//                Apple Mail, Outlook, and Android open this natively.
//   - googleUrl: a https://calendar.google.com/calendar/render?... URL
//                pre-filled with the event details.

export interface CalendarEventInput {
  uid: string
  title: string
  date: string // YYYY-MM-DD (Pacific Time wall clock)
  start: string // HH:MM[:SS]
  end: string // HH:MM[:SS]
  location?: string
  description?: string
}

const SUPABASE_PROJECT_REF = 'jilrijklnehbfuulykty'
const ICS_BASE = `https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/lesson-calendar-ics`

function pad(n: number) {
  return n.toString().padStart(2, '0')
}

// Same PT-wall-clock to UTC conversion as the edge function, kept in sync.
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

export function buildCalendarLinks(input: CalendarEventInput): { icsUrl: string; googleUrl: string } {
  const params = new URLSearchParams({
    uid: input.uid,
    title: input.title,
    date: input.date,
    start: input.start,
    end: input.end,
  })
  if (input.location) params.set('location', input.location)
  if (input.description) params.set('desc', input.description)
  const icsUrl = `${ICS_BASE}?${params.toString()}`

  const gStart = ptWallClockToUtc(input.date, input.start)
  const gEnd = ptWallClockToUtc(input.date, input.end)
  const g = new URLSearchParams({
    action: 'TEMPLATE',
    text: input.title,
    dates: `${gStart}/${gEnd}`,
  })
  if (input.location) g.set('location', input.location)
  if (input.description) g.set('details', input.description)
  const googleUrl = `https://calendar.google.com/calendar/render?${g.toString()}`

  return { icsUrl, googleUrl }
}

export interface SessionCalendarEventInput {
  uid: string
  title: string
  dates: string[] // array of YYYY-MM-DD (Pacific Time wall clock)
  start: string
  end: string
  location?: string
  description?: string
}

// Multi-date variant for 8-week group sessions.
// - icsUrl downloads a single .ics containing all VEVENTs (one per date).
// - googleUrl pre-fills Google Calendar with the FIRST date only,
//   since Google's render endpoint only supports one event per call.
export function buildSessionCalendarLinks(
  input: SessionCalendarEventInput
): { icsUrl: string; googleUrl: string } {
  const params = new URLSearchParams({
    uid: input.uid,
    title: input.title,
    dates: input.dates.join(','),
    start: input.start,
    end: input.end,
  })
  if (input.location) params.set('location', input.location)
  if (input.description) params.set('desc', input.description)
  const icsUrl = `${ICS_BASE}?${params.toString()}`

  const firstDate = input.dates[0]
  const gStart = ptWallClockToUtc(firstDate, input.start)
  const gEnd = ptWallClockToUtc(firstDate, input.end)
  const g = new URLSearchParams({
    action: 'TEMPLATE',
    text: input.title,
    dates: `${gStart}/${gEnd}`,
  })
  if (input.location) g.set('location', input.location)
  if (input.description) g.set('details', input.description)
  const googleUrl = `https://calendar.google.com/calendar/render?${g.toString()}`

  return { icsUrl, googleUrl }
}

