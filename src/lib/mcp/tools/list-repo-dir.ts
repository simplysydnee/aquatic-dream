import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

const REPO = "simplysydnee/aquatic-dream";

type GhEntry = { name: string; path: string; type: string; size?: number };

export default defineTool({
  name: "list_repo_dir",
  title: "List repo directory",
  description:
    "List file and folder entries at a path in the aquatic-dream GitHub repository (default branch). Read-only. Use path='' for the repo root.",
  inputSchema: {
    path: z
      .string()
      .trim()
      .max(500)
      .default("")
      .describe("Repo-relative directory path. Empty string for repo root."),
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
    const cleanPath = path.replace(/^\/+|\/+$/g, "");
    const qs = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    const url = `https://api.github.com/repos/${REPO}/contents/${cleanPath}${qs}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "aquatic-dreams-mcp",
      },
    });
    const text = await res.text();
    if (!res.ok) {
      return {
        content: [{ type: "text", text: `GitHub responded ${res.status}: ${text}` }],
        isError: true,
      };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return {
        content: [{ type: "text", text: `Unexpected GitHub response: ${text}` }],
        isError: true,
      };
    }
    if (!Array.isArray(parsed)) {
      return {
        content: [
          {
            type: "text",
            text: `Path is not a directory. Use read_repo_file for files. Raw: ${text}`,
          },
        ],
        isError: true,
      };
    }
    const entries = (parsed as GhEntry[])
      .map((e) => ({ name: e.name, path: e.path, type: e.type, size: e.size ?? null }))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    return {
      content: [{ type: "text", text: JSON.stringify(entries, null, 2) }],
      structuredContent: { path: cleanPath, ref: ref ?? null, entries },
    };
  },
});
