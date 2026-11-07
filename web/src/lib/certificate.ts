import { dateLocale, t } from "./i18n";
import type { SealFiles } from "./seal";
import type { SealStyle } from "./sealStyles";

const MAX_BYTES = 15 * 1024 * 1024;

export const statusLabel = (status: string) => t(`status.${status}`);
export const shortId = (id: string) => `${id.slice(0, 10)}…${id.slice(-6)}`;
export const longDate = (d: string) => new Date(d).toLocaleDateString(dateLocale(), { dateStyle: "full" });

/**
 * Adds the institution's seal and the printed ID to the last page, for the certificate's public
 * record. The stamped file is what gets fingerprinted, so it's also the exact copy a holder must
 * present to verify.
 */
export async function stampCertificate(file: File, code: string, institution: string, style: SealStyle, files: SealFiles = {}): Promise<File> {
  if (file.size > MAX_BYTES) throw new Error(t("errors.fileTooLarge"));
  // Large, and only staff creating a certificate need them.
  const [{ PDFDocument }, { drawSeal }] = await Promise.all([import("pdf-lib"), import("./seal")]);
  let pdf: Awaited<ReturnType<typeof PDFDocument.load>>;
  try {
    pdf = await PDFDocument.load(await file.arrayBuffer());
  } catch {
    throw new Error(t("errors.cantStamp"));
  }
  await drawSeal(pdf, pdf.getPages().at(-1)!, { url: `${location.origin}/v/${code}`, code, institution, style }, files);
  return new File([(await pdf.save()) as BlobPart], file.name, { type: "application/pdf" });
}
