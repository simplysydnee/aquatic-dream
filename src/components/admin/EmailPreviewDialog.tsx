import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Mail } from "lucide-react";
import { format } from "date-fns";

export type EmailPreviewData = {
  template_name: string;
  recipient_email: string;
  status: string;
  created_at: string;
  metadata: any;
};

interface Props {
  email: EmailPreviewData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function EmailPreviewDialog({ email, open, onOpenChange }: Props) {
  if (!email) return null;

  const subject = email.metadata?.subject as string | undefined;
  const html = email.metadata?.html as string | undefined;
  const isAuthEmail = email.template_name === "auth_emails";
  const hasContent = !!html;

  const openInNewTab = () => {
    if (!html) return;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            {subject || email.template_name}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-1 text-sm">
              <div>
                <span className="font-medium text-foreground">To:</span> {email.recipient_email}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-foreground">Template:</span> {email.template_name}
                <Badge variant="outline">{email.status}</Badge>
                <span className="text-muted-foreground">
                  {format(new Date(email.created_at), "MMM d, yyyy h:mm a")}
                </span>
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden border rounded-md bg-white">
          {hasContent ? (
            <iframe
              title="Email preview"
              srcDoc={html}
              sandbox=""
              className="w-full h-[60vh] border-0"
            />
          ) : (
            <div className="flex items-center justify-center h-[40vh] text-center p-6 text-muted-foreground">
              {isAuthEmail
                ? "Auth email contents are not stored to protect login links and one-time codes."
                : "Preview not available for this email. Older emails sent before previews were enabled won't have content stored."}
            </div>
          )}
        </div>

        {hasContent && (
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={openInNewTab}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Open in new tab
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
