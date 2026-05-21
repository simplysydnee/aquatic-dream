// Email-safe HTML renderer for marketing campaigns.
// Uses the maritime palette and table-based layout for client compatibility.

export type MarketingBlock =
  | { type: "heading"; text: string; align?: "left" | "center" }
  | { type: "text"; html: string }
  | { type: "image"; url: string; alt?: string; href?: string }
  | { type: "button"; text: string; url: string; align?: "left" | "center" }
  | { type: "divider" }
  | { type: "spacer"; size?: "sm" | "md" | "lg" };

export interface RenderOptions {
  subject: string;
  preheader?: string;
  blocks: MarketingBlock[];
  unsubscribeUrl: string;
  companyName?: string;
  companyAddress?: string;
  logoUrl?: string;
  brandPrimary?: string;
  brandAccent?: string;
}

const escape = (s: string) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );

const renderBlock = (b: MarketingBlock, opts: RenderOptions): string => {
  const primary = opts.brandPrimary || "#2a5e84";
  const accent = opts.brandAccent || "#F58B76";
  switch (b.type) {
    case "heading":
      return `<tr><td style="padding:8px 32px;text-align:${b.align ?? "left"};font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.25;color:${primary};font-weight:700;">${escape(b.text)}</td></tr>`;
    case "text":
      // Allow basic inline HTML (bold, italic, links, br) but caller controls input
      return `<tr><td style="padding:8px 32px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#1f2937;">${b.html}</td></tr>`;
    case "image": {
      const img = `<img src="${escape(b.url)}" alt="${escape(b.alt ?? "")}" style="width:100%;max-width:536px;height:auto;display:block;border:0;border-radius:8px;" />`;
      const inner = b.href ? `<a href="${escape(b.href)}" style="display:block;">${img}</a>` : img;
      return `<tr><td style="padding:12px 32px;">${inner}</td></tr>`;
    }
    case "button":
      return `<tr><td style="padding:16px 32px;text-align:${b.align ?? "center"};"><a href="${escape(b.url)}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;">${escape(b.text)}</a></td></tr>`;
    case "divider":
      return `<tr><td style="padding:16px 32px;"><div style="border-top:1px solid #e5e7eb;height:1px;line-height:1px;font-size:0;">&nbsp;</div></td></tr>`;
    case "spacer": {
      const h = b.size === "lg" ? 32 : b.size === "sm" ? 8 : 16;
      return `<tr><td style="height:${h}px;line-height:${h}px;font-size:0;">&nbsp;</td></tr>`;
    }
  }
};

export function renderMarketingHtml(opts: RenderOptions): string {
  const primary = opts.brandPrimary || "#2a5e84";
  const company = opts.companyName || "Aquatic Dreams";
  const address = opts.companyAddress || "Aquatic Dreams, Modesto, CA";
  const logo = opts.logoUrl;
  const blocks = (opts.blocks || []).map((b) => renderBlock(b, opts)).join("");
  const preheader = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escape(opts.preheader)}</div>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<title>${escape(opts.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#F7F3EE;">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F7F3EE;">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:600px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
      <tr><td style="background:${primary};padding:24px 32px;text-align:center;">
        ${logo
          ? `<img src="${escape(logo)}" alt="${escape(company)}" style="height:48px;display:inline-block;border:0;" />`
          : `<div style="color:#ffffff;font-family:Georgia,serif;font-size:24px;font-weight:700;">${escape(company)}</div>`}
      </td></tr>
      <tr><td style="height:8px;line-height:8px;font-size:0;">&nbsp;</td></tr>
      ${blocks}
      <tr><td style="height:16px;line-height:16px;font-size:0;">&nbsp;</td></tr>
      <tr><td style="background:#F7F3EE;padding:20px 32px;text-align:center;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#6b7280;">
        <div style="margin-bottom:6px;font-weight:600;color:#374151;">${escape(company)}</div>
        <div style="margin-bottom:10px;">${escape(address)}</div>
        <div>You're receiving this because you're a customer of ${escape(company)}.<br/>
          <a href="${escape(opts.unsubscribeUrl)}" style="color:${primary};text-decoration:underline;">Unsubscribe</a>
          &nbsp;·&nbsp;
          <a href="${escape(opts.unsubscribeUrl)}" style="color:${primary};text-decoration:underline;">Manage preferences</a>
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

export function renderPlainText(opts: RenderOptions): string {
  const lines: string[] = [];
  if (opts.preheader) lines.push(opts.preheader, "");
  for (const b of opts.blocks) {
    switch (b.type) {
      case "heading": lines.push(b.text, ""); break;
      case "text": lines.push(b.html.replace(/<[^>]+>/g, "").trim(), ""); break;
      case "button": lines.push(`${b.text}: ${b.url}`, ""); break;
      case "image": if (b.alt) lines.push(`[${b.alt}]`, ""); break;
      case "divider": lines.push("---", ""); break;
    }
  }
  lines.push("");
  lines.push(`Unsubscribe: ${opts.unsubscribeUrl}`);
  return lines.join("\n");
}
