import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, Trash2, Eye, Send, Clock, Save, GripVertical, Search } from "lucide-react";

type Block =
  | { type: "heading"; text: string; align?: "left" | "center" }
  | { type: "text"; html: string }
  | { type: "image"; url: string; alt?: string; href?: string }
  | { type: "button"; text: string; url: string; align?: "left" | "center" }
  | { type: "divider" }
  | { type: "spacer"; size?: "sm" | "md" | "lg" };

type Audience = {
  tags: string[];
  sources: string[];
  include_all: boolean;
  session_period_ids?: string[];
  swim_session_ids?: string[];
  swim_levels?: string[];
  lesson_interests?: string[];
  lesson_interest_age?: "all" | "u14" | "14plus";
};

type Campaign = {
  id: string;
  name: string;
  subject: string;
  preheader: string | null;
  from_address: string | null;
  reply_to: string | null;
  body_blocks: Block[];
  audience: Audience;
  status: string;
  scheduled_for: string | null;
  sent_at: string | null;
  sent_count: number;
  failed_count: number;
  opened_count: number;
};

const SOURCE_OPTIONS = ["swim", "lessons", "scuba", "inquiry", "import", "manual"];
const COMMON_TAGS = ["swim", "private-lessons", "scuba", "inquiry", "level:white", "level:red", "level:yellow", "level:blue", "level:green"];
const SWIM_LEVELS = ["white", "red", "yellow", "blue", "green"];
const LESSON_INTERESTS = ["private", "semi-private", "adult"];

function newBlock(type: Block["type"]): Block {
  switch (type) {
    case "heading": return { type, text: "New heading", align: "left" };
    case "text": return { type, html: "Write your message here…" };
    case "image": return { type, url: "", alt: "" };
    case "button": return { type, text: "Click here", url: "https://aquaticdreamsswim.com", align: "center" };
    case "divider": return { type };
    case "spacer": return { type, size: "md" };
  }
}

function emptyCampaign(): Partial<Campaign> {
  return {
    name: "Untitled campaign",
    subject: "",
    preheader: "",
    body_blocks: [
      { type: "heading", text: "Big news from Aquatic Dreams!" },
      { type: "text", html: "Hi there,<br/><br/>Write your message here. Use the blocks on the left to add buttons, images, and more." },
      { type: "button", text: "Visit our website", url: "https://aquaticdreamsswim.com", align: "center" },
    ],
    audience: { tags: [], sources: [], include_all: true },
    status: "draft",
  };
}

export default function MarketingAdmin() {
  const [tab, setTab] = useState("campaigns");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAll = async () => {
    setLoading(true);
    const [{ data: c }, { data: k }] = await Promise.all([
      supabase.from("marketing_campaigns").select("*").order("created_at", { ascending: false }),
      supabase.from("marketing_contacts").select("*").order("created_at", { ascending: false }).limit(2000),
    ]);
    setCampaigns((c as any) || []);
    setContacts(k || []);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  const createCampaign = async () => {
    const { data, error } = await supabase
      .from("marketing_campaigns")
      .insert(emptyCampaign() as any)
      .select("*")
      .single();
    if (error) { toast.error(error.message); return; }
    setCampaigns((p) => [data as any, ...p]);
    setEditing(data as any);
  };

  const deleteCampaign = async (id: string) => {
    if (!confirm("Delete this campaign?")) return;
    const { error } = await supabase.from("marketing_campaigns").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setCampaigns((p) => p.filter((c) => c.id !== id));
    if (editing?.id === id) setEditing(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold font-display text-foreground">Marketing</h1>
        {tab === "campaigns" && (
          <Button onClick={createCampaign}><Plus className="w-4 h-4 mr-2" />New campaign</Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="contacts">Contacts ({contacts.length})</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="mt-4">
          {loading ? <p>Loading…</p> : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Name</TableHead><TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead><TableHead>Sent</TableHead>
                    <TableHead>Date</TableHead><TableHead></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {campaigns.map((c) => (
                      <TableRow key={c.id} className="cursor-pointer" onClick={() => setEditing(c)}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{c.subject || "—"}</TableCell>
                        <TableCell><Badge variant={c.status === "sent" ? "default" : "outline"}>{c.status}</Badge></TableCell>
                        <TableCell className="text-sm">{c.sent_count ?? 0}{c.failed_count ? ` (${c.failed_count} failed)` : ""}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {c.sent_at ? new Date(c.sent_at).toLocaleString() : c.scheduled_for ? `📅 ${new Date(c.scheduled_for).toLocaleString()}` : "—"}
                        </TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); deleteCampaign(c.id); }}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {campaigns.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No campaigns yet. Click "New campaign" to get started.
                      </TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="contacts" className="mt-4">
          <ContactsTab contacts={contacts} onChange={loadAll} />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <SettingsTab />
        </TabsContent>
      </Tabs>

      {editing && (
        <CampaignEditor
          campaign={editing}
          contacts={contacts}
          onClose={() => setEditing(null)}
          onSaved={(c) => {
            setCampaigns((p) => p.map((x) => (x.id === c.id ? c : x)));
            setEditing(c);
          }}
        />
      )}
    </div>
  );
}

// ----------------------- Contacts tab -----------------------
function ContactsTab({ contacts, onChange }: { contacts: any[]; onChange: () => void }) {
  const [q, setQ] = useState("");
  const [source, setSource] = useState<string>("all");
  const [showAddDialog, setShowAddDialog] = useState(false);

  const filtered = useMemo(() => contacts.filter((c) => {
    if (source !== "all" && c.source !== source) return false;
    if (q && !`${c.email} ${c.first_name ?? ""} ${c.last_name ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [contacts, q, source]);

  const toggleSubscribed = async (c: any) => {
    const next = !c.subscribed;
    await supabase.from("marketing_contacts").update({
      subscribed: next,
      unsubscribed_at: next ? null : new Date().toISOString(),
    }).eq("id", c.id);
    onChange();
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {SOURCE_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => setShowAddDialog(true)}><Plus className="w-4 h-4 mr-2" />Add contact</Button>
      </div>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Email</TableHead><TableHead>Name</TableHead>
            <TableHead>Source</TableHead><TableHead>Tags</TableHead>
            <TableHead>Status</TableHead><TableHead>Added</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.slice(0, 500).map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-xs">{c.email}</TableCell>
                <TableCell>{[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}</TableCell>
                <TableCell><Badge variant="outline">{c.source}</Badge></TableCell>
                <TableCell className="text-xs">{(c.tags || []).slice(0, 4).join(", ")}</TableCell>
                <TableCell>
                  <Button size="sm" variant={c.subscribed ? "ghost" : "outline"} onClick={() => toggleSubscribed(c)}>
                    {c.subscribed ? "Subscribed" : "Unsubscribed"}
                  </Button>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No contacts match.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        {filtered.length > 500 && <p className="text-xs text-muted-foreground p-3">Showing first 500 of {filtered.length}.</p>}
      </CardContent></Card>

      <AddContactDialog open={showAddDialog} onOpenChange={setShowAddDialog} onSaved={onChange} />
    </div>
  );
}

function AddContactDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (b: boolean) => void; onSaved: () => void }) {
  const [email, setEmail] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [tags, setTags] = useState("");
  const save = async () => {
    if (!email.trim()) return;
    const { error } = await supabase.from("marketing_contacts").insert({
      email: email.trim().toLowerCase(),
      first_name: first || null,
      last_name: last || null,
      source: "manual",
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Contact added");
    setEmail(""); setFirst(""); setLast(""); setTags("");
    onOpenChange(false); onSaved();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add contact</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Email *</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>First name</Label><Input value={first} onChange={(e) => setFirst(e.target.value)} /></div>
            <div><Label>Last name</Label><Input value={last} onChange={(e) => setLast(e.target.value)} /></div>
          </div>
          <div><Label>Tags (comma-separated)</Label><Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="swim, vip" /></div>
        </div>
        <DialogFooter><Button onClick={save}>Add</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ----------------------- Settings tab -----------------------
function SettingsTab() {
  return (
    <Card><CardContent className="p-6 space-y-3 text-sm">
      <p className="text-muted-foreground">
        <strong>From address:</strong> Aquatic Dreams &lt;info@aquaticdreamsswim.com&gt; (set per-campaign to override)
      </p>
      <p className="text-muted-foreground">
        <strong>Mailing address (footer):</strong> Aquatic Dreams, Modesto, CA
      </p>
      <p className="text-muted-foreground">
        <strong>Resend webhook URL:</strong> Add this in your Resend dashboard for delivery / open / bounce tracking:
      </p>
      <code className="block bg-muted p-2 rounded text-xs break-all">
        {import.meta.env.VITE_SUPABASE_URL}/functions/v1/resend-webhook
      </code>
      <p className="text-muted-foreground text-xs">
        Subscribe it to: email.sent, email.delivered, email.opened, email.clicked, email.bounced, email.complained.
      </p>
    </CardContent></Card>
  );
}

// ----------------------- Campaign editor -----------------------
function CampaignEditor({
  campaign, contacts, onClose, onSaved,
}: { campaign: Campaign; contacts: any[]; onClose: () => void; onSaved: (c: Campaign) => void }) {
  const [c, setC] = useState<Campaign>({ ...campaign, audience: campaign.audience || { tags: [], sources: [], include_all: true }, body_blocks: campaign.body_blocks || [] });
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const [testTo, setTestTo] = useState("");

  const audienceCount = useMemo(() => {
    const a = c.audience || { tags: [], sources: [], include_all: true };
    return contacts.filter((x) => {
      if (!x.subscribed) return false;
      if (a.include_all && a.tags.length === 0 && a.sources.length === 0) return true;
      if (a.sources.includes(x.source)) return true;
      if (a.tags.some((t: string) => (x.tags || []).includes(t))) return true;
      return false;
    }).length;
  }, [c.audience, contacts]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.functions.invoke("preview-marketing-campaign", {
        body: { subject: c.subject, preheader: c.preheader, blocks: c.body_blocks },
      });
      if (!cancelled && data?.html) setPreviewHtml(data.html);
    })();
    return () => { cancelled = true; };
  }, [c.subject, c.preheader, c.body_blocks]);

  const save = async (patch: Partial<Campaign> = {}) => {
    const payload = { ...c, ...patch };
    const { data, error } = await supabase
      .from("marketing_campaigns")
      .update({
        name: payload.name, subject: payload.subject, preheader: payload.preheader,
        from_address: payload.from_address, reply_to: payload.reply_to,
        body_blocks: payload.body_blocks as any, audience: payload.audience as any,
        status: payload.status, scheduled_for: payload.scheduled_for,
      })
      .eq("id", c.id).select("*").single();
    if (error) { toast.error(error.message); return null; }
    setC(data as any);
    onSaved(data as any);
    return data as unknown as Campaign;
  };

  const sendNow = async () => {
    if (!confirm(`Send to ${audienceCount} contacts now?`)) return;
    await save();
    const { error } = await supabase.functions.invoke("send-marketing-campaign", { body: { campaign_id: c.id } });
    if (error) { toast.error(error.message); return; }
    toast.success("Sending started");
    onClose();
  };

  const sendTest = async () => {
    if (!testTo) return;
    await save();
    const { error } = await supabase.functions.invoke("send-marketing-campaign", { body: { campaign_id: c.id, test_email: testTo } });
    if (error) toast.error(error.message); else toast.success(`Test sent to ${testTo}`);
  };

  const schedule = async () => {
    if (!scheduleAt) return;
    const iso = new Date(scheduleAt).toISOString();
    const saved = await save({ status: "scheduled", scheduled_for: iso });
    if (saved) { toast.success(`Scheduled for ${new Date(iso).toLocaleString()}`); setScheduleOpen(false); onClose(); }
  };

  const updateBlock = (i: number, b: Block) => {
    const next = [...c.body_blocks]; next[i] = b; setC({ ...c, body_blocks: next });
  };
  const removeBlock = (i: number) => setC({ ...c, body_blocks: c.body_blocks.filter((_, idx) => idx !== i) });
  const addBlock = (type: Block["type"]) => setC({ ...c, body_blocks: [...c.body_blocks, newBlock(type)] });
  const moveBlock = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= c.body_blocks.length) return;
    const next = [...c.body_blocks]; [next[i], next[j]] = [next[j], next[i]];
    setC({ ...c, body_blocks: next });
  };

  const toggleTag = (tag: string) => {
    const tags = c.audience.tags.includes(tag) ? c.audience.tags.filter((t) => t !== tag) : [...c.audience.tags, tag];
    setC({ ...c, audience: { ...c.audience, tags, include_all: tags.length === 0 && c.audience.sources.length === 0 } });
  };
  const toggleSource = (s: string) => {
    const sources = c.audience.sources.includes(s) ? c.audience.sources.filter((x) => x !== s) : [...c.audience.sources, s];
    setC({ ...c, audience: { ...c.audience, sources, include_all: sources.length === 0 && c.audience.tags.length === 0 } });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[95vw] h-[92vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-4 pb-2 border-b">
          <div className="flex items-center justify-between gap-3">
            <Input className="text-lg font-semibold border-0 px-0 focus-visible:ring-0"
              value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => save()}><Save className="w-4 h-4 mr-2" />Save draft</Button>
              <Button variant="outline" onClick={() => setScheduleOpen(true)}><Clock className="w-4 h-4 mr-2" />Schedule</Button>
              <Button onClick={sendNow}><Send className="w-4 h-4 mr-2" />Send now ({audienceCount})</Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 overflow-hidden">
          {/* Editor */}
          <div className="overflow-y-auto p-6 space-y-4 border-r">
            <div className="grid grid-cols-1 gap-3">
              <div><Label>Subject *</Label><Input value={c.subject} onChange={(e) => setC({ ...c, subject: e.target.value })} placeholder="Sale in the scuba shop!" /></div>
              <div><Label>Preview text (inbox preview)</Label><Input value={c.preheader ?? ""} onChange={(e) => setC({ ...c, preheader: e.target.value })} placeholder="20% off all gear this week only" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">From (override)</Label><Input value={c.from_address ?? ""} onChange={(e) => setC({ ...c, from_address: e.target.value })} placeholder="Aquatic Dreams <info@aquaticdreamsswim.com>" /></div>
                <div><Label className="text-xs">Reply-to</Label><Input value={c.reply_to ?? ""} onChange={(e) => setC({ ...c, reply_to: e.target.value })} placeholder="info@aquaticdreamsswim.com" /></div>
              </div>
            </div>

            <div>
              <Label>Audience ({audienceCount} subscribed contacts)</Label>
              <div className="border rounded-md p-3 mt-1 space-y-2 text-sm">
                <div>
                  <div className="text-xs font-semibold text-muted-foreground mb-1">Sources</div>
                  <div className="flex flex-wrap gap-1">
                    {SOURCE_OPTIONS.map((s) => (
                      <button key={s} type="button"
                        onClick={() => toggleSource(s)}
                        className={`px-2 py-1 rounded-full text-xs border ${c.audience.sources.includes(s) ? "bg-primary text-primary-foreground" : "bg-background"}`}>{s}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-muted-foreground mb-1">Tags</div>
                  <div className="flex flex-wrap gap-1">
                    {COMMON_TAGS.map((t) => (
                      <button key={t} type="button"
                        onClick={() => toggleTag(t)}
                        className={`px-2 py-1 rounded-full text-xs border ${c.audience.tags.includes(t) ? "bg-primary text-primary-foreground" : "bg-background"}`}>{t}</button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">No filters = everyone subscribed.</p>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Content blocks</Label>
                <div className="flex gap-1 flex-wrap">
                  {(["heading", "text", "image", "button", "divider", "spacer"] as Block["type"][]).map((t) => (
                    <Button key={t} size="sm" variant="outline" onClick={() => addBlock(t)}>+ {t}</Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                {c.body_blocks.map((b, i) => (
                  <BlockEditor key={i} block={b} onChange={(nb) => updateBlock(i, nb)}
                    onRemove={() => removeBlock(i)}
                    onMoveUp={() => moveBlock(i, -1)} onMoveDown={() => moveBlock(i, 1)} />
                ))}
                {c.body_blocks.length === 0 && <p className="text-sm text-muted-foreground">No content yet. Add a block above.</p>}
              </div>
            </div>

            <div className="border-t pt-4 flex gap-2 items-end">
              <div className="flex-1">
                <Label className="text-xs">Send a test email</Label>
                <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="your@email.com" />
              </div>
              <Button variant="outline" onClick={sendTest}><Eye className="w-4 h-4 mr-2" />Send test</Button>
            </div>
          </div>

          {/* Preview */}
          <div className="overflow-hidden bg-muted/20">
            <iframe title="preview" srcDoc={previewHtml} sandbox="" className="w-full h-full border-0" />
          </div>
        </div>

        <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Schedule send</DialogTitle></DialogHeader>
            <Input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
            <DialogFooter><Button onClick={schedule}>Schedule</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

function BlockEditor({ block, onChange, onRemove, onMoveUp, onMoveDown }:
  { block: Block; onChange: (b: Block) => void; onRemove: () => void; onMoveUp: () => void; onMoveDown: () => void }) {
  return (
    <div className="border rounded-md p-3 bg-background">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <GripVertical className="w-3 h-3" /><span className="uppercase font-semibold">{block.type}</span>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={onMoveUp}>↑</Button>
          <Button size="sm" variant="ghost" onClick={onMoveDown}>↓</Button>
          <Button size="sm" variant="ghost" onClick={onRemove}><Trash2 className="w-3 h-3" /></Button>
        </div>
      </div>
      {block.type === "heading" && (
        <Input value={block.text} onChange={(e) => onChange({ ...block, text: e.target.value })} />
      )}
      {block.type === "text" && (
        <Textarea value={block.html} rows={4} onChange={(e) => onChange({ ...block, html: e.target.value })} placeholder="Plain text or basic HTML (links, <br/>, <strong>)" />
      )}
      {block.type === "image" && (
        <div className="space-y-2">
          <Input value={block.url} onChange={(e) => onChange({ ...block, url: e.target.value })} placeholder="https://image.url/photo.jpg" />
          <Input value={block.alt ?? ""} onChange={(e) => onChange({ ...block, alt: e.target.value })} placeholder="Alt text" />
          <Input value={block.href ?? ""} onChange={(e) => onChange({ ...block, href: e.target.value })} placeholder="Optional link URL" />
        </div>
      )}
      {block.type === "button" && (
        <div className="grid grid-cols-2 gap-2">
          <Input value={block.text} onChange={(e) => onChange({ ...block, text: e.target.value })} placeholder="Button text" />
          <Input value={block.url} onChange={(e) => onChange({ ...block, url: e.target.value })} placeholder="https://…" />
        </div>
      )}
      {block.type === "spacer" && (
        <Select value={block.size ?? "md"} onValueChange={(v: any) => onChange({ ...block, size: v })}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="sm">Small</SelectItem>
            <SelectItem value="md">Medium</SelectItem>
            <SelectItem value="lg">Large</SelectItem>
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
