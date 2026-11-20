// Outbound email via the Cloudflare Email Service binding.

const FOOTER =
  "<hr><p>This email was sent by an automated system from ixjournal.com. If you received this email in error, please let us know by replying to this email.</p>";

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const toText = (html: string): string =>
  html
    .replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, "$2 ($1)")
    .replace(/<(br|\/p|\/h\d|hr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** Never throws: a failed email must not break the request that triggered it. */
export async function sendEmail(env: Env, to: string, subject: string, html: string): Promise<void> {
  const body = html + FOOTER;
  try {
    await env.EMAIL.send({
      to,
      from: { email: env.SENDER_EMAIL, name: "IX Journal Notifications" },
      replyTo: env.REPLY_TO,
      subject,
      html: body,
      text: toText(body),
    });
  } catch (e) {
    console.error(JSON.stringify({ msg: "email send failed", subject, error: String(e) }));
  }
}
