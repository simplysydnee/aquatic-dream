import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const body = await req.json()

    const required = ['signerFirstName', 'signerLastName', 'signerEmail', 'legal', 'swimmers']
    for (const k of required) {
      if (!body[k]) {
        return new Response(JSON.stringify({ error: `Missing ${k}` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    const legal = body.legal
    const swimmers = Array.isArray(body.swimmers) ? body.swimmers : []
    const source = body.source === 'kiosk' ? 'kiosk' : 'public'

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    // Capture IP for compliance
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('cf-connecting-ip') ||
      null

    // If staff is logged in for kiosk mode, capture their id
    let staffId: string | null = null
    if (source === 'kiosk') {
      const authHeader = req.headers.get('Authorization')
      if (authHeader?.startsWith('Bearer ')) {
        try {
          const token = authHeader.replace('Bearer ', '')
          const { data } = await supabase.auth.getUser(token)
          staffId = data?.user?.id ?? null
        } catch {
          /* ignore */
        }
      }
    }

    const email = String(body.signerEmail).trim().toLowerCase()
    const signerName = `${body.signerFirstName} ${body.signerLastName}`.trim()

    const { data: inserted, error: insertErr } = await supabase
      .from('visitor_waivers')
      .insert({
        signer_first_name: String(body.signerFirstName).trim(),
        signer_last_name: String(body.signerLastName).trim(),
        signer_email: email,
        signer_phone: body.signerPhone ? String(body.signerPhone).trim() : null,
        signature_text: legal.signatureText,
        waiver_accepted: !!legal.waiverAccepted,
        terms_accepted: !!legal.termsAccepted,
        privacy_policy_accepted: !!legal.privacyPolicyAccepted,
        photo_release_accepted: legal.photoReleaseAccepted === 'yes',
        emergency_contact_first_name: legal.emergencyContactFirstName ?? null,
        emergency_contact_last_name: legal.emergencyContactLastName ?? null,
        emergency_contact_phone: legal.emergencyContactPhone ?? null,
        emergency_contact_relationship: legal.emergencyContactRelationship ?? null,
        swimmers,
        waiver_version: body.waiverVersion ?? undefined,
        tos_version: body.tosVersion ?? undefined,
        privacy_policy_version: body.privacyPolicyVersion ?? undefined,
        source,
        completed_by_staff_id: staffId,
        signer_ip: ip,
      })
      .select('id')
      .single()

    if (insertErr || !inserted) {
      console.error('visitor_waivers insert failed', insertErr)
      return new Response(JSON.stringify({ error: insertErr?.message || 'Insert failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Send confirmation email (non-fatal)
    try {
      await supabase.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'visitor-waiver-copy',
          recipientEmail: email,
          idempotencyKey: `visitor-waiver-${inserted.id}`,
          templateData: {
            signerName,
            signedAt: new Date().toISOString(),
            swimmers,
            photoRelease: legal.photoReleaseAccepted === 'yes',
            emergencyContactName: legal.emergencyContactName,
            emergencyContactPhone: legal.emergencyContactPhone,
            emergencyContactRelationship: legal.emergencyContactRelationship,
            waiverVersion: body.waiverVersion,
            tosVersion: body.tosVersion,
            privacyPolicyVersion: body.privacyPolicyVersion,
          },
        },
      })
      await supabase
        .from('visitor_waivers')
        .update({ email_sent_at: new Date().toISOString() })
        .eq('id', inserted.id)
    } catch (e) {
      console.warn('Visitor waiver email send failed', e)
    }

    return new Response(JSON.stringify({ id: inserted.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    console.error('submit-visitor-waiver error', e)
    return new Response(JSON.stringify({ error: e?.message || 'Unexpected error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
