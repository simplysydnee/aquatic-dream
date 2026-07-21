import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check, BotMessageSquare } from "lucide-react";

export default function AgentConnectionInstructions() {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";
  const mcpUrl = `https://${projectRef}.supabase.co/functions/v1/mcp`;

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(mcpUrl);
      setCopied(true);
      toast({ title: "Copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <BotMessageSquare className="h-6 w-6 text-primary" />
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">Connect an AI assistant</h1>
          <p className="text-sm text-muted-foreground">
            Use these steps to connect Claude or ChatGPT to Aquatic Dreams admin tools.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>MCP server URL</CardTitle>
          <CardDescription>
            Copy this URL and paste it into your AI assistant's connector setup.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-muted rounded-md px-3 py-2 text-sm font-mono break-all">
              {mcpUrl}
            </code>
            <Button variant="outline" size="icon" onClick={copyUrl} aria-label="Copy MCP URL">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connect Claude</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-foreground">
          <ol className="list-decimal list-inside space-y-1.5">
            <li>Open <a href="https://claude.ai/customize/connectors?modal=add-custom-connector" target="_blank" rel="noreferrer" className="text-primary underline">claude.ai/customize/connectors</a> and click "Add custom connector".</li>
            <li>Name the connector (for example, "Aquatic Dreams Admin").</li>
            <li>Paste the MCP server URL above.</li>
            <li>Save the connector, then enable it from the chat composer.</li>
            <li>Ask Claude to use Aquatic Dreams — for example, "Show me today's private lessons."</li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connect ChatGPT</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-foreground">
          <ol className="list-decimal list-inside space-y-1.5">
            <li>Open <a href="https://chatgpt.com/#settings/Connectors/Advanced" target="_blank" rel="noreferrer" className="text-primary underline">chatgpt.com/#settings/Connectors/Advanced</a> and enable Developer mode.</li>
            <li>In the chat composer's "+" menu, turn on Developer mode.</li>
            <li>Click "Add sources", then "Connect more".</li>
            <li>Name the connector and paste the MCP server URL above.</li>
            <li>Ask ChatGPT to use Aquatic Dreams — for example, "Search for swimmer Luca."</li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Refresh after the app changes</CardTitle>
          <CardDescription>
            AI assistants cache the tool list. After new tools are shipped, refresh the connector to pick them up.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-foreground">
          <div>
            <p className="font-semibold mb-1">Claude</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Open the Connectors page and select this connector.</li>
              <li>Click the refresh/update option to reload the tool list.</li>
              <li>If the URL changed, paste the latest URL from above.</li>
              <li>Start a new chat and ask Claude to use Aquatic Dreams.</li>
            </ol>
          </div>
          <div>
            <p className="font-semibold mb-1">ChatGPT</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Open ChatGPT's app preferences and pick this app under "Enabled apps".</li>
              <li>Next to "Information", click "Refresh".</li>
              <li>If the URL changed, paste the latest URL from above.</li>
              <li>Start a new chat and ask ChatGPT to use Aquatic Dreams.</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
