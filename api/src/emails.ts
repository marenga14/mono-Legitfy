export type Locale = "en" | "sw" | "zh";
export type EmailKind =
  | "applicationReceived" | "applicationApproved" | "applicationRejected"
  | "requestReceived" | "requestAnswered" | "newRequest" | "changeApproved" | "changeRejected";

/** Everything a message can mention. Each one is escaped before it goes in the HTML. */
export interface EmailData { name?: string; institution?: string; link?: string; reason?: string; field?: string; value?: string }
interface Message { subject: string; lines: string[]; steps?: string[]; action?: string; note?: string }
interface Footer { sent: string; help: string }

const FIELDS: Record<Locale, Record<string, string>> = {
  en: { registration_number: "registration number", institution_type: "institution type", country: "country", city: "city" },
  sw: { registration_number: "namba ya usajili", institution_type: "aina ya taasisi", country: "nchi", city: "jiji" },
  zh: { registration_number: "注册编号", institution_type: "机构类型", country: "国家", city: "城市" },
};
export const fieldName = (locale: Locale, field: string) => FIELDS[locale][field] ?? field;

const FOOTER: Record<Locale, Footer> = {
  en: { sent: "You're receiving this because of activity on Legitfy.", help: "Need help? Reply to this email." },
  sw: { sent: "Unapokea barua pepe hii kwa sababu ya shughuli kwenye Legitfy.", help: "Unahitaji msaada? Jibu barua pepe hii." },
  zh: { sent: "您收到此邮件是因为您在 Legitfy 上有相关活动。", help: "需要帮助？请直接回复此邮件。" },
};

const MESSAGES: Record<Locale, Record<EmailKind, (d: EmailData) => Message>> = {
  en: {
    applicationReceived: (d) => ({
      subject: `We've received the application for ${d.institution}`,
      lines: [`Hi ${d.name},`, `Thanks for applying to bring ${d.institution} to Legitfy.`, "Next, your head of institution needs to sign and stamp your letter of appointment. Use your tracking link to download the letter, upload it when it's signed, and follow your application."],
      action: "Open my application", note: "Anyone with this link can see your application, so keep it private.",
    }),
    applicationApproved: (d) => ({
      subject: `Welcome to Legitfy, ${d.institution}`,
      lines: [`Hi ${d.name},`, `Good news: ${d.institution} has been approved and is now registered on the public record.`, "To get started:"],
      steps: ["Sign in with the wallet you applied with.", "Check your institution profile and certificate seal.", "Add the staff who will work with you.", "Create your first certificate."],
      action: "Sign in to Legitfy",
    }),
    applicationRejected: (d) => ({
      subject: `Your Legitfy application for ${d.institution}`,
      lines: [`We reviewed the application for ${d.institution} and couldn't approve it this time.`, `Reason: ${d.reason}`, "We've erased the personal details and documents from this application. You're welcome to apply again."],
      action: "Apply again",
    }),
    requestReceived: (d) => ({
      subject: `Your verification request to ${d.institution}`,
      lines: [`We've sent your verification request to ${d.institution}.`, "Use your tracking link to follow it and see the answer."],
      action: "Track my request", note: "Anyone with this link can see the request, so keep it private.",
    }),
    requestAnswered: (d) => ({
      subject: `${d.institution} has answered your request`,
      lines: [`${d.institution} has answered your verification request.`, "Open the tracking link you received when you sent it to see the answer. We don't put answers in email, to keep them private."],
    }),
    newRequest: (d) => ({
      subject: `New verification request for ${d.institution}`,
      lines: [`${d.institution} has a new verification request waiting for review.`],
      action: "Open requests",
    }),
    changeApproved: (d) => ({
      subject: `Your ${d.field} change was approved`,
      lines: [`We've approved the change to your ${d.field} for ${d.institution}. It's now ${d.value}.`],
      action: "View institution profile",
    }),
    changeRejected: (d) => ({
      subject: `Your ${d.field} change wasn't approved`,
      lines: [`We couldn't approve the change to your ${d.field} for ${d.institution}.`, `Reason: ${d.reason}`],
      action: "View institution profile",
    }),
  },
  sw: {
    applicationReceived: (d) => ({
      subject: `Tumepokea ombi la ${d.institution}`,
      lines: [`Habari ${d.name},`, `Asante kwa kuomba kuileta ${d.institution} kwenye Legitfy.`, "Hatua inayofuata ni mkuu wa taasisi kusaini na kugonga muhuri barua yako ya uteuzi. Tumia kiungo chako cha ufuatiliaji kupakua barua, kuipakia ikishasainiwa, na kufuatilia ombi lako."],
      action: "Fungua ombi langu", note: "Yeyote mwenye kiungo hiki anaweza kuona ombi lako, kwa hiyo kiweke faragha.",
    }),
    applicationApproved: (d) => ({
      subject: `Karibu Legitfy, ${d.institution}`,
      lines: [`Habari ${d.name},`, `Habari njema: ${d.institution} imeidhinishwa na sasa imesajiliwa kwenye rekodi ya umma.`, "Ili kuanza:"],
      steps: ["Ingia kwa akaunti uliyotumia kuomba.", "Kagua wasifu wa taasisi na muhuri wa cheti.", "Ongeza wafanyakazi watakaofanya kazi nawe.", "Unda cheti chako cha kwanza."],
      action: "Ingia kwenye Legitfy",
    }),
    applicationRejected: (d) => ({
      subject: `Ombi lako la Legitfy kwa ${d.institution}`,
      lines: [`Tumekagua ombi la ${d.institution} na hatukuweza kuliidhinisha kwa sasa.`, `Sababu: ${d.reason}`, "Tumefuta taarifa binafsi na hati za ombi hili. Unakaribishwa kuomba tena."],
      action: "Omba tena",
    }),
    requestReceived: (d) => ({
      subject: `Ombi lako la uhakiki kwa ${d.institution}`,
      lines: [`Tumetuma ombi lako la uhakiki kwa ${d.institution}.`, "Tumia kiungo chako cha ufuatiliaji kulifuatilia na kuona jibu."],
      action: "Fuatilia ombi langu", note: "Yeyote mwenye kiungo hiki anaweza kuona ombi hili, kwa hiyo kiweke faragha.",
    }),
    requestAnswered: (d) => ({
      subject: `${d.institution} imejibu ombi lako`,
      lines: [`${d.institution} imejibu ombi lako la uhakiki.`, "Fungua kiungo cha ufuatiliaji ulichopokea ulipolituma ili kuona jibu. Hatuweki majibu kwenye barua pepe, ili yabaki ya faragha."],
    }),
    newRequest: (d) => ({
      subject: `Ombi jipya la uhakiki kwa ${d.institution}`,
      lines: [`${d.institution} ina ombi jipya la uhakiki linalosubiri ukaguzi.`],
      action: "Fungua maombi",
    }),
    changeApproved: (d) => ({
      subject: `Mabadiliko ya ${d.field} yameidhinishwa`,
      lines: [`Tumeidhinisha mabadiliko ya ${d.field} ya ${d.institution}. Sasa ni ${d.value}.`],
      action: "Tazama wasifu wa taasisi",
    }),
    changeRejected: (d) => ({
      subject: `Mabadiliko ya ${d.field} hayajaidhinishwa`,
      lines: [`Hatukuweza kuidhinisha mabadiliko ya ${d.field} ya ${d.institution}.`, `Sababu: ${d.reason}`],
      action: "Tazama wasifu wa taasisi",
    }),
  },
  zh: {
    applicationReceived: (d) => ({
      subject: `我们已收到 ${d.institution} 的申请`,
      lines: [`${d.name}，您好：`, `感谢您为 ${d.institution} 申请加入 Legitfy。`, "下一步，请机构负责人签署任命函并加盖公章。您可以通过跟踪链接下载任命函、在签署后上传，并查看申请进度。"],
      action: "打开我的申请", note: "任何拥有此链接的人都能查看您的申请，请妥善保管。",
    }),
    applicationApproved: (d) => ({
      subject: `欢迎加入 Legitfy，${d.institution}`,
      lines: [`${d.name}，您好：`, `好消息：${d.institution} 已获批准，现已在公开记录中注册。`, "开始使用："],
      steps: ["使用申请时的钱包登录。", "检查机构资料和证书印章。", "添加与您共同工作的员工。", "创建您的第一份证书。"],
      action: "登录 Legitfy",
    }),
    applicationRejected: (d) => ({
      subject: `您为 ${d.institution} 提交的 Legitfy 申请`,
      lines: [`我们已审核 ${d.institution} 的申请，此次未能批准。`, `原因：${d.reason}`, "我们已删除此申请中的个人信息和文件。欢迎您重新申请。"],
      action: "重新申请",
    }),
    requestReceived: (d) => ({
      subject: `您向 ${d.institution} 提交的核验请求`,
      lines: [`我们已将您的核验请求发送给 ${d.institution}。`, "您可以通过跟踪链接查看进度和答复。"],
      action: "跟踪我的请求", note: "任何拥有此链接的人都能查看此请求，请妥善保管。",
    }),
    requestAnswered: (d) => ({
      subject: `${d.institution} 已答复您的请求`,
      lines: [`${d.institution} 已答复您的核验请求。`, "请打开提交时收到的跟踪链接查看答复。为保护隐私，我们不会在邮件中发送答复内容。"],
    }),
    newRequest: (d) => ({
      subject: `${d.institution} 收到新的核验请求`,
      lines: [`${d.institution} 有一项新的核验请求等待审核。`],
      action: "打开请求",
    }),
    changeApproved: (d) => ({
      subject: `您的${d.field}变更已获批准`,
      lines: [`我们已批准 ${d.institution} 的${d.field}变更，现为 ${d.value}。`],
      action: "查看机构资料",
    }),
    changeRejected: (d) => ({
      subject: `您的${d.field}变更未获批准`,
      lines: [`我们未能批准 ${d.institution} 的${d.field}变更。`, `原因：${d.reason}`],
      action: "查看机构资料",
    }),
  },
};

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** Names and reasons come from forms, and a line break mustn't reach the subject header. */
const singleLine = (s: string) => s.replace(/\s+/g, " ").trim();
const INDIGO = "#2c1b8f";
const VIOLET = "#5a33dc";
const TEXT = "#17114f";
const MUTED = "#5d5a7a";

export function renderEmail(kind: EmailKind, locale: Locale, data: EmailData) {
  const copy = MESSAGES[locale] ?? MESSAGES.en;
  const footer = FOOTER[locale] ?? FOOTER.en;
  const m = copy[kind](data);
  const paragraph = (s: string) => `<p style="margin:0 0 16px;line-height:1.6;color:${TEXT}">${escapeHtml(s).replace(/\n/g, "<br>")}</p>`;
  const steps = m.steps ? `<ol style="margin:0 0 20px;padding-left:22px;line-height:1.7;color:${TEXT}">${m.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>` : "";
  const button = m.action && data.link
    ? `<p style="margin:24px 0"><a href="${escapeHtml(data.link)}" style="display:inline-block;padding:12px 24px;border-radius:999px;background:${VIOLET};color:#ffffff;font-weight:600;text-decoration:none">${escapeHtml(m.action)}</a></p>`
    : "";
  const note = m.note ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:${MUTED}">${escapeHtml(m.note)}</p>` : "";
  const html = `<!doctype html><html lang="${locale}"><body style="margin:0;padding:24px;background:#f3f2fb;font-family:Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="padding:20px 28px;background:${INDIGO};color:#ffffff;font-size:20px;font-weight:700">Legitfy</td></tr>
<tr><td style="padding:28px">${m.lines.map(paragraph).join("")}${steps}${button}${note}</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #e6e4f4;font-size:13px;line-height:1.5;color:${MUTED}">${escapeHtml(footer.sent)} ${escapeHtml(footer.help)}</td></tr>
</table></body></html>`;
  const text = [
    ...m.lines, ...(m.steps ?? []).map((s, i) => `${i + 1}. ${s}`),
    ...(m.action && data.link ? [`${m.action}: ${data.link}`] : []),
    ...(m.note ? [m.note] : []), "", `${footer.sent} ${footer.help}`,
  ].join("\n\n").replace(/\n{3,}/g, "\n\n");
  return { subject: singleLine(m.subject), text, html };
}
