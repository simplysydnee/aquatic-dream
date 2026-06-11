// Shared auth guard for edge functions that should only be callable by an
// authenticated admin user OR by another edge function using the service-role key.
import { createClient } from 'npm:@supabase/supabase-js@2'

export interface AdminGuardResult {
  ok: boolean
  status?: number
  error?: string
}

export async function requireAdminOrServiceRole(req: Request): Promise<AdminGuardResult> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  const authHeader = req.headers.get('Authorization') || ''
  const bearer = authHeader.replace(/^Bearer\s+/i, '')
  if (!bearer) return { ok: false, status: 401, error: 'Unauthorized' }

  if (bearer === serviceKey) return { ok: true }

  try {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData?.user) return { ok: false, status: 401, error: 'Unauthorized' }

    const admin = createClient(supabaseUrl, serviceKey)
    const { data: roleRow } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .eq('role', 'admin')
      .maybeSingle()
    if (!roleRow) return { ok: false, status: 403, error: 'Admin only' }
    return { ok: true }
  } catch (e) {
    console.error('admin guard failed', e)
    return { ok: false, status: 401, error: 'Unauthorized' }
  }
}
