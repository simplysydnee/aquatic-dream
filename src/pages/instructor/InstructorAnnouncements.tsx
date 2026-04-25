import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Megaphone, Pin, Check } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

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

export default function InstructorAnnouncements() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [instructorId, setInstructorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    const { data: inst } = await supabase
      .from("instructors")
      .select("id")
      .eq("user_id", u.user?.id ?? "")
      .maybeSingle();
    setInstructorId(inst?.id ?? null);

    const { data, error } = await supabase
      .from("announcements")
      .select("*")
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setItems((data ?? []) as Announcement[]);

    if (inst?.id) {
      const { data: r } = await supabase
        .from("announcement_reads")
        .select("announcement_id")
        .eq("instructor_id", inst.id);
      setReadIds(new Set((r ?? []).map((x: any) => x.announcement_id)));
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const markRead = async (id: string) => {
    if (!instructorId || readIds.has(id)) return;
    const { error } = await supabase
      .from("announcement_reads")
      .insert({ announcement_id: id, instructor_id: instructorId });
    if (!error) setReadIds(new Set([...readIds, id]));
  };

  const markAllRead = async () => {
    if (!instructorId) return;
    const unread = items.filter((a) => !readIds.has(a.id));
    if (unread.length === 0) return;
    const { error } = await supabase
      .from("announcement_reads")
      .insert(unread.map((a) => ({ announcement_id: a.id, instructor_id: instructorId })));
    if (error) return toast.error(error.message);
    setReadIds(new Set(items.map((a) => a.id)));
    toast.success("All marked as read");
  };

  const unreadCount = items.filter((a) => !readIds.has(a.id)).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-display font-semibold flex items-center gap-2">
            <Megaphone className="w-5 h-5" /> Announcements
            {unreadCount > 0 && <Badge variant="destructive">{unreadCount} new</Badge>}
          </h2>
          <p className="text-sm text-muted-foreground">Updates from your admin team.</p>
        </div>
        {unreadCount > 0 && (
          <Button size="sm" variant="outline" onClick={markAllRead}>
            <Check className="w-4 h-4 mr-1" /> Mark all read
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No announcements yet.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {items.map((a) => {
            const isUnread = !readIds.has(a.id);
            return (
              <Card key={a.id} className={isUnread ? "border-primary/50 shadow-sm" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                      {a.pinned && <Pin className="w-4 h-4 text-primary" />}
                      {a.title}
                      <Badge className={priorityStyle[a.priority]} variant="secondary">{a.priority}</Badge>
                      {isUnread && <Badge variant="destructive" className="text-[10px]">NEW</Badge>}
                    </CardTitle>
                    {isUnread && (
                      <Button size="sm" variant="ghost" onClick={() => markRead(a.id)}>
                        <Check className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(a.created_at), "MMM d, yyyy h:mm a")}
                  </p>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap" onClick={() => markRead(a.id)}>{a.body}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
