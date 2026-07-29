import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

const REPO = "simplysydnee/aquatic-dream";
const MAX_FILES_SCANNED = 25;

type SearchItem = { path: string };

export default defineTool({
  name: "search_repo",
  title: "Search repo",
  description:
    "Search the aquatic-dream GitHub repository for a pattern and return file path, line number, and the matching line. Read-only. Results are capped.",
  inputSchema: {
    pattern: z
      .string()
      .trim()
      .min(2)
      .max(200)
      .describe("Text or regular expression to match against file lines."),
    path_prefix: z
      .string()
      .trim()
      .max(300)
      .optional()
      .describe("Optional repo-relative path prefix to restrict results, e.g. 'src/lib/mcp'."),
    max_results: z
      .number()
      .int()
      .min(1)
      .max(200)
      .default(50)
      .describe("Maximum number of matching lines to return (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ pattern, path_prefix, max_results }, ctx) => {
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

    let regex: RegExp;
    try {
      regex = new RegExp(pattern, "i");
    } catch {
      return {
        content: [{ type: "text", text: `Invalid regular expression: ${pattern}` }],
        isError: true,
      };
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "aquatic-dreams-mcp",
    };

    // GitHub code search finds candidate files; lines are matched locally so we
    // can return exact line numbers.
    const literal = pattern.replace(/[\\^$.*+?()[\]{}|]/g, " ").trim() || pattern;
    const prefix = (path_prefix ?? "").replace(/^\/+|\/+$/g, "");
    const q = [`${literal} repo:${REPO}`, prefix ? `path:${prefix}` : ""].filter(Boolean).join(" ");
    const searchRes = await fetch(
      `https://api.github.com/search/code?per_page=${MAX_FILES_SCANNED}&q=${encodeURIComponent(q)}`,
      { headers },
    );
    const searchText = await searchRes.text();
    if (!searchRes.ok) {
      return {
        content: [{ type: "text", text: `GitHub search responded ${searchRes.status}: ${searchText}` }],
        isError: true,
      };
    }
    let items: SearchItem[] = [];
    try {
      items = (JSON.parse(searchText).items ?? []) as SearchItem[];
    } catch {
      return {
        content: [{ type: "text", text: `Unexpected GitHub response: ${searchText.slice(0, 500)}` }],
        isError: true,
      };
    }

    const files = items
      .map((i) => i.path)
      .filter((p) => (prefix ? p.startsWith(prefix) : true))
      .slice(0, MAX_FILES_SCANNED);

    const matches: { path: string; line: number; text: string }[] = [];
    for (const path of files) {
      if (matches.length >= max_results) break;
      const res = await fetch(
        `https://api.github.com/repos/${REPO}/contents/${encodeURI(path)}`,
        { headers: { ...headers, Accept: "application/vnd.github.raw" } },
      );
      if (!res.ok) continue;
      const body = await res.text();
      const lines = body.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          matches.push({ path, line: i + 1, text: lines[i].slice(0, 400) });
          if (matches.length >= max_results) break;
        }
      }
    }

    const payload = {
      pattern,
      path_prefix: prefix || null,
      files_scanned: files.length,
      match_count: matches.length,
      truncated: matches.length >= max_results,
      matches,
    };
    return {
      content: [
        {
          type: "text",
          text:
            matches.length === 0
              ? "No matches found."
              : matches.map((m) => `${m.path}:${m.line}: ${m.text}`).join("\n"),
        },
      ],
      structuredContent: payload,
    };
  },
});
