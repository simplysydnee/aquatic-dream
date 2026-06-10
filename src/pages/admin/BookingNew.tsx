import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Inbox, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import BookingWizard from "@/components/admin/booking/BookingWizard";

interface PendingRequest {
  id: string;
  status: string;
  parent_name: string;
  parent_email: string;
  parent_phone: string | null;
  child_name: string;
  child_age: number | null;
  child_dob: string | null;
  preferred_times: string | null;
  notes: string | null;
  created_at: string;
}

function splitName(full: string | null | undefined): { first: string; last: string } {
  const s = (full || "").trim();
  if (!s) return { first: "", last: "" };
  const parts = s.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

const STATUS_TONE: Record<string, string> = {
  new: "bg-amber-100 text-amber-900 border-amber-300",
  contacted: "bg-sky-100 text-sky-900 border-sky-300",
  scheduled: "bg-emerald-100 text-emerald-900 border-emerald-300",
};

export default function BookingNew() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [loadingReqs, setLoadingReqs] = useState(true);
  const [prefill, setPrefill] = useState<{
    key: number;
    client: {
      parent_first: string;
      parent_last: string;
      parent_email: string;
      parent_phone: string;
      swimmers: { first_name: string; last_name: string; age: number | null; dob: string | null }[];
    };
  } | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("lesson_requests")
        .select("id,status,parent_name,parent_email,parent_phone,child_name,child_age,child_dob,preferred_times,notes,created_at")
        .in("status", ["new", "contacted"])
        .order("created_at", { ascending: false });
      setRequests((data as PendingRequest[] | null) ?? []);
      setLoadingReqs(false);

    })();
  }, []);

  const useRequest = (r: PendingRequest) => {
    const p = splitName(r.parent_name);
    const c = splitName(r.child_name);
    setPrefill({
      key: Date.now(),
      client: {
        parent_first: p.first,
        parent_last: p.last,
        parent_email: r.parent_email || "",
        parent_phone: r.parent_phone || "",
        swimmers: [{
          first_name: c.first,
          last_name: c.last,
          age: r.child_age ?? null,
          dob: r.child_dob || null,
        }],
      },
    });
    // Scroll to top of wizard
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="container max-w-7xl py-6">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">
        <ChevronLeft className="w-4 h-4 mr-1" /> Back
      </Button>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Book a lesson</h1>
        <p className="text-sm text-muted-foreground">Create a private, semi-private, or group enrollment.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <BookingWizard
            key={prefill?.key ?? "blank"}
            initialClient={prefill?.client}
            initialStep={prefill ? "type" : undefined}
            onCancel={() => navigate(-1)}
            onDone={() => navigate("/admin/private-lessons")}
          />
        </div>

        <aside className="space-y-3">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Inbox className="w-4 h-4 text-primary" />
                <h2 className="font-semibold text-sm">Pending lesson requests</h2>
              </div>
              <Badge variant="outline" className="text-[10px]">{requests.length}</Badge>
            </div>
            {loadingReqs ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : requests.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No open requests.</p>
            ) : (
              <div className="space-y-2 max-h-[70vh] overflow-y-auto">
                {requests.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => useRequest(r)}
                    className="w-full text-left p-2.5 border rounded-md hover:border-primary hover:bg-accent/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">
                          {r.child_name}
                          {r.child_age != null ? ` · age ${r.child_age}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{r.parent_name}</p>
                        {r.preferred_times && (
                          <p className="text-[11px] text-foreground/70 mt-1 line-clamp-2">
                            <span className="font-medium">Prefers:</span> {r.preferred_times}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      <Badge variant="outline" className={`text-[10px] shrink-0 ${STATUS_TONE[r.status] ?? ""}`}>
                        {r.status}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>
          <p className="text-[11px] text-muted-foreground px-1">
            Click a request to prefill the booking form with that family's info.
          </p>
        </aside>
      </div>
    </div>
  );
}
