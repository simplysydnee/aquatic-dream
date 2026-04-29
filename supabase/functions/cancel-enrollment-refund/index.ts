// Admin-only: cancel a swim enrollment and (optionally) refund the parent via Stripe.
//
// Behavior:
//  - Sets swim_enrollments.status = 'cancelled'
//  - If refund=true, issues Stripe refunds for any captured charges referenced by:
//      session_fee_stripe_id  -> refunds the $240 session fee
//      stripe_payment_id      -> refunds the original checkout (typically $45 reg fee
//                                for first-timers, or $240 for returning swimmers)
//    For each successful refund, flips the corresponding *_status to 'refunded' and
//    stamps refund metadata.
//  - Sends a cancellation/refund notification email to the parent.
//
// Required body: { enrollmentId: string, refund: boolean, environment?: 'sandbox'|'live', reason?: string }
import { createClient } from 'npm:@supabase/supabase-js@2'
import { createStripeClient, type StripeEnv } from '../_shared/stripe.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey)

  try {
    // Authn + admin check
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization' }, 401)
    const token = authHeader.replace('Bearer ', '')
    const { data: userData, error: userErr } = await supabase.auth.getUser(token)
    if (userErr || !userData?.user) return json({ error: 'Invalid auth token' }, 401)

    const { data: isAdmin } = await supabase.rpc('has_role', {
      _user_id: userData.user.id,
      _role: 'admin',
    })
    if (!isAdmin) return json({ error: 'Admin role required' }, 403)

    const body = await req.json()
    const enrollmentId: string = body.enrollmentId
    const refund: boolean = body.refund !== false // default true
    const environment: StripeEnv = (body.environment === 'sandbox' ? 'sandbox' : 'live') as StripeEnv
    const reason: string = (body.reason || 'Admin cancellation').toString().slice(0, 500)

    if (!enrollmentId) return json({ error: 'enrollmentId is required' }, 400)

    const { data: enrollment, error: fetchErr } = await supabase
      .from('swim_enrollments')
      .select('*')
      .eq('id', enrollmentId)
      .maybeSingle()

    if (fetchErr || !enrollment) return json({ error: 'Enrollment not found' }, 404)

    const refundResults: {
      kind: 'session_fee' | 'registration'
      sourceId: string
      refundId?: string
      amount?: number
      error?: string
    }[] = []

    const updates: Record<string, unknown> = {
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    }

    if (refund) {
      const stripe = createStripeClient(environment)

      // Helper: Stripe `refunds.create` accepts a payment_intent OR charge id. The IDs we
      // store can be either checkout-session ids (`cs_...`), payment-intent ids (`pi_...`),
      // or charge ids (`ch_...`). Normalize to a payment_intent.
      const resolvePaymentIntent = async (id: string): Promise<string | null> => {
        if (!id) return null
        if (id.startsWith('pi_')) return id
        if (id.startsWith('ch_')) {
          const ch = await stripe.charges.retrieve(id)
          return (ch.payment_intent as string) || null
        }
        if (id.startsWith('cs_')) {
          const cs = await stripe.checkout.sessions.retrieve(id)
          return (cs.payment_intent as string) || null
        }
        return null
      }

      // 1. Session fee refund ($240)
      if (enrollment.session_fee_stripe_id && enrollment.session_fee_status === 'paid') {
        try {
          const pi = await resolvePaymentIntent(enrollment.session_fee_stripe_id)
          if (!pi) throw new Error(`Could not resolve payment intent from ${enrollment.session_fee_stripe_id}`)
          const r = await stripe.refunds.create({
            payment_intent: pi,
            reason: 'requested_by_customer',
            metadata: { enrollmentId, kind: 'session_fee', adminReason: reason },
          })
          refundResults.push({
            kind: 'session_fee',
            sourceId: enrollment.session_fee_stripe_id,
            refundId: r.id,
            amount: (r.amount ?? 0) / 100,
          })
          updates.session_fee_status = 'refunded'
          updates.session_fee_refund_stripe_id = r.id
          updates.session_fee_refund_at = new Date().toISOString()
          updates.session_fee_refund_amount = (r.amount ?? 0) / 100
          updates.session_fee_refund_reason = reason
        } catch (e) {
          refundResults.push({
            kind: 'session_fee',
            sourceId: enrollment.session_fee_stripe_id,
            error: (e as Error).message,
          })
        }
      }

      // 2. Original checkout refund (reg fee $45 for first-timers, or $240 for returning)
      if (enrollment.stripe_payment_id && enrollment.payment_status === 'paid') {
        try {
          const pi = await resolvePaymentIntent(enrollment.stripe_payment_id)
          if (!pi) throw new Error(`Could not resolve payment intent from ${enrollment.stripe_payment_id}`)
          const r = await stripe.refunds.create({
            payment_intent: pi,
            reason: 'requested_by_customer',
            metadata: { enrollmentId, kind: 'registration', adminReason: reason },
          })
          refundResults.push({
            kind: 'registration',
            sourceId: enrollment.stripe_payment_id,
            refundId: r.id,
            amount: (r.amount ?? 0) / 100,
          })
          updates.payment_status = 'refunded'
        } catch (e) {
          refundResults.push({
            kind: 'registration',
            sourceId: enrollment.stripe_payment_id,
            error: (e as Error).message,
          })
        }
      }
    }

    // Append cancellation note
    const stamp = new Date().toISOString().slice(0, 10)
    const noteLine = `[${stamp}] Cancelled by ${userData.user.email || 'admin'}: ${reason}`
    updates.notes = enrollment.notes ? `${enrollment.notes}\n${noteLine}` : noteLine

    const { error: updateErr } = await supabase
      .from('swim_enrollments')
      .update(updates)
      .eq('id', enrollmentId)

    if (updateErr) return json({ error: `Update failed: ${updateErr.message}`, refundResults }, 500)

    // Best-effort notification email
    try {
      const totalRefunded = refundResults
        .filter((r) => r.refundId)
        .reduce((s, r) => s + (r.amount || 0), 0)
      await supabase.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'session-payment-link', // reuse generic template; renders generic copy
          recipientEmail: enrollment.parent_email,
          idempotencyKey: `cancel-${enrollmentId}-${Date.now()}`,
          templateData: {
            parentName: enrollment.parent_name,
            childName: enrollment.child_name,
            sessionInfo: 'Enrollment cancelled',
            amountDue: totalRefunded > 0 ? `Refunded $${totalRefunded.toFixed(2)}` : 'No refund issued',
            paymentLink: 'https://aquaticdreamsswim.com/contact',
            dueDate: reason,
          },
        },
      })
    } catch (emailErr) {
      console.warn('Cancellation email failed (non-fatal):', (emailErr as Error).message)
    }

    return json({ success: true, refundResults, status: 'cancelled' })
  } catch (e) {
    console.error('cancel-enrollment-refund error:', e)
    return json({ error: (e as Error).message }, 500)
  }
})
