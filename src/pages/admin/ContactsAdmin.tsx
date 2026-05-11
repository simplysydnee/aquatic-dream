import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Contact {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  source_page: string | null;
  status: string;
  created_at: string;
}

const ContactsAdmin = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("contact_submissions").select("*").order("created_at", { ascending: false })
      .then(({ data }) => { if (data) setContacts(data); setLoading(false); });
  }, []);

  const updateStatus = async (id: string, status: string) => {
    await supabase.from("contact_submissions").update({ status }).eq("id", id);
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl sm:text-2xl font-display font-bold text-foreground">Contact Inquiries</h2>
        <Badge variant="outline" className="text-xs sm:text-sm shrink-0">{contacts.length} total</Badge>
      </div>

      {/* Mobile cards */}
      <div className="grid grid-cols-1 gap-2 md:hidden">
        {contacts.map((c) => (
          <Card key={c.id} className="p-3">
            <div className="flex items-start justify-between gap-2 min-w-0">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm break-words">{c.full_name}</div>
                <div className="text-xs text-muted-foreground break-words">{c.subject}</div>
                <div className="text-xs mt-1 break-words line-clamp-3">{c.message}</div>
                <div className="text-xs text-muted-foreground mt-1 break-all">{c.email}</div>
                {c.phone && <div className="text-xs text-muted-foreground">{c.phone}</div>}
                <div className="text-[10px] text-muted-foreground mt-1">
                  {c.source_page || "—"} · {new Date(c.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
            <div className="mt-2">
              <Select value={c.status} onValueChange={(v) => updateStatus(c.id, v)}>
                <SelectTrigger className="w-full h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Card>
        ))}
        {contacts.length === 0 && <p className="text-center py-8 text-sm text-muted-foreground">No inquiries yet</p>}
      </div>

      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.full_name}</TableCell>
                  <TableCell>{c.subject}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{c.message}</TableCell>
                  <TableCell>
                    <div>{c.email}</div>
                    {c.phone && <div className="text-xs text-muted-foreground">{c.phone}</div>}
                  </TableCell>
                  <TableCell className="text-sm">{c.source_page || "—"}</TableCell>
                  <TableCell>
                    <Select value={c.status} onValueChange={(v) => updateStatus(c.id, v)}>
                      <SelectTrigger className="w-[120px] h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="in-progress">In Progress</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(c.created_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
              {contacts.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No inquiries yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default ContactsAdmin;
