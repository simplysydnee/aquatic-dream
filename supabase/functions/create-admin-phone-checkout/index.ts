// Admin-initiated embedded Stripe checkout for taking a card over the phone.
// Admin types the parent's card into Stripe's Embedded Checkout. The webhook
// (metadata.type='admin_phone_checkout') flips the enrollment row to paid.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { createStripeClient, type StripeEnv } from '../_shared/stripe.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)
    const token = authHeader.replace('Bearer ', '')
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token)
    if (userErr || !userData?.user) return json({ error: 'Invalid auth token' }, 401)
    const { data: isAdmin } = await supabaseAdmin.rpc('has_role', {
      _user_id: userData.user.id,
      _role: 'admin',
    })
    if (!isAdmin) return json({ error: 'Admin role required' }, 403)

    const { enrollmentId, amountCents, environment, returnUrl, label } = await req.json()
    if (!enrollmentId) return json({ error: 'enrollmentId required' }, 400)
    if (!amountCents || typeof amountCents !== 'number' || amountCents < 50) {
      return json({ error: 'amountCents must be a number >= 50' }, 400)
    }

    const { data: enrollment, error: enrollErr } = await supabaseAdmin
      .from('swim_enrollments')
      .select('id, parent_email, parent_name, child_name, swim_sessions(session_name, swim_level)')
      .eq('id', enrollmentId)
      .maybeSingle()

    if (enrollErr || !enrollment) return json({ error: 'Enrollment not found' }, 404)

    const env: StripeEnv = environment === 'live' ? 'live' : 'sandbox'
    const stripe = createStripeClient(env)

    const session = (enrollment as any).swim_sessions
    const productName = label
      || `Aquatic Dreams — ${enrollment.child_name}${session?.session_name ? ` (${session.session_name})` : ''}`

    const checkout = await stripe.checkout.sessions.create({
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: productName },
          unit_amount: Math.round(amountCents),
        },
        quantity: 1,
      }],
      mode: 'payment',
      ui_mode: 'embedded',
      expires_at: Math.floor(Date.now() / 1000) + 23 * 60 * 60,
      return_url: (returnUrl || 'https://aquaticdreamsswim.com/admin') + '?phone_paid=1&session_id={CHECKOUT_SESSION_ID}',
      customer_email: enrollment.parent_email || undefined,
      metadata: {
        type: 'admin_phone_checkout',
        enrollmentId: enrollment.id,
      },
    })

    if (!checkout.client_secret) {
      console.error('Stripe returned no client_secret for admin phone checkout', { sessionId: checkout.id })
      return json({ error: 'Stripe did not return a client_secret — checkout cannot start' }, 500)
    }

    return json({ clientSecret: checkout.client_secret })
  } catch (err: any) {
    console.error('create-admin-phone-checkout error', err)
    return json({ error: err?.message || 'Internal error' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
