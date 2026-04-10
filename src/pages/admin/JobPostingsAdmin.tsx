import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil } from "lucide-react";

const JobPostingsAdmin = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);

  const { data: postings, isLoading } = useQuery({
    queryKey: ["admin-job-postings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_postings")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: appCounts } = useQuery({
    queryKey: ["job-application-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_applications")
        .select("job_posting_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      data?.forEach((a) => { counts[a.job_posting_id] = (counts[a.job_posting_id] || 0) + 1; });
      return counts;
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("job_postings").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-job-postings"] }),
  });

  const savePosting = useMutation({
    mutationFn: async (posting: any) => {
      const payload = {
        title: posting.title,
        location: posting.location,
        pay_rate: posting.pay_rate,
        job_type: posting.job_type,
        shift_schedule: posting.shift_schedule,
        benefits: posting.benefits?.split(",").map((b: string) => b.trim()).filter(Boolean) || [],
        full_description: posting.full_description,
        contact_email: posting.contact_email,
        is_active: posting.is_active ?? true,
      };
      if (posting.id) {
        const { error } = await supabase.from("job_postings").update(payload).eq("id", posting.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("job_postings").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-job-postings"] });
      setShowForm(false);
      setEditing(null);
      toast({ title: "Saved!" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const openEdit = (posting: any) => {
    setEditing({
      ...posting,
      benefits: posting.benefits?.join(", ") || "",
    });
    setShowForm(true);
  };

  const openNew = () => {
    setEditing({ title: "", location: "1212 Kansas Avenue, Modesto, CA 95351", pay_rate: "", job_type: "Part-time", shift_schedule: "", benefits: "", full_description: "", contact_email: "sutton@aquaticdreams.com", is_active: true });
    setShowForm(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold">Job Postings</h1>
        <Button onClick={openNew} size="sm"><Plus className="w-4 h-4 mr-1" /> New Posting</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Pay</TableHead>
                <TableHead>Applications</TableHead>
                <TableHead>Active</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : postings?.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.title}</TableCell>
                  <TableCell><Badge variant="outline">{p.job_type}</Badge></TableCell>
                  <TableCell>{p.pay_rate}</TableCell>
                  <TableCell>{appCounts?.[p.id] || 0}</TableCell>
                  <TableCell>
                    <Switch checked={p.is_active} onCheckedChange={(v) => toggleActive.mutate({ id: p.id, is_active: v })} />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(p)}><Pencil className="w-4 h-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {showForm && editing && (
        <Dialog open onOpenChange={() => { setShowForm(false); setEditing(null); }}>
          <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing.id ? "Edit Posting" : "New Job Posting"}</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => { e.preventDefault(); savePosting.mutate(editing); }}
              className="space-y-4"
            >
              <div><Label>Title</Label><Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} required /></div>
              <div><Label>Location</Label><Input value={editing.location} onChange={(e) => setEditing({ ...editing, location: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Pay Rate</Label><Input value={editing.pay_rate} onChange={(e) => setEditing({ ...editing, pay_rate: e.target.value })} /></div>
                <div><Label>Job Type</Label><Input value={editing.job_type} onChange={(e) => setEditing({ ...editing, job_type: e.target.value })} /></div>
              </div>
              <div><Label>Shift Schedule</Label><Input value={editing.shift_schedule} onChange={(e) => setEditing({ ...editing, shift_schedule: e.target.value })} /></div>
              <div><Label>Benefits (comma-separated)</Label><Input value={editing.benefits} onChange={(e) => setEditing({ ...editing, benefits: e.target.value })} /></div>
              <div><Label>Contact Email</Label><Input value={editing.contact_email} onChange={(e) => setEditing({ ...editing, contact_email: e.target.value })} /></div>
              <div><Label>Full Description</Label><Textarea rows={10} value={editing.full_description} onChange={(e) => setEditing({ ...editing, full_description: e.target.value })} /></div>
              <Button type="submit" className="w-full">Save</Button>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default JobPostingsAdmin;
