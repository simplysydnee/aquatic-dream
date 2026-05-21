import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

async function isAdmin(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization");
  if (!auth) return false;
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
  return !!data;
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let i = 0, field = "", row: string[] = [], inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i+1] === '"') { field += '"'; i += 2; continue; }
      if (c === '"') { inQ = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ',') { row.push(field); field = ""; i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    if (c === '\r') { i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // Allow admin OR a one-time shared token
    const token = req.headers.get("x-import-token");
    const allowed = token === "scuba-import-2026" || (await isAdmin(req));
    if (!allowed) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const bucket = body.bucket || "email-assets";
    const path = body.path || "imports/scuba_contacts.csv";
    const tags: string[] = body.tags || ["scuba", "dive360"];
    const source: string = body.source || "import";

    const { data: file, error: dErr } = await supabase.storage.from(bucket).download(path);
    if (dErr || !file) throw new Error(`download failed: ${dErr?.message}`);
    const text = await file.text();
    const rows = parseCSV(text);
    const header = rows.shift() || [];
    const idx = (k: string) => header.indexOf(k);
    const iE = idx("email"), iF = idx("first_name"), iL = idx("last_name"), iP = idx("phone");

    let inserted = 0, updated = 0, skipped = 0, failed = 0;
    const BATCH = 200;
    for (let b = 0; b < rows.length; b += BATCH) {
      const slice = rows.slice(b, b + BATCH).map((r) => ({
        email: (r[iE] || "").trim().toLowerCase(),
        first_name: (r[iF] || "").trim() || null,
        last_name: (r[iL] || "").trim() || null,
        phone: (r[iP] || "").trim() || null,
        source,
        tags,
      })).filter((x) => x.email && x.email.includes("@"));

      // upsert one by one to merge tags correctly
      for (const c of slice) {
        const { data: existing } = await supabase
          .from("marketing_contacts")
          .select("id, tags, first_name, last_name, phone")
          .eq("email", c.email)
          .maybeSingle();
        if (existing) {
          const mergedTags = Array.from(new Set([...(existing.tags || []), ...tags]));
          const { error } = await supabase.from("marketing_contacts").update({
            tags: mergedTags,
            first_name: existing.first_name || c.first_name,
            last_name: existing.last_name || c.last_name,
            phone: existing.phone || c.phone,
            updated_at: new Date().toISOString(),
          }).eq("id", existing.id);
          if (error) { failed++; console.error(error.message); } else updated++;
        } else {
          const { error } = await supabase.from("marketing_contacts").insert(c);
          if (error) { failed++; console.error(error.message); } else inserted++;
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, inserted, updated, failed, total: rows.length }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("import error", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
