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
import { Download, Eye, CheckCircle, Shield } from "lucide-react";
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

const JobApplicationsAdmin = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [viewing, setViewing] = useState<any>(null);

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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-display font-bold">Job Applications</h1>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
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
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : !applications?.length ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No applications yet</TableCell></TableRow>
              ) : applications.map((app) => (
                <TableRow key={app.id}>
                  <TableCell className="font-medium">{app.first_name} {app.last_name}</TableCell>
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
                      <Button variant="ghost" size="sm" onClick={() => setViewing(app)}><Eye className="w-4 h-4" /></Button>
                      {app.resume_url && (
                        <Button variant="ghost" size="sm" onClick={() => downloadResume(app.resume_url!, `${app.last_name}.pdf`)}>
                          <Download className="w-4 h-4" />
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
