import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function MembershipCancelRequest() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await supabase.functions.invoke("request-membership-manage-link", {
        body: { email: email.trim() },
      });
      setSent(true);
    } catch (err) {
      console.error(err);
      // Still show generic message — never reveal existence.
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl text-[#1a3a8a]">Manage or cancel your membership</CardTitle>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-700">
                If you have a membership with us, we've emailed you a secure link to manage or
                cancel it. Please check your inbox (and spam folder) in the next few minutes.
              </p>
              <p className="text-sm text-gray-600">
                Didn't get anything? Give us a call at (209) 480-4262 and we'll help.
              </p>
              <Link to="/" className="text-sm text-[#2a5e84] underline">Back to home</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-gray-700">
                Enter the email you used when you signed up. We'll email you a secure link — no
                login required.
              </p>
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <Button type="submit" disabled={submitting} className="w-full bg-[#2a5e84] hover:bg-[#1a3a8a]">
                {submitting ? "Sending..." : "Email me a manage link"}
              </Button>
              <div className="text-center">
                <Link to="/" className="text-sm text-[#2a5e84] underline">Back to home</Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
