export interface MandateDetails {
  reference: string; institutionName: string; registrationNumber: string; city: string; country: string;
  applicantName: string; applicantPosition: string; applicantEmail: string; signatoryName: string; signatoryTitle: string; wallet: string;
}

const WIDTH = 595;
const MARGIN = 60;
const INK = { r: 0.06, g: 0.13, b: 0.2 };
const BLANK = "______________________";
/** Standard PDF fonts can't draw every script. A blank line lets the institution write it by hand. */
const printable = (text: string) => (/^[\x20-\x7e\xa0-\xff]*$/.test(text) ? text : BLANK);

/** The letter stays in English: it's a formal record for review, whatever language the site is in. */
export async function downloadMandate(d: MandateDetails) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([WIDTH, 842]);
  const [regular, bold] = await Promise.all([pdf.embedFont(StandardFonts.Helvetica), pdf.embedFont(StandardFonts.HelveticaBold)]);
  const color = rgb(INK.r, INK.g, INK.b);
  let y = 780;

  const wrap = (text: string, size: number, font = regular) => {
    const lines: string[] = [];
    let line = "";
    for (const word of text.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > WIDTH - MARGIN * 2) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    return [...lines, line];
  };
  const write = (text: string, { size = 11, font = regular, after = 10 } = {}) => {
    for (const line of wrap(printable(text), size, font)) {
      page.drawText(line, { x: MARGIN, y, size, font, color });
      y -= size + 5;
    }
    y -= after;
  };
  const institution = printable(d.institutionName);

  write("Letter of Mandate", { size: 20, font: bold, after: 4 });
  write(`Legitfy application reference: ${d.reference}`, { size: 9, after: 22 });
  write("Date: ______________________", { after: 14 });
  write("To: The Legitfy review team", { after: 14 });
  write(`Re: Authority to run the Legitfy account of ${institution}`, { font: bold, after: 14 });
  write(`I, ${printable(d.signatoryName)}, ${printable(d.signatoryTitle)} of ${institution} (registration number ${printable(d.registrationNumber)}), ${printable(d.city)}, ${printable(d.country)}, confirm that I have the authority to sign this letter on behalf of the institution, and that the institution is applying to use Legitfy.`);
  write(`The institution appoints ${printable(d.applicantName)}, ${printable(d.applicantPosition)} (${printable(d.applicantEmail)}), to act on its behalf as the administrator of its Legitfy account, using only the wallet address below. This authority includes publishing, correcting and revoking the institution's credentials on a public record, and adding or removing staff.`);
  write("Administrator wallet address:", { font: bold, after: 0 });
  write(d.wallet, { after: 14 });
  write("The institution will tell Legitfy immediately if this person leaves the role, or if the wallet is lost or compromised.", { after: 26 });
  write("Signature: ______________________________", { after: 12 });
  write(`Name: ${printable(d.signatoryName)}`, { after: 0 });
  write(`Title: ${printable(d.signatoryTitle)}`, { after: 16 });

  const box = { x: MARGIN, y: y - 90, width: 190, height: 95 };
  page.drawRectangle({ ...box, borderColor: color, borderWidth: 0.75, borderDashArray: [4, 3] });
  page.drawText("Official seal or stamp", { x: box.x + 10, y: box.y + box.height - 16, size: 9, font: regular, color });

  const url = URL.createObjectURL(new Blob([(await pdf.save()) as BlobPart], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "legitfy-letter-of-mandate.pdf";
  link.click();
  URL.revokeObjectURL(url);
}
