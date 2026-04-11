import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Loader2, UserCheck, UserX } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Instructor {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
}

const InstructorsAdmin = () => {
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });

  const fetchInstructors = async () => {
    const { data } = await supabase
      .from("instructors")
      .select("*")
      .order("name");
    if (data) setInstructors(data);
    setLoading(false);
  };

  useEffect(() => { fetchInstructors(); }, []);

  const resetForm = () => {
    setForm({ name: "", email: "", phone: "" });
    setEditingId(null);
  };

  const openEdit = (inst: Instructor) => {
    setEditingId(inst.id);
    setForm({ name: inst.name, email: inst.email || "", phone: inst.phone || "" });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
    };

    if (editingId) {
      const { error } = await supabase.from("instructors").update(payload).eq("id", editingId);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Instructor updated" });
    } else {
      const { error } = await supabase.from("instructors").insert(payload);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Instructor added" });
    }
    setDialogOpen(false);
    resetForm();
    fetchInstructors();
  };

  const toggleActive = async (inst: Instructor) => {
    const { error } = await supabase
      .from("instructors")
      .update({ is_active: !inst.is_active })
      .eq("id", inst.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: inst.is_active ? "Instructor deactivated" : "Instructor reactivated" });
      fetchInstructors();
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-display font-bold text-foreground">Instructors</h2>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Add Instructor</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>{editingId ? "Edit Instructor" : "Add Instructor"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
              <Button onClick={handleSave} className="w-full">{editingId ? "Save Changes" : "Add Instructor"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">All Instructors</CardTitle></CardHeader>
        <CardContent>
          {instructors.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No instructors added yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {instructors.map(inst => (
                  <TableRow key={inst.id} className={!inst.is_active ? "opacity-50" : ""}>
                    <TableCell className="font-medium">{inst.name}</TableCell>
                    <TableCell>{inst.email || "—"}</TableCell>
                    <TableCell>{inst.phone || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={inst.is_active ? "default" : "secondary"} className="text-xs">
                        {inst.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(inst)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleActive(inst)}>
                          {inst.is_active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default InstructorsAdmin;
