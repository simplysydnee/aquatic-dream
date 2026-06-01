import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileSignature, Plus, Search, Camera, CameraOff } from "lucide-react";
import FrontDeskVisitorWaiverDialog from "@/components/admin/waivers/FrontDeskVisitorWaiverDialog";
import WaiverDetailDrawer from "@/components/admin/waivers/WaiverDetailDrawer";

export type WaiverSource = "visitor" | "lesson" | "enrollment";

export interface UnifiedWaiverRow {
  id: string;
  source: WaiverSource;
  signer_name: string;
  signer_email: string;
  signer_phone: string | null;
  swimmers: any[];
  photo_release: boolean;
  signed_at: string;
  raw: any;
}

const WaiversAdmin = () => {
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | WaiverSource>("all");
  const [kioskOpen, setKioskOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<UnifiedWaiverRow | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-waivers"],
    queryFn: async (): Promise<UnifiedWaiverRow[]> => {
      const [visitorsRes, agreementsRes] = await Promise.all([
        supabase
          .from("visitor_waivers")
          .select("*")
          .order("signed_at", { ascending: false }),
        supabase
          .from("enrollment_agreements")
          .select(
            "*, swim_enrollments:enrollment_id(child_name, parent_email)",
          )
          .order("signed_at", { ascending: false }),
      ]);
      if (visitorsRes.error) throw visitorsRes.error;
      if (agreementsRes.error) throw agreementsRes.error;

      const lessonBookingIds = Array.from(
        new Set(
          (agreementsRes.data || [])
            .map((a: any) => a.lesson_booking_id)
            .filter(Boolean),
        ),
      );
      const lessonBookingsById: Record<string, any> = {};
      if (lessonBookingIds.length > 0) {
        const { data: lb } = await supabase
          .from("lesson_bookings")
          .select("id, child_name, parent_email")
          .in("id", lessonBookingIds as string[]);
        for (const row of lb || []) lessonBookingsById[(row as any).id] = row;
      }

      const visitors: UnifiedWaiverRow[] = (visitorsRes.data || []).map((v: any) => ({
        id: v.id,
        source: "visitor",
        signer_name: `${v.signer_first_name || ""} ${v.signer_last_name || ""}`.trim(),
        signer_email: v.signer_email,
        signer_phone: v.signer_phone,
        swimmers: v.swimmers || [],
        photo_release: !!v.photo_release_accepted,
        signed_at: v.signed_at,
        raw: v,
      }));

      const agreements: UnifiedWaiverRow[] = (agreementsRes.data || []).map((a: any) => {
        const source: WaiverSource = a.enrollment_id ? "enrollment" : "lesson";
        const lb = a.lesson_booking_id ? lessonBookingsById[a.lesson_booking_id] : null;
        const childName =
          a.swim_enrollments?.child_name || lb?.child_name || null;
        return {
          id: a.id,
          source,
          signer_name:
            a.signer_name ||
            `${a.signer_first_name || ""} ${a.signer_last_name || ""}`.trim(),
          signer_email: a.signer_email,
          signer_phone: null,
          swimmers: childName ? [{ first_name: childName }] : [],
          photo_release: !!a.photo_release_accepted,
          signed_at: a.signed_at,
          raw: a,
        };
      });

      return [...visitors, ...agreements].sort(
        (a, b) => +new Date(b.signed_at) - +new Date(a.signed_at),
      );
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.filter((r) => {
      if (sourceFilter !== "all" && r.source !== sourceFilter) return false;
      if (!q) return true;
      const swimmerStr = (r.swimmers || [])
        .map((s: any) => `${s.first_name || ""} ${s.last_name || ""}`)
        .join(" ")
        .toLowerCase();
      return (
        r.signer_name.toLowerCase().includes(q) ||
        r.signer_email.toLowerCase().includes(q) ||
        swimmerStr.includes(q)
      );
    });
  }, [data, search, sourceFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileSignature className="w-6 h-6 text-primary" /> Waivers
          </h1>
          <p className="text-sm text-muted-foreground">
            Pool visitor liability waivers and enrollment/lesson agreements in one place.
          </p>
        </div>
        <Button
          className="bg-coral hover:bg-coral/90 text-coral-foreground"
          onClick={() => setKioskOpen(true)}
        >
          <Plus className="w-4 h-4 mr-1" /> Complete New Waiver
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by signer, email, or swimmer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as any)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="visitor">Visitor waivers</SelectItem>
            <SelectItem value="enrollment">Swim enrollments</SelectItem>
            <SelectItem value="lesson">Lesson bookings</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border border-border rounded-lg overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Signer</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Swimmers</TableHead>
              <TableHead>Photo Consent</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Signed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No waivers match your filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => {
                const swimmerNames = (r.swimmers || [])
                  .map((s: any) => `${s.first_name || ""} ${s.last_name || ""}`.trim())
                  .filter(Boolean);
                return (
                  <TableRow
                    key={`${r.source}-${r.id}`}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => setDetailRow(r)}
                  >
                    <TableCell className="font-medium">{r.signer_name}</TableCell>
                    <TableCell className="text-sm">{r.signer_email}</TableCell>
                    <TableCell className="text-sm">
                      {swimmerNames.length === 0
                        ? "—"
                        : swimmerNames.length <= 2
                          ? swimmerNames.join(", ")
                          : `${swimmerNames[0]} +${swimmerNames.length - 1}`}
                    </TableCell>
                    <TableCell>
                      {r.photo_release ? (
                        <Mail className="w-4 h-4 text-primary" aria-label="Consented" />
                      ) : (
                        <MailX className="w-4 h-4 text-muted-foreground" aria-label="Declined" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{r.source}</Badge>
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {new Date(r.signed_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <FrontDeskVisitorWaiverDialog
        open={kioskOpen}
        onOpenChange={setKioskOpen}
        onSigned={() => {
          setKioskOpen(false);
          refetch();
        }}
      />
      <WaiverDetailDrawer
        open={!!detailRow}
        onOpenChange={(v) => !v && setDetailRow(null)}
        row={detailRow}
      />
    </div>
  );
};

export default WaiversAdmin;
