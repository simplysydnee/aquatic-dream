import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Loader2, UserCheck, UserX, KeyRound } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Instructor {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  user_id: string | null;
  hourly_wage: number | null;
  created_at: string;
}

const InstructorsAdmin = () => {
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", hourly_wage: "" });
  const [inviting, setInviting] = useState<string | null>(null);

  const fetchInstructors = async () => {
    const [{ data }, { data: wages }] = await Promise.all([
      supabase.from("instructors").select("id,name,email,phone,is_active,created_at,updated_at,user_id").order("name"),
      supabase.rpc("get_instructor_wages"),
    ]);
    if (data) {
      const wageMap = new Map((wages ?? []).map((w: any) => [w.id, w.hourly_wage]));
      setInstructors(data.map((i: any) => ({ ...i, hourly_wage: wageMap.get(i.id) ?? null })) as Instructor[]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchInstructors(); }, []);

  const resetForm = () => {
    setForm({ name: "", email: "", phone: "", hourly_wage: "" });
    setEditingId(null);
  };

  const openEdit = (inst: Instructor) => {
    setEditingId(inst.id);
    setForm({
      name: inst.name,
      email: inst.email || "",
      phone: inst.phone || "",
      hourly_wage: inst.hourly_wage != null ? String(inst.hourly_wage) : "",
    });
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
      hourly_wage: form.hourly_wage.trim() ? Number(form.hourly_wage) : null,
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

  const inviteLogin = async (inst: Instructor) => {
    if (!inst.email) {
      toast({ title: "Add an email first", variant: "destructive" });
      return;
    }
    setInviting(inst.id);
    const { data, error } = await supabase.functions.invoke("invite-instructor", {
      body: { instructor_id: inst.id, email: inst.email },
    });
    setInviting(null);
    if (error || (data && (data as any).error)) {
      toast({
        title: "Invite failed",
        description: error?.message || (data as any)?.error,
        variant: "destructive",
      });
      return;
    }
    toast({
      title: (data as any).invited ? "Invitation sent" : "Account linked",
      description: (data as any).invited
        ? `${inst.email} will receive an email to set their password.`
        : `Existing account at ${inst.email} is now linked.`,
    });
    fetchInstructors();
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl sm:text-2xl font-display font-bold text-foreground">Instructors</h2>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Add</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>{editingId ? "Edit Instructor" : "Add Instructor"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
              <div><Label>Hourly wage ($)</Label><Input type="number" min={0} step="0.01" value={form.hourly_wage} onChange={e => setForm(f => ({ ...f, hourly_wage: e.target.value }))} placeholder="e.g. 22.50" /></div>
              <Button onClick={handleSave} className="w-full">{editingId ? "Save Changes" : "Add Instructor"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Mobile cards */}
      <div className="grid grid-cols-1 gap-2 md:hidden">
        {instructors.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No instructors added yet.</p>
        ) : instructors.map(inst => (
          <Card key={inst.id} className={`p-3 ${!inst.is_active ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between gap-2 min-w-0">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm break-words">{inst.name}</div>
                {inst.email && <div className="text-xs text-muted-foreground break-all">{inst.email}</div>}
                {inst.phone && <div className="text-xs text-muted-foreground">{inst.phone}</div>}
                <div className="mt-1 flex flex-wrap gap-1.5 items-center">
                  <Badge variant={inst.is_active ? "default" : "secondary"} className="text-[10px]">{inst.is_active ? "Active" : "Inactive"}</Badge>
                  {inst.user_id ? <Badge variant="outline" className="text-[10px]">Linked</Badge> : <span className="text-[10px] text-muted-foreground">No login</span>}
                  {inst.hourly_wage != null && <span className="text-[10px] text-muted-foreground">${Number(inst.hourly_wage).toFixed(2)}/hr</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(inst)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleActive(inst)}>
                  {inst.is_active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                </Button>
                {!inst.user_id && (
                  <Button size="icon" variant="ghost" className="h-7 w-7" disabled={inviting === inst.id || !inst.email} onClick={() => inviteLogin(inst)}>
                    {inviting === inst.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="hidden md:block">
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
                  <TableHead>Wage</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Login</TableHead>
                  <TableHead className="w-[140px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {instructors.map(inst => (
                  <TableRow key={inst.id} className={!inst.is_active ? "opacity-50" : ""}>
                    <TableCell className="font-medium">{inst.name}</TableCell>
                    <TableCell>{inst.email || "—"}</TableCell>
                    <TableCell>{inst.phone || "—"}</TableCell>
                    <TableCell>{inst.hourly_wage != null ? `$${Number(inst.hourly_wage).toFixed(2)}/hr` : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                    <TableCell>
                      <Badge variant={inst.is_active ? "default" : "secondary"} className="text-xs">
                        {inst.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {inst.user_id ? (
                        <Badge variant="outline" className="text-xs">Linked</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">No login</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(inst)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleActive(inst)}>
                          {inst.is_active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                        </Button>
                        {!inst.user_id && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            title="Invite / link login"
                            disabled={inviting === inst.id || !inst.email}
                            onClick={() => inviteLogin(inst)}
                          >
                            {inviting === inst.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <KeyRound className="w-3.5 h-3.5" />}
                          </Button>
                        )}
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
