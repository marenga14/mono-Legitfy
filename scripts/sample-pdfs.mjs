// Writes fictional PDFs for local testing. Run from web/ so pdf-lib resolves: node ../scripts/sample-pdfs.mjs <dir>
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const { PDFDocument, StandardFonts, rgb } = createRequire(path.join(process.cwd(), "x.js"))("pdf-lib");
const out = process.argv[2];
mkdirSync(out, { recursive: true });

const SAMPLES = {
  "valid": ["Kilimani University", "Bachelor of Science", "Issued and in force: a public check says Issued."],
  "revoked": ["Kilimani University", "Diploma in Education", "Revoked: a public check says Revoked, and a request escalates."],
  "other-institution": ["Pwani College", "Certificate in Nursing", "Issued by Pwani. Send it to Kilimani to see the mismatch warning."],
  "unregistered": ["Kilimani University", "Bachelor of Arts", "On no record: a public check finds nothing, so ask the institution."],
};

for (const [name, [institution, title, note]] of Object.entries(SAMPLES)) {
  const pdf = await PDFDocument.create();
  pdf.setCreationDate(new Date(0));
  pdf.setModificationDate(new Date(0));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 420]);
  const line = (text, y, size) => page.drawText(text, { x: 50, y, size, font, color: rgb(0.1, 0.15, 0.25) });
  line("SAMPLE - NOT A REAL DOCUMENT", 370, 12);
  line(institution, 310, 26);
  line(title, 265, 18);
  line("Awarded to Fictional Person", 235, 13);
  line(note, 60, 10);
  writeFileSync(path.join(out, `${name}.pdf`), await pdf.save());
}
