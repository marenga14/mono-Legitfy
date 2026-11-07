import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { drawSeal, pagePreview, sealPreview, type SealFiles } from "../src/lib/seal";
import {
  DEFAULT_SEAL, SEAL_ARRANGEMENTS, SEAL_COLOURS, SEAL_DESIGNS, SEAL_POSITIONS, SEAL_QR_MODES, type SealColour, type SealStyle,
} from "../src/lib/sealStyles";

const COLOURS = Object.keys(SEAL_COLOURS) as SealColour[];
const DEFAULT = DEFAULT_SEAL;
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));

async function stamp(institution: string, style: SealStyle = DEFAULT, size: [number, number] = [595, 842], files: SealFiles = {}) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage(size);
  await drawSeal(pdf, page, { url: "https://legitfy.dev/v/UDS-26-7K4Q9-XPM2C", code: "UDS-26-7K4Q9-XPM2C", institution, style }, files);
  return PDFDocument.load(await pdf.save());
}

describe("certificate seal", () => {
  it.each([
    "University of Dar es Salaam",
    "Muhimbili University of Health and Allied Sciences and Very Long Campus Name Added For Good Measure",
    "École des Mines",
    "北京大学",
    "Chuo Kikuu cha Şekerbank & Ğ Co.",
    "",
  ])("draws for %j", async (name) => {
    for (const design of SEAL_DESIGNS) expect((await stamp(name, { ...DEFAULT, design })).getPageCount()).toBe(1);
  });

  it("draws every colour", async () => {
    for (const colour of COLOURS) expect((await stamp("Mzumbe University", { ...DEFAULT, design: "plaque", colour })).getPageCount()).toBe(1);
  });

  it("fits on a small page", async () => {
    expect((await stamp("Mzumbe University", DEFAULT, [200, 150])).getPageCount()).toBe(1);
  });

  it("falls back to a working design if one is removed later", async () => {
    expect((await stamp("Mzumbe University", { ...DEFAULT, design: "gone", colour: "gone" } as unknown as SealStyle)).getPageCount()).toBe(1);
  });

  it("draws every QR, position and arrangement choice", async () => {
    for (const qr of SEAL_QR_MODES) for (const position of SEAL_POSITIONS) for (const arrangement of SEAL_ARRANGEMENTS) {
      const style = { ...DEFAULT, qr, position, arrangement, showDate: true, poBox: "P.O. Box 35091, Dar es Salaam, Tanzania" };
      expect((await stamp("Mzumbe University", style)).getPageCount()).toBe(1);
      expect(await pagePreview("Mzumbe University", style)).toContain("data:image/svg");
    }
  });

  it("uses uploaded artwork, and moves the QR code outside it", async () => {
    const style: SealStyle = { ...DEFAULT, source: "upload", centre: "emblem" };
    expect((await stamp("Mzumbe University", style, undefined, { seal: PNG, emblem: PNG })).getPageCount()).toBe(1);
    expect(decodeURIComponent(await sealPreview("Mzumbe University", style, { seal: PNG }))).toContain("<image");
    expect(decodeURIComponent(await pagePreview("Mzumbe University", style, { seal: PNG }))).toContain("<image");
  });

  it("falls back to the template if the upload was removed", async () => {
    expect(decodeURIComponent(await sealPreview("Mzumbe University", { ...DEFAULT, source: "upload" }))).not.toContain("<image");
  });

  it("escapes the institution's name in the preview", async () => {
    const image = decodeURIComponent(await sealPreview(`A<b>"&'`, DEFAULT));
    expect(image).not.toContain("<b>");
    expect(image).toContain("<svg");
  });
});
