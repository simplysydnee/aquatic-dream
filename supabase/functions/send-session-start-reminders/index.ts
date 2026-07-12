// Bulk SMS: reminder that lessons start tomorrow (or a chosen date), plus a
// Stripe Payment Link for anyone whose session fee is still due.
// Admin-only. Idempotent: dedupes against reminder_logs.reminder_kind =
// 'session_start_reminder' scoped by enrollment_id + session_id.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendSms, normalizePhone, formatPTTime } from '../_shared/textmagic.ts'
import { requireAdminOrServiceRole } from '../_shared/auth-guard.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const REMINDER_KIND = 'session_start_reminder'

function ptDateStr(offsetDays = 0): string {
  const nowPT = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }),
  )
  nowPT.setDate(nowPT.getDate() + offsetDays)
  const y = nowPT.getFullYear()
  const m = String(nowPT.getMonth() + 1).padStart(2, '0')
  const d = String(nowPT.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function ptWeekday(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d, 12))
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'long',
  }).format(dt)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const guard = await requireAdminOrServiceRole(req)
  if (!guard.ok) {
    return new Response(JSON.stringify({ error: guard.error }), {
      status: guard.status ?? 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const body = await req.json().catch(() => ({}))
    const {
      sessionPeriodId,
      sessionIds: sessionIdsInput,
      targetDate: targetDateInput,
      dryRun = false,
      environment = 'live',
      testPhone: testPhoneRaw,
      testLimit,
    } = body as {
      sessionPeriodId?: string
      sessionIds?: string[]
      targetDate?: string
      dryRun?: boolean
      environment?: string
      testPhone?: string
      testLimit?: number
    }

    const testPhone = testPhoneRaw ? normalizePhone(testPhoneRaw) : null
    const isTest = !!testPhone
    if (testPhoneRaw && !testPhone) {
      return new Response(JSON.stringify({ error: 'Invalid testPhone' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const targetDate = targetDateInput || ptDateStr(1)

    // Resolve which sessions to target.
    // Priority: explicit sessionIds > sessionPeriodId > all sessions whose FIRST
    // lesson_date equals targetDate.
    let sessionIds: string[] = []
    if (sessionIdsInput && sessionIdsInput.length) {
      sessionIds = sessionIdsInput
    } else if (sessionPeriodId) {
      const { data: sess } = await supabase
        .from('swim_sessions')
        .select('id')
        .eq('session_period_id', sessionPeriodId)
      sessionIds = (sess || []).map((s: any) => s.id)
    }

    // Filter sessionIds to those whose first (min, non-cancelled) lesson_date == targetDate.
    if (sessionIds.length === 0) {
      // Auto-detect: any session whose first lesson_date is targetDate.
      const { data: allSld } = await supabase
        .from('session_lesson_dates')
        .select('session_id, lesson_date, is_cancelled')
        .eq('is_cancelled', false)
        .order('lesson_date', { ascending: true })
      const firstBy = new Map<string, string>()
      for (const r of (allSld || []) as any[]) {
        if (!firstBy.has(r.session_id)) firstBy.set(r.session_id, r.lesson_date)
      }
      sessionIds = Array.from(firstBy.entries())
        .filter(([, d]) => d === targetDate)
        .map(([sid]) => sid)
    } else {
      const { data: sld } = await supabase
        .from('session_lesson_dates')
        .select('session_id, lesson_date, is_cancelled')
        .in('session_id', sessionIds)
        .eq('is_cancelled', false)
        .order('lesson_date', { ascending: true })
      const firstBy = new Map<string, string>()
      for (const r of (sld || []) as any[]) {
        if (!firstBy.has(r.session_id)) firstBy.set(r.session_id, r.lesson_date)
      }
      sessionIds = sessionIds.filter((sid) => firstBy.get(sid) === targetDate)
    }

    if (sessionIds.length === 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          targetDate,
          total: 0,
          sent: 0,
          withPayLink: 0,
          reminderOnly: 0,
          skippedNoPhone: 0,
          skippedAlreadySent: 0,
          failed: 0,
          message: 'No sessions start on this date.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Load session info for start_time / label.
    const { data: sessions } = await supabase
      .from('swim_sessions')
      .select('id, start_time, session_name')
      .in('id', sessionIds)
    const sessionById = new Map<string, any>(
      (sessions || []).map((s: any) => [s.id, s]),
    )

    // Load active enrollments for those sessions.
    const { data: enrollments } = await supabase
      .from('swim_enrollments')
      .select(
        'id, session_id, child_name, parent_name, parent_phone, session_fee_status',
      )
      .in('session_id', sessionIds)
      .not('status', 'in', '(cancelled,suspended)')

    const list = (enrollments || []) as any[]

    // Dedupe against prior sends of this reminder kind for these enrollments.
    // In test mode we skip dedupe entirely so the admin can re-run previews.
    const enrollmentIds = list.map((e) => e.id)
    const alreadySent = new Set<string>()
    if (!isTest && enrollmentIds.length) {
      const { data: sentRows } = await supabase
        .from('reminder_logs')
        .select('enrollment_id')
        .eq('channel', 'sms')
        .eq('status', 'sent')
        .eq('reminder_kind', REMINDER_KIND)
        .in('enrollment_id', enrollmentIds)
      for (const r of (sentRows || []) as any[]) alreadySent.add(r.enrollment_id)
    }

    // Bucketize.
    const buckets = {
      willSendWithLink: [] as any[],
      willSendReminderOnly: [] as any[],
      skippedNoPhone: [] as any[],
      skippedAlreadySent: [] as any[],
    }
    for (const e of list) {
      if (alreadySent.has(e.id)) {
        buckets.skippedAlreadySent.push(e)
        continue
      }
      // In test mode, missing parent phone is fine — we route to the admin.
      if (!isTest && !normalizePhone(e.parent_phone)) {
        buckets.skippedNoPhone.push(e)
        continue
      }
      const owes = e.session_fee_status !== 'paid' && e.session_fee_status !== 'comp'
      if (owes) buckets.willSendWithLink.push(e)
      else buckets.willSendReminderOnly.push(e)
    }

    // In test mode, cap total sends so the admin's inbox doesn't get flooded.
    if (isTest) {
      const cap = Math.max(1, Math.min(50, Number(testLimit) || 5))
      const combined = [...buckets.willSendWithLink, ...buckets.willSendReminderOnly]
      const capped = combined.slice(0, cap)
      const withLinkIds = new Set(buckets.willSendWithLink.map((e) => e.id))
      buckets.willSendWithLink = capped.filter((e) => withLinkIds.has(e.id))
      buckets.willSendReminderOnly = capped.filter((e) => !withLinkIds.has(e.id))
    }

    if (dryRun) {
      return new Response(
        JSON.stringify({
          ok: true,
          targetDate,
          total: list.length,
          withPayLink: buckets.willSendWithLink.length,
          reminderOnly: buckets.willSendReminderOnly.length,
          skippedNoPhone: buckets.skippedNoPhone.length,
          skippedAlreadySent: buckets.skippedAlreadySent.length,
          sessionCount: sessionIds.length,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    let sent = 0
    let failed = 0
    const errors: Array<{ enrollment_id: string; error: string }> = []

    const dayLabel = ptWeekday(targetDate) // e.g. "Monday"

    async function fetchPayLink(enrollmentId: string): Promise<string | null> {
      try {
        const { data, error } = await supabase.functions.invoke(
          'get-or-create-session-payment-link',
          { body: { enrollmentId, environment } },
        )
        if (error) {
          console.error('pay link error for', enrollmentId, error)
          return null
        }
        return (data as any)?.paymentLink ?? null
      } catch (e) {
        console.error('pay link exception for', enrollmentId, e)
        return null
      }
    }

    async function sendOne(e: any, includeLink: boolean) {
      const sess = sessionById.get(e.session_id)
      const timeStr = sess?.start_time ? formatPTTime(sess.start_time) : ''
      const firstChild = (e.child_name || '').split(' ')[0] || 'your swimmer'
      const firstParent = (e.parent_name || '').split(' ')[0] || 'there'
      const phone = normalizePhone(e.parent_phone)!

      let payLink: string | null = null
      if (includeLink) {
        payLink = await fetchPayLink(e.id)
      }

      const message = includeLink && payLink
        ? `Hi ${firstParent}, ${firstChild}'s first swim lesson at Aquatic Dreams is ${dayLabel} at ${timeStr}. Pay the session fee before you arrive: ${payLink} — Reply STOP to opt out.`
        : `Hi ${firstParent}, reminder: ${firstChild}'s first swim lesson at Aquatic Dreams is ${dayLabel} at ${timeStr}. See you at the pool!`

      const result = await sendSms(phone, message)
      await supabase.from('reminder_logs').insert({
        swimmer_name: e.child_name,
        enrollment_id: e.id,
        channel: 'sms',
        reminder_kind: REMINDER_KIND,
        phone,
        message,
        sent_at: result.ok ? new Date().toISOString() : null,
        status: result.ok ? 'sent' : 'failed',
        error: result.ok ? null : result.error ?? null,
      })
      if (result.ok) sent++
      else {
        failed++
        errors.push({ enrollment_id: e.id, error: result.error || 'unknown' })
      }
    }

    for (const e of buckets.willSendWithLink) await sendOne(e, true)
    for (const e of buckets.willSendReminderOnly) await sendOne(e, false)

    // Log no-phone skips as failed for audit.
    for (const e of buckets.skippedNoPhone) {
      await supabase.from('reminder_logs').insert({
        swimmer_name: e.child_name,
        enrollment_id: e.id,
        channel: 'sms',
        reminder_kind: REMINDER_KIND,
        phone: null,
        message: '(not sent — no phone on file)',
        status: 'failed',
        error: 'no_phone',
      })
    }

    return new Response(
      JSON.stringify({
        ok: true,
        targetDate,
        total: list.length,
        sent,
        failed,
        withPayLink: buckets.willSendWithLink.length,
        reminderOnly: buckets.willSendReminderOnly.length,
        skippedNoPhone: buckets.skippedNoPhone.length,
        skippedAlreadySent: buckets.skippedAlreadySent.length,
        errors,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('send-session-start-reminders error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
