export interface Email { to: string; subject: string; text: string; html: string }
export interface Mailer { send(email: Email): Promise<void> }

const RESEND_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

export function resendMailer(opts: { apiKey: string; from: string; replyTo: string }): Mailer {
  return {
    async send(email) {
      const res = await fetch(RESEND_URL, {
        method: "POST",
        headers: { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from: opts.from, reply_to: opts.replyTo, ...email }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`Resend answered ${res.status}`);
    },
  };
}
