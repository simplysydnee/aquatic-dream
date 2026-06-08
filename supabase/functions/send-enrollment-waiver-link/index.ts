// Send a waiver-only link to the parent for a swim enrollment.
// Does not create any Stripe object. Mirrors send-registration-fee-payment-link
// shape but with no payment.
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const { enrollmentId, siteUrl } = await req.json()
    if (!enrollmentId) return json({ error: 'enrollmentId is required' }, 400)

    const { data: enrollment, error: enrErr } = await supabase
      .from('swim_enrollments')
      .select(
        'id, parent_name, parent_email, child_name, waiver_token, waiver_signed_at, swim_sessions(session_name, day_of_week, start_time, swim_level)',
      )
      .eq('id', enrollmentId)
      .maybeSingle()

    if (enrErr || !enrollment) return json({ error: 'Enrollment not found' }, 404)
    if (enrollment.waiver_signed_at) return json({ error: 'Waiver already signed' }, 400)
    if (!enrollment.parent_email) return json({ error: 'No parent email on file' }, 400)

    // Ensure token (trigger only sets on insert when is_first_time)
    let token = enrollment.waiver_token
    if (!token) {
      token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
      const { error: tokErr } = await supabase
        .from('swim_enrollments')
        .update({ waiver_token: token })
        .eq('id', enrollmentId)
      if (tokErr) return json({ error: `Could not assign waiver token: ${tokErr.message}` }, 500)
    }

    const base = siteUrl || 'https://aquaticdreamsswim.com'
    const waiverLink = `${base}/enrollment-waiver/${token}`

    const session = (enrollment as any).swim_sessions
    const sessionInfo = session
      ? `${session.session_name || session.swim_level} — ${session.day_of_week} ${session.start_time}`
      : undefined

    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-transactional-email`
    const sendRes = await fetch(fnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        templateName: 'enrollment-waiver-link',
        recipientEmail: enrollment.parent_email,
        idempotencyKey: `waiver-link-${enrollmentId}-${Date.now()}`,
        templateData: {
          parentName: enrollment.parent_name,
          childName: enrollment.child_name,
          sessionInfo,
          waiverLink,
        },
      }),
    })
    if (!sendRes.ok) {
      const txt = await sendRes.text().catch(() => '')
      console.error('send-transactional-email failed:', sendRes.status, txt)
      return json({ error: `Email send failed (${sendRes.status})` }, 502)
    }

    return json({ success: true, waiverLink }, 200)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('send-enrollment-waiver-link error:', message)
    return json({ error: message }, 500)
  }

  function json(body: unknown, status: number) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
