// Shared HTML bits for the daily + weekly renderers: escaping, tweet cards,
// and the one stylesheet both pages use.
export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// X's API returns entity-encoded text (&amp; etc) — decode before our own
// escaping so it doesn't render double-escaped. Trailing t.co links are just
// media/quote stubs; the card itself links out, so drop them.
export const cleanText = (s) =>
  String(s ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/(?:\s*https:\/\/t\.co\/\w+)+\s*$/, "");

export const fmtN = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(n));

export const fmtTime = (iso) => {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/Denver",
    });
  } catch {
    return "";
  }
};

export function tweetCard(t, timeLabel = fmtTime(t.created_at)) {
  const url = `https://x.com/${t.author}/status/${t.id}`;
  // RT wrappers carry the original's rt count but zero likes/replies — show
  // only the metrics that exist instead of a row of zeros.
  const meta = [
    t.likes ? `♥ ${fmtN(t.likes)}` : "",
    t.rts ? `🔁 ${fmtN(t.rts)}` : "",
    t.replies ? `💬 ${fmtN(t.replies)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return `<a class="tw" href="${esc(url)}" target="_blank" rel="noopener">
  <div class="twhead"><span class="name">${esc(t.author_name || t.author)}</span> <span class="handle">@${esc(t.author)}</span>${t.is_rt ? ' <span class="rtbadge">RT</span>' : ""}<span class="time">${esc(timeLabel)}</span></div>
  <div class="twtext">${esc(cleanText(t.text))}</div>
  ${meta ? `<div class="twmeta">${meta}</div>` : ""}
</a>`;
}

export const mdTweet = (t) =>
  `- [@${t.author}](https://x.com/${t.author}/status/${t.id})` +
  (t.likes || t.rts ? ` (${[t.likes && `${fmtN(t.likes)}♥`, t.rts && `${fmtN(t.rts)}🔁`].filter(Boolean).join(" ")})` : "") +
  `: ${cleanText(t.text).replace(/\s+/g, " ").slice(0, 200)}`;

export const CSS = `
  :root { --bg:#f6f5f2; --card:#ffffff; --ink:#1a1a1a; --muted:#71717a; --line:#e4e4e7; --accent:#b4552d; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#101012; --card:#1a1a1e; --ink:#e8e8ea; --muted:#8e8e96; --line:#2a2a30; --accent:#e07a4a; }
  }
  * { box-sizing:border-box; margin:0; }
  body { background:var(--bg); color:var(--ink); font:16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
         max-width:640px; margin:0 auto; padding:16px 14px 60px; }
  header h1 { font-size:1.5rem; line-height:1.25; letter-spacing:-0.01em; }
  header .date { color:var(--muted); font-size:.85rem; margin-bottom:6px; text-transform:uppercase; letter-spacing:.06em; }
  header .stats { color:var(--muted); font-size:.85rem; margin-top:8px; }
  .intro { margin:16px 0 4px; font-size:1.02rem; }
  section.theme { margin-top:30px; }
  section.theme h2 { font-size:1.12rem; margin-bottom:4px; }
  .daysline { color:var(--accent); font-size:.78rem; text-transform:uppercase; letter-spacing:.05em; margin-bottom:4px; }
  .blurb { color:var(--muted); font-size:.92rem; margin-bottom:10px; }
  .cards { display:flex; flex-direction:column; gap:10px; margin-top:10px; }
  a.tw { display:block; background:var(--card); border:1px solid var(--line); border-radius:12px;
         padding:12px 14px; text-decoration:none; color:var(--ink); }
  a.tw:active { border-color:var(--accent); }
  .twhead { font-size:.85rem; margin-bottom:6px; }
  .twhead .name { font-weight:600; }
  .twhead .handle { color:var(--muted); }
  .twhead .time { color:var(--muted); float:right; }
  .rtbadge { color:var(--muted); border:1px solid var(--line); border-radius:4px; padding:0 4px; font-size:.7rem; }
  .twtext { white-space:pre-wrap; word-wrap:break-word; font-size:.95rem; }
  .twmeta { color:var(--muted); font-size:.8rem; margin-top:8px; }
  .angles { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:14px; margin-top:12px; }
  .angles li { margin:8px 0 8px 18px; font-size:.95rem; }
  footer { margin-top:44px; color:var(--muted); font-size:.8rem; }
  footer a { color:var(--muted); }
  .archive a { margin-right:10px; }
`;
