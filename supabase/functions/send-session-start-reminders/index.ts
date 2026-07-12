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

type Variant = 'pay_link' | 'reminder_only' | 'skipped_no_phone' | 'skipped_already_sent'

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
      mode: modeInput,
      sessionPeriodId,
      sessionIds: sessionIdsInput,
      targetDate: targetDateInput,
      dryRun = false,
      environment = 'live',
      testPhone: testPhoneRaw,
      enrollmentIds: enrollmentIdsInput,
    } = body as {
      mode?: 'preview' | 'send'
      sessionPeriodId?: string
      sessionIds?: string[]
      targetDate?: string
      dryRun?: boolean
      environment?: string
      testPhone?: string
      enrollmentIds?: string[]
    }

    const mode: 'preview' | 'send' = modeInput === 'preview' ? 'preview' : 'send'
    const testPhone = testPhoneRaw ? normalizePhone(testPhoneRaw) : null
    const isTest = !!testPhone
    if (testPhoneRaw && !testPhone) {
      return new Response(JSON.stringify({ error: 'Invalid testPhone' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const targetDate = targetDateInput || ptDateStr(1)
    const enrollmentIdFilter = Array.isArray(enrollmentIdsInput) && enrollmentIdsInput.length
      ? new Set(enrollmentIdsInput)
      : null

    // Resolve target sessions.
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

    if (sessionIds.length === 0) {
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

    const dayLabel = ptWeekday(targetDate)

    if (sessionIds.length === 0) {
      return new Response(
        JSON.stringify({
          ok: true, mode, targetDate, total: 0, rows: [],
          sent: 0, failed: 0,
          withPayLink: 0, reminderOnly: 0, skippedNoPhone: 0, skippedAlreadySent: 0,
          message: 'No sessions start on this date.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { data: sessions } = await supabase
      .from('swim_sessions')
      .select('id, start_time, session_name')
      .in('id', sessionIds)
    const sessionById = new Map<string, any>(
      (sessions || []).map((s: any) => [s.id, s]),
    )

    const { data: enrollments } = await supabase
      .from('swim_enrollments')
      .select(
        'id, session_id, child_name, parent_name, parent_phone, session_fee_status',
      )
      .in('session_id', sessionIds)
      .not('status', 'in', '(cancelled,suspended)')

    let list = (enrollments || []) as any[]
    if (enrollmentIdFilter) list = list.filter((e) => enrollmentIdFilter.has(e.id))

    // Dedupe against prior sends (skipped in test mode).
    const alreadySent = new Set<string>()
    if (!isTest && list.length) {
      const { data: sentRows } = await supabase
        .from('reminder_logs')
        .select('enrollment_id')
        .eq('channel', 'sms')
        .eq('status', 'sent')
        .eq('reminder_kind', REMINDER_KIND)
        .in('enrollment_id', list.map((e) => e.id))
      for (const r of (sentRows || []) as any[]) alreadySent.add(r.enrollment_id)
    }

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

    function buildMessage(
      e: any,
      includeLink: boolean,
      payLink: string | null,
    ): string {
      const sess = sessionById.get(e.session_id)
      const timeStr = sess?.start_time ? formatPTTime(sess.start_time) : ''
      const firstChild = (e.child_name || '').split(' ')[0] || 'your swimmer'
      const firstParent = (e.parent_name || '').split(' ')[0] || 'there'
      const base = includeLink && payLink
        ? `Hi ${firstParent}, ${firstChild}'s first swim lesson at Aquatic Dreams is ${dayLabel} at ${timeStr}. Pay the session fee before you arrive: ${payLink} — Reply STOP to opt out.`
        : `Hi ${firstParent}, reminder: ${firstChild}'s first swim lesson at Aquatic Dreams is ${dayLabel} at ${timeStr}. See you at the pool!`
      if (!isTest) return base
      const realPhone = normalizePhone(e.parent_phone)
      return `[TEST → ${firstParent} / ${realPhone ?? 'no phone'}] ${base}`
    }

    // Classify + build rows.
    type Row = {
      enrollmentId: string
      childName: string
      parentName: string
      parentPhone: string | null
      routedPhone: string | null
      sessionName: string | null
      startTime: string | null
      variant: Variant
      willSend: boolean
      includesLink: boolean
      payLink: string | null
      message: string
      skipReason: string | null
    }

    const rows: Row[] = []
    for (const e of list) {
      const sess = sessionById.get(e.session_id)
      const realPhone = normalizePhone(e.parent_phone)
      const owes = e.session_fee_status !== 'paid' && e.session_fee_status !== 'comp'

      let variant: Variant
      let willSend = true
      let skipReason: string | null = null

      if (alreadySent.has(e.id)) {
        variant = 'skipped_already_sent'
        willSend = false
        skipReason = 'already_sent'
      } else if (!isTest && !realPhone) {
        variant = 'skipped_no_phone'
        willSend = false
        skipReason = 'no_phone'
      } else {
        variant = owes ? 'pay_link' : 'reminder_only'
      }

      rows.push({
        enrollmentId: e.id,
        childName: e.child_name,
        parentName: e.parent_name,
        parentPhone: realPhone,
        routedPhone: willSend ? (isTest ? testPhone : realPhone) : null,
        sessionName: sess?.session_name ?? null,
        startTime: sess?.start_time ?? null,
        variant,
        willSend,
        includesLink: variant === 'pay_link',
        payLink: null,
        message: '',
        skipReason,
      })
    }

    // Generate pay links in parallel for rows that need them.
    const linkTargets = rows.filter((r) => r.willSend && r.variant === 'pay_link')
    const linkResults = await Promise.all(
      linkTargets.map((r) => fetchPayLink(r.enrollmentId)),
    )
    linkTargets.forEach((r, i) => { r.payLink = linkResults[i] })

    // Build messages now that pay links are resolved.
    for (const r of rows) {
      const e = list.find((x) => x.id === r.enrollmentId)!
      r.message = r.willSend
        ? buildMessage(e, r.variant === 'pay_link', r.payLink)
        : r.variant === 'skipped_no_phone'
        ? '(would not send — no phone on file)'
        : '(would not send — already texted earlier)'
    }


    const summary = {
      total: rows.length,
      withPayLink: rows.filter((r) => r.variant === 'pay_link' && r.willSend).length,
      reminderOnly: rows.filter((r) => r.variant === 'reminder_only' && r.willSend).length,
      skippedNoPhone: rows.filter((r) => r.variant === 'skipped_no_phone').length,
      skippedAlreadySent: rows.filter((r) => r.variant === 'skipped_already_sent').length,
      sessionCount: sessionIds.length,
    }

    if (mode === 'preview' || dryRun) {
      return new Response(
        JSON.stringify({
          ok: true,
          mode: mode === 'preview' ? 'preview' : 'dry_run',
          targetDate,
          isTest,
          testPhone: isTest ? testPhone : undefined,
          rows,
          ...summary,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ===== Real send =====
    let sent = 0
    let failed = 0
    const errors: Array<{ enrollment_id: string; error: string }> = []

    for (const r of rows) {
      if (!r.willSend || !r.routedPhone) continue
      const result = await sendSms(r.routedPhone, r.message)
      await supabase.from('reminder_logs').insert({
        swimmer_name: r.childName,
        enrollment_id: r.enrollmentId,
        channel: 'sms',
        reminder_kind: isTest ? `${REMINDER_KIND}_test` : REMINDER_KIND,
        phone: r.routedPhone,
        message: r.message,
        sent_at: result.ok ? new Date().toISOString() : null,
        status: result.ok ? 'sent' : 'failed',
        error: result.ok ? null : result.error ?? null,
      })
      if (result.ok) sent++
      else {
        failed++
        errors.push({ enrollment_id: r.enrollmentId, error: result.error || 'unknown' })
      }
    }

    if (!isTest) {
      for (const r of rows.filter((x) => x.variant === 'skipped_no_phone')) {
        await supabase.from('reminder_logs').insert({
          swimmer_name: r.childName,
          enrollment_id: r.enrollmentId,
          channel: 'sms',
          reminder_kind: REMINDER_KIND,
          phone: null,
          message: '(not sent — no phone on file)',
          status: 'failed',
          error: 'no_phone',
        })
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        mode: 'send',
        targetDate,
        isTest,
        testPhone: isTest ? testPhone : undefined,
        sent,
        failed,
        ...summary,
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
