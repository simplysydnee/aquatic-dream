import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

const REPO = "simplysydnee/aquatic-dream";

export default defineTool({
  name: "read_repo_file",
  title: "Read repo file",
  description:
    "Fetch the raw text of a file from the aquatic-dream GitHub repository (default branch). Read-only. Example path: 'supabase/functions/create-membership-checkout/index.ts'.",
  inputSchema: {
    path: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .describe("Repo-relative file path, e.g. 'src/lib/mcp/index.ts'."),
    ref: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .optional()
      .describe("Optional branch, tag, or commit SHA. Defaults to the repo's default branch."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ path, ref }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return {
        content: [{ type: "text", text: "GITHUB_TOKEN is not configured on the server." }],
        isError: true,
      };
    }
    const cleanPath = path.replace(/^\/+/, "");
    const qs = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    const url = `https://api.github.com/repos/${REPO}/contents/${cleanPath}${qs}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.raw",
        "User-Agent": "aquatic-dreams-mcp",
      },
    });
    const body = await res.text();
    if (!res.ok) {
      return {
        content: [{ type: "text", text: `GitHub responded ${res.status}: ${body}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: body }],
      structuredContent: { path: cleanPath, ref: ref ?? null, content: body },
    };
  },
});
