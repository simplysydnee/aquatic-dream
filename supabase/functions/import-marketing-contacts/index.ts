import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-import-token",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

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
    const token = req.headers.get("x-import-token");
    if (token !== "scuba-import-2026") {
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

    const parsed = rows.map((r) => ({
      email: (r[iE] || "").trim().toLowerCase(),
      first_name: (r[iF] || "").trim() || null,
      last_name: (r[iL] || "").trim() || null,
      phone: (r[iP] || "").trim() || null,
    })).filter((x) => x.email && x.email.includes("@"));

    // Dedupe by email
    const map = new Map<string, typeof parsed[number]>();
    for (const r of parsed) if (!map.has(r.email)) map.set(r.email, r);
    const unique = [...map.values()];

    // Load all existing contacts (paged)
    let from = 0; const PAGE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from("marketing_contacts")
        .select("id, email, tags, first_name, last_name, phone")
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      for (const r of (data || [])) existing.set((r.email as string).toLowerCase(), r as any);
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }

    // existing now declared above? add declaration

    const toInsert: any[] = [];
    const toUpdate: { id: string; patch: any }[] = [];
    for (const r of unique) {
      const ex = existing.get(r.email);
      if (ex) {
        const currentTags = ex.tags || [];
        const missingTags = tags.filter((t) => !currentTags.includes(t));
        const needsName = !ex.first_name && r.first_name;
        const needsLast = !ex.last_name && r.last_name;
        const needsPhone = !ex.phone && r.phone;
        if (missingTags.length === 0 && !needsName && !needsLast && !needsPhone) continue;
        toUpdate.push({
          id: ex.id,
          patch: {
            tags: [...currentTags, ...missingTags],
            first_name: ex.first_name || r.first_name,
            last_name: ex.last_name || r.last_name,
            phone: ex.phone || r.phone,
            updated_at: new Date().toISOString(),
          },
        });
      } else {
        toInsert.push({ ...r, source, tags });
      }
    }

    let inserted = 0, updated = 0, failed = 0;
    for (let i = 0; i < toInsert.length; i += 500) {
      const chunk = toInsert.slice(i, i + 500);
      const { error } = await supabase.from("marketing_contacts").insert(chunk);
      if (error) { failed += chunk.length; console.error("insert", error.message); }
      else inserted += chunk.length;
    }

    // Updates - run in parallel batches
    const PAR = 25;
    for (let i = 0; i < toUpdate.length; i += PAR) {
      const batch = toUpdate.slice(i, i + PAR);
      const results = await Promise.all(batch.map(async (u) => {
        const { error } = await supabase.from("marketing_contacts").update(u.patch).eq("id", u.id);
        return error;
      }));
      for (const e of results) { if (e) { failed++; console.error("update", e.message); } else updated++; }
    }

    return new Response(JSON.stringify({
      ok: true,
      total_in_csv: unique.length,
      existed: toUpdate.length,
      new: toInsert.length,
      inserted, updated, failed,
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("import error", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
