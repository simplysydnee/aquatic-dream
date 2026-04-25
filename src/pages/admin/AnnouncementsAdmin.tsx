import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Megaphone, Pin, Pencil, Trash2, Plus, Eye } from "lucide-react";
import { format } from "date-fns";

type Announcement = {
  id: string;
  title: string;
  body: string;
  priority: "normal" | "important" | "urgent";
  pinned: boolean;
  expires_at: string | null;
  created_at: string;
};

const priorityStyle: Record<string, string> = {
  normal: "bg-muted text-muted-foreground",
  important: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200",
  urgent: "bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-200",
};

export default function AnnouncementsAdmin() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [reads, setReads] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [form, setForm] = useState({
    title: "",
    body: "",
    priority: "normal" as Announcement["priority"],
    pinned: false,
    expires_at: "",
  });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("announcements")
      .select("*")
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setItems((data ?? []) as Announcement[]);

    const { data: r } = await supabase.from("announcement_reads").select("announcement_id");
    const counts: Record<string, number> = {};
    (r ?? []).forEach((x: any) => { counts[x.announcement_id] = (counts[x.announcement_id] ?? 0) + 1; });
    setReads(counts);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ title: "", body: "", priority: "normal", pinned: false, expires_at: "" });
    setOpen(true);
  };

  const openEdit = (a: Announcement) => {
    setEditing(a);
    setForm({
      title: a.title,
      body: a.body,
      priority: a.priority,
      pinned: a.pinned,
      expires_at: a.expires_at ? a.expires_at.slice(0, 10) : "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      toast.error("Title and body are required");
      return;
    }
    const payload = {
      title: form.title.trim(),
      body: form.body.trim(),
      priority: form.priority,
      pinned: form.pinned,
      expires_at: form.expires_at ? new Date(form.expires_at + "T23:59:59").toISOString() : null,
    };
    const { error } = editing
      ? await supabase.from("announcements").update(payload).eq("id", editing.id)
      : await supabase.from("announcements").insert({ ...payload, created_by: (await supabase.auth.getUser()).data.user?.id });
    if (error) return toast.error(error.message);
    toast.success(editing ? "Announcement updated" : "Announcement posted");
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this announcement?")) return;
    const { error } = await supabase.from("announcements").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Megaphone className="w-6 h-6" /> Announcements
          </h1>
          <p className="text-sm text-muted-foreground">Broadcast messages to the instructor team.</p>
        </div>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> New Announcement</Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No announcements yet.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {items.map((a) => {
            const expired = a.expires_at && new Date(a.expires_at) < new Date();
            return (
              <Card key={a.id} className={expired ? "opacity-60" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                        {a.pinned && <Pin className="w-4 h-4 text-primary" />}
                        {a.title}
                        <Badge className={priorityStyle[a.priority]} variant="secondary">{a.priority}</Badge>
                        {expired && <Badge variant="outline">expired</Badge>}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">
                        Posted {format(new Date(a.created_at), "MMM d, yyyy h:mm a")}
                        {a.expires_at && ` · Expires ${format(new Date(a.expires_at), "MMM d, yyyy")}`}
                        <span className="ml-2 inline-flex items-center gap-1"><Eye className="w-3 h-3" /> {reads[a.id] ?? 0} read</span>
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(a)}><Pencil className="w-4 h-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(a.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap">{a.body}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit announcement" : "New announcement"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label>Message</Label>
              <Textarea rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v: any) => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="important">Important</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Expires (optional)</Label>
                <Input type="date" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.pinned} onCheckedChange={(v) => setForm({ ...form, pinned: v })} />
              <Label>Pin to top</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>{editing ? "Save" : "Post"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
