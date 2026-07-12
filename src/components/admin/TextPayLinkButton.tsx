import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MessageSquare, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { toast } from "@/hooks/use-toast";

interface Props {
  enrollmentId: string;
  parentPhone: string | null;
  sessionFeeStatus?: string | null;
  variant?: "icon" | "button";
  title?: string;
}

export default function TextPayLinkButton({
  enrollmentId,
  parentPhone,
  sessionFeeStatus,
  variant = "icon",
  title,
}: Props) {
  const [sending, setSending] = useState(false);
  const disabled =
    sending ||
    !parentPhone ||
    sessionFeeStatus === "paid" ||
    sessionFeeStatus === "comp";

  const tooltip = !parentPhone
    ? "No parent phone on file"
    : sessionFeeStatus === "paid" || sessionFeeStatus === "comp"
    ? `Session fee already ${sessionFeeStatus}`
    : title || "Text session-fee payment link";

  const handleClick = async () => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("text-session-payment-link", {
        body: { enrollmentId, environment: getStripeEnvironment() },
      });
      if (error || !data?.success) {
        throw new Error((error as any)?.message || data?.error || "Failed to send");
      }
      toast({
        title: "Payment link texted",
        description: data.phone ? `Sent to ${data.phone}` : "SMS sent",
      });
    } catch (e) {
      toast({
        title: "Text failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  if (variant === "button") {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={handleClick}
        disabled={disabled}
        title={tooltip}
        className="gap-1"
      >
        {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
        Text pay link
      </Button>
    );
  }

  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={handleClick}
      disabled={disabled}
      title={tooltip}
    >
      {sending ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <MessageSquare className="w-4 h-4 text-primary" />
      )}
    </Button>
  );
}
