import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

export default function UnsubscribeMarketing() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!token) { setState("error"); return; }
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/marketing-unsubscribe?token=${encodeURIComponent(token)}`;
    fetch(url, { method: "POST" })
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok) { setEmail(j.email || ""); setState("done"); }
        else setState("error");
      })
      .catch(() => setState("error"));
  }, [token]);

  return (
    <div className="min-h-screen bg-[#F7F3EE] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow p-8 text-center">
        <h1 className="text-2xl font-display text-[#2a5e84] mb-3">
          {state === "loading" && "Unsubscribing…"}
          {state === "done" && "You're unsubscribed"}
          {state === "error" && "Link not valid"}
        </h1>
        {state === "done" && (
          <p className="text-muted-foreground">
            <strong>{email}</strong> won't receive any more marketing emails from Aquatic Dreams.
            You'll still get transactional emails like waivers and receipts.
          </p>
        )}
        {state === "error" && (
          <p className="text-muted-foreground">
            This unsubscribe link is missing or no longer valid.
          </p>
        )}
      </div>
    </div>
  );
}
