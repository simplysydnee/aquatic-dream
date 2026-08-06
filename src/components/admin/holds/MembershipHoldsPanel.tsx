import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, MessageSquare, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { formatPhone } from "@/lib/phone";
import { LEVEL_GROUP_NAMES } from "@/components/swim-enrollment/types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PLAN_LABELS: Record<string, string> = {
  kid_group: "Small Group",
  private: "Private",
  adult_group: "Adult",
};

interface HoldRow {
  id: string;
  status: string;
  plan_key: string;
  swim_level: string | null;
  swimmer_name: string;
  parent_name: string;
  parent_phone: string;
  parent_email: string | null;
  held_until: string;
  sms_sent_at: string | null;
  reminder_sent_at: string | null;
  last_manual_reminder_at: string | null;
  expired_at: string | null;
  converted_at: string | null;
  created_at: string;
  standing_slot_id: string;
  standing_slots: {
    day_of_week: number;
    start_time: string;
    instructor_id: string | null;
  } | null;
}


const fmtTime = (t: string) => {
  const [h, m] = t.split(":").map((n) => parseInt(n, 10));
  if (Number.isNaN(h)) return t;
  const period = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m ?? 0).padStart(2, "0")} ${period}`;
};

const fmtWhen = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

const countdown = (iso: string) => {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const hrs = Math.floor(ms / 3_600_000);
  if (hrs >= 1) return `${hrs} hr${hrs === 1 ? "" : "s"} left`;
  return `${Math.max(1, Math.round(ms / 60_000))} min left`;
};

interface Props {
  refreshKey?: number;
  onChanged?: () => void;
  /** Prefix shown on the collapsed one-line state, e.g. "24 slots in reserve". */
  collapsedPrefix?: string;
}


export function MembershipHoldsPanel({ refreshKey, onChanged, collapsedPrefix }: Props) {
  const [rows, setRows] = useState<HoldRow[]>([]);
  const [instructors, setInstructors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [showExpired, setShowExpired] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [remindTarget, setRemindTarget] = useState<HoldRow | null>(null);
  const [reminding, setReminding] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [holdRes, instRes] = await Promise.all([
      supabase
        .from("membership_holds")
        .select(
          "id, status, plan_key, swim_level, swimmer_name, parent_name, parent_phone, parent_email, held_until, sms_sent_at, reminder_sent_at, last_manual_reminder_at, expired_at, converted_at, created_at, standing_slot_id, standing_slots(day_of_week, start_time, instructor_id)",
        )

        .in("status", ["held", "expired", "cancelled"])
        .order("held_until", { ascending: true }),
      supabase.rpc("get_instructors_admin"),
    ]);
    if (holdRes.error) toast.error("Could not load pending enrollments");
    setRows((holdRes.data as unknown as HoldRow[]) || []);
    const map: Record<string, string> = {};
    ((instRes.data as { id: string; name: string }[] | null) || []).forEach((i) => {
      map[i.id] = i.name;
    });
    setInstructors(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const visible = useMemo(() => {
    const now = Date.now();
    return rows.filter((r) => {
      const live = r.status === "held" && new Date(r.held_until).getTime() > now;
      return showExpired ? !live : live;
    });
  }, [rows, showExpired]);

  const cancelHold = async (id: string) => {
    setCancelling(id);
    const { error } = await supabase
      .from("membership_holds")
      .update({ status: "cancelled" })
      .eq("id", id);
    setCancelling(null);
    if (error) {
      toast.error("Could not cancel the hold");
      return;
    }
    toast.success("Hold cancelled, spot released");
    load();
    onChanged?.();
  };

  const sendReminder = async (row: HoldRow) => {
    setReminding(row.id);
    const { data, error } = await supabase.functions.invoke("send-membership-hold-reminder", {
      body: { hold_id: row.id },
    });
    setReminding(null);
    if (error) {
      let detail = error.message;
      const ctx = (error as { context?: { text?: () => Promise<string> } }).context;
      if (ctx?.text) {
        try {
          const parsed = JSON.parse(await ctx.text()) as { error?: string };
          if (parsed?.error) detail = parsed.error;
        } catch {
          // keep the generic message
        }
      }
      toast.error(detail || "Could not send the reminder");
      return;
    }
    const payload = data as { success?: boolean; error?: string } | null;
    if (!payload?.success) {
      toast.error(payload?.error || "Could not send the reminder");
      return;
    }
    toast.success(`Reminder texted to ${row.parent_name}`);
    load();
  };



  // Nothing held and nothing to review collapses to a single muted line.
  if (!loading && !showExpired && visible.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-muted-foreground">
        <span>
          {collapsedPrefix ? `${collapsedPrefix} · ` : ""}No spots held
        </span>
        <button
          type="button"
          className="underline underline-offset-2 hover:text-foreground"
          onClick={() => setShowExpired(true)}
        >
          Show expired and cancelled
        </button>
      </div>
    );
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Pending enrollments
          </h2>

          <p className="text-xs text-muted-foreground">
            Spots held over the phone, waiting on the parent to finish forms and card.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowExpired((v) => !v)}>
            {showExpired ? "Show active holds" : "Show expired and cancelled"}
          </Button>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading
        </p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {showExpired ? "Nothing expired or cancelled." : "No spots are currently held."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Swimmer</th>
                <th className="py-2 pr-3 font-medium">Parent</th>
                <th className="py-2 pr-3 font-medium">Phone</th>
                <th className="py-2 pr-3 font-medium">Program</th>
                <th className="py-2 pr-3 font-medium">Slot</th>
                <th className="py-2 pr-3 font-medium">Sent</th>
                <th className="py-2 pr-3 font-medium">Reminder</th>
                <th className="py-2 pr-3 font-medium">{showExpired ? "Status" : "Expires"}</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const slot = r.standing_slots;
                const instructor = slot?.instructor_id ? instructors[slot.instructor_id] : null;
                const live = r.status === "held" && new Date(r.held_until).getTime() > Date.now();
                return (
                  <tr key={r.id} className="border-b last:border-0 align-top">
                    <td className="py-2 pr-3 font-medium">{r.swimmer_name}</td>
                    <td className="py-2 pr-3">{r.parent_name}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{formatPhone(r.parent_phone)}</td>
                    <td className="py-2 pr-3">
                      {PLAN_LABELS[r.plan_key] ?? r.plan_key}
                      {r.swim_level && (
                        <span className="block text-xs text-muted-foreground">
                          {LEVEL_GROUP_NAMES[r.swim_level as keyof typeof LEVEL_GROUP_NAMES] ?? r.swim_level}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {slot ? `${DAYS[slot.day_of_week]} ${fmtTime(slot.start_time)}` : "—"}
                      {instructor && (
                        <span className="block text-xs text-muted-foreground">{instructor}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                      {fmtWhen(r.sms_sent_at)}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                      {r.reminder_sent_at ? fmtWhen(r.reminder_sent_at) : "Not yet"}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {live ? (
                        <>
                          {fmtWhen(r.held_until)}
                          <span className="block text-xs text-muted-foreground">
                            {countdown(r.held_until)}
                          </span>
                        </>
                      ) : (
                        <span className="capitalize text-muted-foreground">
                          {r.status === "held" ? "expired" : r.status}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      {live && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => cancelHold(r.id)}
                          disabled={cancelling === r.id}
                        >
                          {cancelling === r.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <X className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
