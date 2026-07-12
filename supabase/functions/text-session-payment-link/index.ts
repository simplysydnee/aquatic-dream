// Text the parent a Stripe Payment Link for their session fee.
// Reuses get-or-create-session-payment-link (idempotent per enrollment)
// so paying via SMS runs through the same payments-webhook path as email.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendSms, normalizePhone, logSms } from '../_shared/textmagic.ts'

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
    const { enrollmentId, environment } = await req.json()
    if (!enrollmentId) {
      return new Response(JSON.stringify({ error: 'enrollmentId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: enrollment, error } = await supabase
      .from('swim_enrollments')
      .select('id, parent_name, parent_phone, child_name, session_fee_status, session_fee_payment_link_url, swim_sessions(session_price, session_name)')
      .eq('id', enrollmentId)
      .maybeSingle()

    if (error || !enrollment) {
      return new Response(JSON.stringify({ error: 'Enrollment not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (enrollment.session_fee_status === 'paid' || enrollment.session_fee_status === 'comp') {
      return new Response(JSON.stringify({
        error: `Session fee already ${enrollment.session_fee_status}`,
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const phone = normalizePhone(enrollment.parent_phone)
    if (!phone) {
      return new Response(JSON.stringify({ error: 'No parent phone on file' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get or create the Stripe Payment Link for this enrollment.
    let paymentLink = enrollment.session_fee_payment_link_url as string | null
    if (!paymentLink) {
      const { data: linkData, error: linkErr } = await supabase.functions.invoke(
        'get-or-create-session-payment-link',
        { body: { enrollmentId, environment: environment || 'live' } },
      )
      if (linkErr || !linkData?.paymentLink) {
        const msg = (linkErr as any)?.message || linkData?.error || 'Failed to create payment link'
        return new Response(JSON.stringify({ error: msg }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      paymentLink = linkData.paymentLink as string
    }

    const price = Number((enrollment as any).swim_sessions?.session_price ?? 240)
    const parentFirst = (enrollment.parent_name || '').split(' ')[0] || 'there'
    const childFirst = (enrollment.child_name || '').split(' ')[0] || 'your swimmer'
    const amount = `$${price.toFixed(0)}`

    const message =
      `Hi ${parentFirst}, here's the secure link to pay ${childFirst}'s Aquatic Dreams session fee (${amount}): ${paymentLink} — Reply STOP to opt out.`

    const result = await sendSms(phone, message)
    await logSms(supabase, {
      swimmer_name: enrollment.child_name,
      enrollment_id: enrollmentId,
      phone,
      message,
      status: result.ok ? 'sent' : 'failed',
      error: result.ok ? null : result.error ?? null,
      reminder_kind: 'session_payment_link_sms',
    })

    if (!result.ok) {
      return new Response(JSON.stringify({ error: result.error || 'SMS failed' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true, phone, paymentLink }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('text-session-payment-link error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
