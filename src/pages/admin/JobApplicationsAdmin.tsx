import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Eye, CheckCircle, Shield, Archive, ArchiveRestore } from "lucide-react";
import { format } from "date-fns";

const STATUS_OPTIONS = ["new", "reviewing", "interview", "hired", "rejected"];

const statusColor = (s: string) => {
  switch (s) {
    case "new": return "bg-blue-100 text-blue-800";
    case "reviewing": return "bg-yellow-100 text-yellow-800";
    case "interview": return "bg-purple-100 text-purple-800";
    case "hired": return "bg-green-100 text-green-800";
    case "rejected": return "bg-red-100 text-red-800";
    default: return "";
  }
};

type TabFilter = "active" | "hired" | "archived";

const JobApplicationsAdmin = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [viewing, setViewing] = useState<any>(null);
  const [tab, setTab] = useState<TabFilter>("active");

  const { data: applications, isLoading } = useQuery({
    queryKey: ["admin-job-applications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_applications")
        .select("*, job_postings(title)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("job_applications").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-job-applications"] });
      toast({ title: "Status updated" });
    },
  });

  const markViewed = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("job_applications").update({ is_viewed: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-job-applications"] }),
  });

  const toggleArchive = useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase.from("job_applications").update({ is_archived: archived }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-job-applications"] });
      toast({ title: "Application updated" });
    },
  });

  const openDetail = (app: any) => {
    setViewing(app);
    if (!app.is_viewed) {
      markViewed.mutate(app.id);
    }
  };

  const downloadResume = async (path: string, name: string) => {
    const { data, error } = await supabase.storage.from("resumes").download(path);
    if (error) {
      toast({ title: "Error downloading", description: error.message, variant: "destructive" });
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `resume-${name}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasCert = (certs: string[] | null, cert: string) => certs?.includes(cert);

  const filtered = applications?.filter((app) => {
    if (tab === "archived") return app.is_archived;
    if (tab === "hired") return app.status === "hired" && !app.is_archived;
    return !app.is_archived; // active
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-display font-bold">Job Applications</h1>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabFilter)}>
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="hired">Hired</TabsTrigger>
          <TabsTrigger value="archived">Archived</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Certs</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : !filtered?.length ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No applications</TableCell></TableRow>
              ) : filtered.map((app) => (
                <TableRow key={app.id} className={!app.is_viewed ? "font-semibold" : ""}>
                  <TableCell className="px-2">
                    {!app.is_viewed && (
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-primary" title="Not viewed" />
                    )}
                  </TableCell>
                  <TableCell>{app.first_name} {app.last_name}</TableCell>
                  <TableCell className="text-sm">{(app as any).job_postings?.title}</TableCell>
                  <TableCell className="text-sm">{app.email}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {hasCert(app.certifications, "Lifeguard Certification") && (
                        <span title="Lifeguard Cert"><Shield className="w-4 h-4 text-primary" /></span>
                      )}
                      {hasCert(app.certifications, "CPR / First Aid") && (
                        <span title="CPR/First Aid"><CheckCircle className="w-4 h-4 text-primary" /></span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select value={app.status} onValueChange={(v) => updateStatus.mutate({ id: app.id, status: v })}>
                      <SelectTrigger className="w-28 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{format(new Date(app.created_at), "MMM d, yyyy")}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openDetail(app)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      {app.resume_url && (
                        <Button variant="ghost" size="sm" onClick={() => downloadResume(app.resume_url!, `${app.last_name}.pdf`)}>
                          <Download className="w-4 h-4" />
                        </Button>
                      )}
                      {tab === "archived" ? (
                        <Button variant="ghost" size="sm" title="Unarchive" onClick={() => toggleArchive.mutate({ id: app.id, archived: false })}>
                          <ArchiveRestore className="w-4 h-4" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" title="Archive" onClick={() => toggleArchive.mutate({ id: app.id, archived: true })}>
                          <Archive className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {viewing && (
        <Dialog open onOpenChange={() => setViewing(null)}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{viewing.first_name} {viewing.last_name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Email:</span> <br />{viewing.email}</div>
                <div><span className="text-muted-foreground">Phone:</span> <br />{viewing.phone}</div>
              </div>

              <div>
                <span className="text-muted-foreground">Availability:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {viewing.availability?.map((a: string) => <Badge key={a} variant="outline">{a}</Badge>)}
                </div>
              </div>

              <div>
                <span className="text-muted-foreground">Certifications:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {viewing.certifications?.map((c: string) => (
                    <Badge key={c} variant={c.includes("Lifeguard") ? "default" : "secondary"}>{c}</Badge>
                  ))}
                </div>
              </div>

              <div><span className="text-muted-foreground">Swimming Ability:</span> {viewing.swimming_ability || "—"}</div>
              <div><span className="text-muted-foreground">Experience with Children:</span> {viewing.experience_with_children || "—"}</div>
              <div><span className="text-muted-foreground">Available to Start:</span> {viewing.available_start_date || "—"}</div>

              {viewing.resume_url && (
                <Button variant="outline" size="sm" onClick={() => downloadResume(viewing.resume_url, `${viewing.last_name}.pdf`)}>
                  <Download className="w-4 h-4 mr-2" /> Download Resume
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default JobApplicationsAdmin;
