import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

type Status = "loading" | "valid" | "already" | "invalid" | "success" | "error";

const Unsubscribe = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<Status>("loading");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) { setStatus("invalid"); return; }
    const validate = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${token}`,
          { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
        );
        const data = await res.json();
        if (res.ok && data.valid) setStatus("valid");
        else if (data.reason === "already_unsubscribed") setStatus("already");
        else setStatus("invalid");
      } catch { setStatus("invalid"); }
    };
    validate();
  }, [token]);

  const handleUnsubscribe = async () => {
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("handle-email-unsubscribe", { body: { token } });
      if (error) throw error;
      if (data?.success) setStatus("success");
      else if (data?.reason === "already_unsubscribed") setStatus("already");
      else setStatus("error");
    } catch { setStatus("error"); }
    setSubmitting(false);
  };

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6 text-center space-y-4">
          {status === "loading" && <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />}
          {status === "valid" && (
            <>
              <h1 className="text-xl font-bold text-foreground">Unsubscribe</h1>
              <p className="text-muted-foreground">Are you sure you want to unsubscribe from Aquatic Dreams emails?</p>
              <Button onClick={handleUnsubscribe} disabled={submitting} className="w-full">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Confirm Unsubscribe
              </Button>
            </>
          )}
          {status === "success" && (
            <>
              <CheckCircle className="h-10 w-10 text-green-500 mx-auto" />
              <h1 className="text-xl font-bold">Unsubscribed</h1>
              <p className="text-muted-foreground">You've been successfully unsubscribed.</p>
            </>
          )}
          {status === "already" && (
            <>
              <CheckCircle className="h-10 w-10 text-muted-foreground mx-auto" />
              <h1 className="text-xl font-bold">Already Unsubscribed</h1>
              <p className="text-muted-foreground">This email has already been unsubscribed.</p>
            </>
          )}
          {status === "invalid" && (
            <>
              <XCircle className="h-10 w-10 text-destructive mx-auto" />
              <h1 className="text-xl font-bold">Invalid Link</h1>
              <p className="text-muted-foreground">This unsubscribe link is invalid or expired.</p>
            </>
          )}
          {status === "error" && (
            <>
              <XCircle className="h-10 w-10 text-destructive mx-auto" />
              <h1 className="text-xl font-bold">Something Went Wrong</h1>
              <p className="text-muted-foreground">Please try again later or contact us.</p>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
};

export default Unsubscribe;
