import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { formatPhone } from "@/lib/phone";
import { UserCheck, UserPlus, Loader2 } from "lucide-react";

interface ReviewRow {
  id: string;
  reason: string | null;
  created_at: string;
  candidate_swimmer_id: string | null;
  memberships: {
    id: string;
    child_first_name: string | null;
    child_last_name: string | null;
    child_dob: string | null;
    parent_first_name: string | null;
    parent_last_name: string | null;
    parent_email: string | null;
    parent_phone: string | null;
    plan_key: string | null;
    status: string | null;
    swimmer_id: string | null;
  } | null;
  swimmers: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    dob: string | null;
  } | null;
}

const formatDate = (value?: string | null) => {
  if (!value) return "Not on file";
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const fullName = (first?: string | null, last?: string | null) =>
  [first, last].filter(Boolean).join(" ").trim() || "Not on file";

const Field = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0">
    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="text-sm text-foreground break-words">{value}</p>
  </div>
);

const SwimmerMatchReviewAdmin = () => {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["swimmer-match-reviews"],
    queryFn: async (): Promise<ReviewRow[]> => {
      const { data, error } = await supabase
        .from("swimmer_match_reviews")
        .select(
          `id, reason, created_at, candidate_swimmer_id,
           memberships:memberships!swimmer_match_reviews_membership_id_fkey (
             id, child_first_name, child_last_name, child_dob,
             parent_first_name, parent_last_name, parent_email, parent_phone,
             plan_key, status, swimmer_id
           ),
           swimmers:swimmers!swimmer_match_reviews_candidate_swimmer_id_fkey (
             id, first_name, last_name, dob
           )`
        )
        .is("resolved_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as ReviewRow[];
    },
  });

  const resolve = useMutation({
    mutationFn: async ({ reviewId, action }: { reviewId: string; action: "same" | "different" }) => {
      // One database function call, so linking the membership and closing the
      // review happen inside a single transaction. It refuses when the
      // membership already has a swimmer_id rather than overwriting it.
      const { error } = await supabase.rpc("admin_resolve_swimmer_match" as never, {
        p_review_id: reviewId,
        p_action: action,
      } as never);
      if (error) throw error;
    },
    onSuccess: (_result, variables) => {
      toast({
        title: variables.action === "same" ? "Linked to the existing swimmer" : "New swimmer created",
      });
      void queryClient.invalidateQueries({ queryKey: ["swimmer-match-reviews"] });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Could not resolve this review.";
      toast({ title: "Nothing was changed", description: message, variant: "destructive" });
      void queryClient.invalidateQueries({ queryKey: ["swimmer-match-reviews"] });
    },
    onSettled: () => setPending(null),
  });

  const rows = useMemo(() => data ?? [], [data]);

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="font-display text-2xl font-semibold text-foreground">Swimmer match review</h2>
        <p className="text-sm text-muted-foreground">
          Memberships the nightly job could not safely link to a swimmer record. Review each one and
          tell us whether it is the same child or a different person.
        </p>
      </header>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading review queue
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive">We could not load the review queue. Try again.</p>
      )}

      {!isLoading && !error && rows.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <UserCheck className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="text-base font-medium text-foreground">No swimmers need review.</p>
            <p className="text-sm text-muted-foreground">
              Everything the nightly job found matched cleanly. Nothing to do here.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {rows.map((row) => {
          const m = row.memberships;
          const candidate = row.swimmers;
          const busy = pending === row.id;
          const alreadyLinked = Boolean(m?.swimmer_id);

          return (
            <Card key={row.id}>
              <CardContent className="p-4 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-foreground">
                      {fullName(m?.child_first_name, m?.child_last_name)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Flagged {new Date(row.created_at).toLocaleString("en-US")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {m?.plan_key && <Badge variant="secondary">{m.plan_key}</Badge>}
                    {m?.status && <Badge variant="outline">{m.status}</Badge>}
                  </div>
                </div>

                <p className="rounded-md bg-muted/60 px-3 py-2 text-sm text-foreground">
                  {row.reason || "No reason recorded."}
                </p>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Child date of birth" value={formatDate(m?.child_dob)} />
                  <Field
                    label="Parent"
                    value={fullName(m?.parent_first_name, m?.parent_last_name)}
                  />
                  <Field label="Parent email" value={m?.parent_email || "Not on file"} />
                  <Field label="Parent phone" value={formatPhone(m?.parent_phone) || "Not on file"} />
                  <Field
                    label="Candidate swimmer"
                    value={
                      candidate ? fullName(candidate.first_name, candidate.last_name) : "None found"
                    }
                  />
                  <Field
                    label="Candidate date of birth"
                    value={candidate ? formatDate(candidate.dob) : "Not applicable"}
                  />
                </div>

                {alreadyLinked && (
                  <p className="text-sm text-destructive">
                    This membership is already linked to a swimmer. Refresh the page.
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={busy || alreadyLinked || !row.candidate_swimmer_id}
                    onClick={() => {
                      setPending(row.id);
                      resolve.mutate({ reviewId: row.id, action: "same" });
                    }}
                  >
                    <UserCheck className="mr-2 h-4 w-4" />
                    Same swimmer
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || alreadyLinked}
                    onClick={() => {
                      setPending(row.id);
                      resolve.mutate({ reviewId: row.id, action: "different" });
                    }}
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    Different person
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default SwimmerMatchReviewAdmin;
