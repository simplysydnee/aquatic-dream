import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";

type ClosureType = "planned" | "unplanned";
type Row = {
  id: string;
  start_date: string;
  end_date: string;
  label: string;
  closure_type: ClosureType;
  lessons_closed: number;
};

function fmtRange(start: string, end: string) {
  const s = new Date(`${start}T12:00:00-08:00`);
  const e = new Date(`${end}T12:00:00-08:00`);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  if (start === end) return s.toLocaleDateString("en-US", opts);
  return `${s.toLocaleDateString("en-US", opts)} – ${e.toLocaleDateString("en-US", opts)}`;
}

export default function HolidaysAdmin() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [label, setLabel] = useState("");
  const [closureType, setClosureType] = useState<ClosureType>("planned");

  async function load() {
    setLoading(true);
    const { data: closures, error } = await supabase
      .from("studio_closures")
      .select("id, start_date, end_date, label, closure_type")
      .order("start_date", { ascending: true });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const ids = (closures ?? []).map((c) => c.id);
    const counts: Record<string, number> = {};
    if (ids.length) {
      const { data: occs } = await supabase
        .from("membership_occurrences")
        .select("closure_id")
        .in("closure_id", ids);
      for (const o of occs ?? []) {
        const k = (o as { closure_id: string | null }).closure_id;
        if (k) counts[k] = (counts[k] ?? 0) + 1;
      }
    }
    setRows(
      (closures ?? []).map((c) => ({
        ...(c as Row),
        lessons_closed: counts[c.id] ?? 0,
      })),
    );
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const canSave = useMemo(
    () => startDate && label.trim().length > 0 && (!endDate || endDate >= startDate),
    [startDate, endDate, label],
  );

  async function handleAdd() {
    if (!canSave) return;
    setSaving(true);
    const { error } = await supabase.from("studio_closures").insert({
      start_date: startDate,
      end_date: endDate || startDate,
      label: label.trim(),
      closure_type: closureType,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Closure added — affected lessons updated.");
    setStartDate("");
    setEndDate("");
    setLabel("");
    setClosureType("planned");
    load();
  }

  async function handleDelete(row: Row) {
    const { error } = await supabase.from("studio_closures").delete().eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Closure removed — lessons reopened.");
    setConfirmDelete(null);
    load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Holidays & Closures</h1>
        <p className="text-sm text-muted-foreground">
          Add planned holidays or unplanned closures. Scheduled member lessons on those dates
          close automatically. Billing is unchanged.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add closure</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="start">Start date</Label>
              <Input id="start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="end">End date (optional)</Label>
              <Input id="end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">Leave blank for a single day.</p>
            </div>
          </div>
          <div>
            <Label htmlFor="label">Label</Label>
            <Input id="label" placeholder="Thanksgiving" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} />
          </div>
          <div>
            <Label>Type</Label>
            <RadioGroup
              value={closureType}
              onValueChange={(v) => setClosureType(v as ClosureType)}
              className="mt-1 flex gap-6"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="planned" id="ct-planned" />
                <Label htmlFor="ct-planned" className="cursor-pointer">Planned (no makeup)</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="unplanned" id="ct-unplanned" />
                <Label htmlFor="ct-unplanned" className="cursor-pointer">Unplanned (owes makeup)</Label>
              </div>
            </RadioGroup>
            {closureType === "unplanned" && (
              <p className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-900">
                Affected families will be owed a makeup lesson.
              </p>
            )}
          </div>
          <Button onClick={handleAdd} disabled={!canSave || saving} className="bg-[#2a5e84] hover:bg-[#1a3a8a]">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Add closure
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Existing closures</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No closures yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Label</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Lessons closed</th>
                    <th className="py-2 pr-4">Makeups</th>
                    <th className="py-2 pr-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b">
                      <td className="py-2 pr-4 font-mono text-xs">{fmtRange(r.start_date, r.end_date)}</td>
                      <td className="py-2 pr-4">{r.label}</td>
                      <td className="py-2 pr-4 capitalize">{r.closure_type}</td>
                      <td className="py-2 pr-4">{r.lessons_closed}</td>
                      <td className="py-2 pr-4">
                        {r.closure_type === "unplanned" ? (
                          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                            Owes makeup
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmDelete(r)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="mr-1 h-4 w-4" /> Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove closure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reopen {confirmDelete?.lessons_closed ?? 0} affected lesson
              {confirmDelete?.lessons_closed === 1 ? "" : "s"} back to scheduled. This can't be undone from here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
            >
              Remove closure
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
