import { PDFDocument, degrees, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { institutionPrefix } from "./certificateCode";
import { SEAL_COLOURS, SEAL_DESIGNS, type SealDesign, type SealStyle } from "./sealStyles";

/**
 * The seal library. Institutions choose a template or upload their own seal, then set its wording,
 * centre and QR code. Default wording invites a check and claims no result, because only the
 * registry can say a certificate is valid. Everything is drawn through a `Pen`, so the PDF and the
 * editor's preview can't drift apart.
 *
 * Sizes are in points with each item's centre at 0,0 and y pointing down: the seal is about 5 cm across.
 */

const HALF = 72;
const RING = 68.5;
const INNER = 56;
const ROUND_QR = 70;
const PLAQUE_QR = 96;
const PLAQUE_INSET = 5;
const PLAQUE_CORNER = 6;
const PLAQUE_TEXT_WIDTH = 124;
const PLAQUE_NAME_Y = -55;
const PLAQUE_NOTE_Y = 62;
const BADGE_SHARE = 0.165;
const BADGE_GAP = 2;
const MARGIN = 14;
const ID_SIZE = 8;
const ID_GAP = 5;
const DETAIL_SIZE = 6.5;
const LINE_HEIGHT = 11;
const QR_ALONE = 84;
const QR_ALONE_WIDTH = 104;
const QR_PADDING = 6;
const UNIT_GAP = 14;
const CENTRE_TEXT_WIDTH = 88;
const NOTE_ARC = (5 * Math.PI) / 6;
const NAME_SIZE = 7;
const NAME_MIN_SIZE = 4.5;
const NAME_ARC = (5 * Math.PI) / 6;
const NAME_RADIUS = 59;
const NOTE = "SCAN TO CHECK • LEGITFY";
const NOTE_NO_QR = "CHECK AT LEGITFY";
const NOTE_RADIUS = 64;
const NOTE_SIZE = 6;
const DOT_RADIUS = 61.5;
const TRACKING = 0.5;
/** Pages narrower than this get a smaller seal, so it can't take over the page. */
const FULL_SIZE_PAGE = 400;
const WHITE = "#ffffff";
const FONT_FAMILY = "Helvetica, Arial, sans-serif";

interface Paint { fill?: string; stroke?: string; width?: number }
interface Pen {
  path(d: string, paint: Paint): void;
  /** `rotation` is in degrees clockwise. */
  text(text: string, x: number, y: number, size: number, rotation: number, colour: string): void;
  measure(text: string, size: number): number;
  /** `x` and `y` are the image's top left corner. */
  image(image: SealImage, x: number, y: number, width: number, height: number): void;
}

interface SealImage { embedded: PDFImage; dataUrl: string; width: number; height: number }
interface SealImages { seal?: SealImage; emblem?: SealImage }
/** What an institution has uploaded. */
export interface SealFiles { seal?: Uint8Array; emblem?: Uint8Array }
export interface SealContent { url: string; code: string; institution: string; style: SealStyle; date?: Date }

const circle = (r: number, cx = 0, cy = 0) =>
  `M${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}z`;

function around(count: number, draw: (angle: number) => string) {
  return Array.from({ length: count }, (_, i) => draw((i / count) * 2 * Math.PI)).join("");
}

function scallop(): string {
  const scallops = 48;
  const depth = 1.2;
  const steps = scallops * 8;
  const points = Array.from({ length: steps }, (_, i) => {
    const angle = (i / steps) * 2 * Math.PI;
    const radius = HALF - depth + depth * Math.cos(scallops * angle);
    return `${(radius * Math.cos(angle)).toFixed(2)} ${(radius * Math.sin(angle)).toFixed(2)}`;
  });
  return `M${points.join("L")}z`;
}

/** Flat sides face the page edges, so the corners stay inside the seal's square. */
function octagon(apothem: number): string {
  const radius = apothem / Math.cos(Math.PI / 8);
  const points = Array.from({ length: 8 }, (_, i) => {
    const angle = Math.PI / 8 + (i * Math.PI) / 4;
    return `${(radius * Math.cos(angle)).toFixed(2)} ${(radius * Math.sin(angle)).toFixed(2)}`;
  });
  return `M${points.join("L")}z`;
}

function roundedSquare(half: number, corner: number): string {
  const side = 2 * (half - corner);
  const arc = (x: number, y: number) => `a${corner} ${corner} 0 0 1 ${x} ${y}`;
  return `M${corner - half} ${-half}h${side}${arc(corner, corner)}v${side}${arc(-corner, corner)}h${-side}${arc(-corner, -corner)}v${-side}${arc(corner, -corner)}z`;
}

const FRAMES: Record<SealDesign, (pen: Pen, ink: string, accent: string) => void> = {
  rosette(pen, ink, accent) {
    pen.path(scallop(), { fill: WHITE, stroke: accent, width: 1 });
    pen.path(circle(RING), { stroke: ink, width: 0.5 });
  },
  classic(pen, ink, accent) {
    pen.path(circle(HALF - 1.2), { fill: WHITE, stroke: accent, width: 2.4 });
    pen.path(circle(RING - 0.5), { stroke: ink, width: 0.5 });
  },
  beaded(pen, ink, accent) {
    pen.path(circle(HALF), { fill: WHITE });
    pen.path(around(64, (a) => circle(1.15, 70.5 * Math.cos(a), 70.5 * Math.sin(a))), { fill: accent });
    pen.path(circle(RING - 0.5), { stroke: ink, width: 0.6 });
  },
  milled(pen, ink, accent) {
    pen.path(circle(HALF), { fill: WHITE });
    pen.path(around(96, (a) => `M${68.5 * Math.cos(a)} ${68.5 * Math.sin(a)}L${HALF * Math.cos(a)} ${HALF * Math.sin(a)}`), { stroke: accent, width: 1 });
    pen.path(circle(RING - 0.5), { stroke: ink, width: 0.6 });
  },
  octagon(pen, ink, accent) {
    pen.path(octagon(HALF - 0.8), { fill: WHITE, stroke: accent, width: 1.6 });
    pen.path(octagon(RING - 0.5), { stroke: ink, width: 0.5 });
  },
  plaque(pen, ink, accent) {
    pen.path(roundedSquare(HALF - 1, PLAQUE_CORNER), { fill: WHITE, stroke: accent, width: 2 });
    pen.path(roundedSquare(HALF - PLAQUE_INSET, PLAQUE_CORNER - 2), { stroke: ink, width: 0.5 });
  },
};

/** The built-in PDF fonts only cover Latin text, so the rest is dropped from anything printed. */
const printable = (text: string) =>
  text.normalize("NFKD").replace(/\p{M}/gu, "").toUpperCase().replace(/[^A-Z0-9&.,'/:#()-]+/g, " ").trim();

const spaced = (pen: Pen, text: string, size: number) => pen.measure(text, size) + TRACKING * (text.length - 1);

function fit(pen: Pen, wording: string, space: number, largest: number): { text: string; size: number } {
  let text = wording;
  while (spaced(pen, text, NAME_MIN_SIZE) > space && text.includes(" ")) text = text.slice(0, text.lastIndexOf(" "));
  return { text, size: Math.max(NAME_MIN_SIZE, Math.min(largest, largest * (space / spaced(pen, text, largest)))) };
}

/** Sets text one letter at a time: over the top, or under the bottom reading left to right. */
function drawArc(pen: Pen, text: string, size: number, radius: number, bottom: boolean, colour: string) {
  let along = -spaced(pen, text, size) / 2;
  const side = bottom ? 1 : -1;
  for (const letter of text) {
    const width = pen.measure(letter, size);
    const angle = (along + width / 2) / radius;
    const [sin, cos] = [Math.sin(angle), Math.cos(angle)];
    pen.text(letter, radius * sin - (width / 2) * cos, side * (radius * cos + (width / 2) * sin), size, (-side * angle * 180) / Math.PI, colour);
    along += width + TRACKING;
  }
}

function drawLine(pen: Pen, text: string, size: number, y: number, colour: string) {
  let x = -spaced(pen, text, size) / 2;
  for (const letter of text) {
    pen.text(letter, x, y, size, 0, colour);
    x += pen.measure(letter, size) + TRACKING;
  }
}

/** Keeps an uploaded image's proportions inside a box centred on x,y. */
function drawContained(pen: Pen, image: SealImage, box: number, x = 0, y = 0) {
  const ratio = Math.min(box / image.width, box / image.height);
  const [width, height] = [image.width * ratio, image.height * ratio];
  pen.image(image, x - width / 2, y - height / 2, width, height);
}

/** One vector path, so the code stays sharp at any print size. */
function qrPath(url: string, side: number): string {
  // A badge can cover the middle of the code, so it needs the highest error correction.
  const { size, data } = QRCode.create(url, { errorCorrectionLevel: "H" }).modules;
  const unit = side / size;
  const at = (n: number) => (n * unit - side / 2).toFixed(3);
  let path = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!data[y * size + x]) continue;
      const start = x;
      while (x + 1 < size && data[y * size + x + 1]) x++;
      path += `M${at(start)} ${at(y)}L${at(x + 1)} ${at(y)}L${at(x + 1)} ${at(y + 1)}L${at(start)} ${at(y + 1)}z`;
    }
  }
  return path;
}

const coloursOf = (style: SealStyle) => SEAL_COLOURS[style.colour] ?? SEAL_COLOURS.violet;
const usesUpload = (style: SealStyle, images: SealImages) => style.source === "upload" && Boolean(images.seal);
/** There's nowhere to put a QR code inside someone's own artwork, so it moves beside the seal. */
const qrMode = (style: SealStyle, images: SealImages) =>
  usesUpload(style, images) && style.qr === "inside" ? "separate" : style.qr;
const formatDate = (date: Date) =>
  date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();

/** Long addresses take two lines in the seal's centre. */
function wrap(text: string): string[] {
  const middle = text.length > 22 ? text.lastIndexOf(" ", Math.ceil(text.length / 2) + 3) : -1;
  return middle > 0 ? [text.slice(0, middle), text.slice(middle + 1)] : text ? [text] : [];
}
const details = (content: SealContent) => [
  ...(content.style.showDate ? [formatDate(content.date ?? new Date())] : []),
  ...(content.style.poBox ? [printable(content.style.poBox)] : []),
];

function drawInitials(pen: Pen, initials: string, fill: string, centre: number, size: number, width: number, y: number) {
  const fitted = Math.min(size, size * (width / pen.measure(initials, size)));
  pen.text(initials, -pen.measure(initials, fitted) / 2, centre + y * fitted, fitted, 0, fill);
}

function drawCentre(pen: Pen, content: SealContent, images: SealImages, initials: string, ink: string) {
  const lines = details(content).flatMap(wrap);
  const top = lines.length ? -12 : 0;
  if (content.style.centre === "emblem" && images.emblem) drawContained(pen, images.emblem, lines.length ? 48 : 68, 0, top);
  else drawInitials(pen, initials, ink, top, 32, CENTRE_TEXT_WIDTH, 0.36);
  lines.forEach((line, i) => {
    const { text, size } = fit(pen, line, CENTRE_TEXT_WIDTH - i * 8, DETAIL_SIZE + 1);
    drawLine(pen, text, size, 22 + i * 9, ink);
  });
}

function drawFace(pen: Pen, content: SealContent, images: SealImages) {
  const { style } = content;
  if (usesUpload(style, images)) return drawContained(pen, images.seal!, 2 * HALF);
  const { ink, accent } = coloursOf(style);
  const design = FRAMES[style.design] ? style.design : SEAL_DESIGNS[0];
  const qr = qrMode(style, images);
  const name = printable(style.topText) || printable(content.institution) || "LEGITFY";
  const note = printable(style.bottomText) || (qr === "inside" ? NOTE : NOTE_NO_QR);
  const initials = printable(style.initials).replace(/\W/g, "") || institutionPrefix(content.institution);
  const plaque = design === "plaque";
  FRAMES[design](pen, ink, accent);

  if (plaque) {
    const top = fit(pen, name, PLAQUE_TEXT_WIDTH, NAME_SIZE);
    const bottom = fit(pen, note, PLAQUE_TEXT_WIDTH, NOTE_SIZE);
    drawLine(pen, top.text, top.size, PLAQUE_NAME_Y, ink);
    drawLine(pen, bottom.text, bottom.size, PLAQUE_NOTE_Y, ink);
  } else {
    pen.path(circle(INNER), { stroke: accent, width: 0.8 });
    const top = fit(pen, name, NAME_ARC * NAME_RADIUS, NAME_SIZE);
    const bottom = fit(pen, note, NOTE_ARC * NOTE_RADIUS, NOTE_SIZE);
    drawArc(pen, top.text, top.size, NAME_RADIUS, false, ink);
    drawArc(pen, bottom.text, bottom.size, NOTE_RADIUS, true, ink);
    pen.path(circle(1.3, -DOT_RADIUS) + circle(1.3, DOT_RADIUS), { fill: accent });
  }

  if (qr !== "inside") return drawCentre(pen, content, images, initials, ink);
  const side = plaque ? PLAQUE_QR : ROUND_QR;
  pen.path(qrPath(content.url, side), { fill: ink });
  const badge = side * BADGE_SHARE;
  pen.path(circle(badge + BADGE_GAP), { fill: WHITE });
  if (style.centre === "emblem" && images.emblem) return drawContained(pen, images.emblem, badge * 2);
  pen.path(circle(badge), { fill: accent });
  drawInitials(pen, initials, WHITE, 0, badge * 0.87, badge * 1.6, 0.36);
}

function drawCaption(pen: Pen, lines: { text: string; size: number }[], top: number, ink: string) {
  lines.forEach(({ text, size }, i) => {
    const width = pen.measure(text, size);
    const baseline = top + ID_GAP + size + i * LINE_HEIGHT;
    pen.path(`M${-width / 2 - 3} ${baseline - size - 1}h${width + 6}v${size + 4}h${-width - 6}z`, { fill: WHITE });
    pen.text(text, -width / 2, baseline, size, 0, ink);
  });
}

function drawQrAlone(pen: Pen, content: SealContent) {
  const half = QR_ALONE / 2 + QR_PADDING;
  pen.path(`M${-half} ${-half}h${2 * half}v${2 * half}h${-2 * half}z`, { fill: WHITE });
  pen.path(qrPath(content.url, QR_ALONE), { fill: coloursOf(content.style).ink });
}

interface Point { x: number; y: number }
interface Plan { scale: number; seal: Point; qr: Point | null; sealLines: { text: string; size: number }[]; qrLines: { text: string; size: number }[] }

/** Works out where everything goes, with x,y as the centre of the seal and the QR code in page points. */
function plan(pageWidth: number, pageHeight: number, content: SealContent, images: SealImages): Plan {
  const { style, code } = content;
  const scale = Math.min(1, Math.min(pageWidth, pageHeight) / FULL_SIZE_PAGE);
  const qr = qrMode(style, images);
  const id = { text: code, size: ID_SIZE };
  const extras = details(content).map((text) => ({ text, size: DETAIL_SIZE }));
  const centreFree = !usesUpload(style, images) && qr !== "inside";
  const sealLines = [...(qr === "separate" ? [] : [id]), ...(centreFree ? [] : extras)];
  const qrLines = qr === "separate" ? [id] : [];

  const margin = MARGIN * scale;
  const gap = UNIT_GAP * scale;
  const right = style.position.endsWith("right");
  const top = style.position.startsWith("top");
  const captionHeight = (lines: number) => (lines ? ID_GAP + lines * LINE_HEIGHT : 0) * scale;
  const [sealWidth, sealHeight] = [2 * HALF * scale, 2 * HALF * scale + captionHeight(sealLines.length)];
  const [qrWidth, qrHeight] = [QR_ALONE_WIDTH * scale, (QR_ALONE + 2 * QR_PADDING) * scale + captionHeight(qrLines.length)];
  const alongX = (width: number) => (right ? pageWidth - margin - width : margin);
  const alongY = (height: number) => (top ? pageHeight - margin - height : margin);
  const [sealX, sealY] = [alongX(sealWidth), alongY(sealHeight)];
  const seal = { x: sealX + sealWidth / 2, y: sealY + sealHeight - HALF * scale };
  if (qr !== "separate") return { scale, seal, qr: null, sealLines, qrLines };

  let [qrX, qrY] = [right ? margin : pageWidth - margin - qrWidth, alongY(qrHeight)];
  if (style.arrangement === "horizontal") qrX = right ? sealX - gap - qrWidth : sealX + sealWidth + gap;
  if (style.arrangement === "vertical") [qrX, qrY] = [alongX(qrWidth), top ? sealY - gap - qrHeight : sealY + sealHeight + gap];
  return { scale, seal, qr: { x: qrX + qrWidth / 2, y: qrY + qrHeight - (QR_ALONE / 2 + QR_PADDING) * scale }, sealLines, qrLines };
}

function drawPlan(pen: (centre: Point) => Pen, layout: Plan, content: SealContent, images: SealImages) {
  const { ink } = coloursOf(content.style);
  const face = pen(layout.seal);
  drawFace(face, content, images);
  drawCaption(face, layout.sealLines, HALF, ink);
  if (!layout.qr) return;
  const qr = pen(layout.qr);
  drawQrAlone(qr, content);
  drawCaption(qr, layout.qrLines, QR_ALONE / 2 + QR_PADDING, ink);
}

const toRgb = (hex: string) => rgb(...([1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]));

function pdfPen(page: PDFPage, font: PDFFont, { x: cx, y: cy }: Point, scale: number): Pen {
  return {
    path: (d, { fill, stroke, width }) => page.drawSvgPath(d, {
      x: cx, y: cy, scale,
      ...(fill && { color: toRgb(fill) }),
      ...(stroke && { borderColor: toRgb(stroke), borderWidth: width ?? 1 }),
    }),
    text: (text, x, y, size, rotation, colour) => page.drawText(text, {
      x: cx + x * scale, y: cy - y * scale, size: size * scale, font, color: toRgb(colour), rotate: degrees(-rotation),
    }),
    measure: (text, size) => font.widthOfTextAtSize(text, size),
    image: (image, x, y, width, height) => page.drawImage(image.embedded, {
      x: cx + x * scale, y: cy - (y + height) * scale, width: width * scale, height: height * scale,
    }),
  };
}

const escapeXml = (s: string) => s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

function svgPen(font: PDFFont, out: { body: string }): Pen {
  return {
    path: (d, { fill, stroke, width }) => {
      out.body += `<path d="${d}" fill="${fill ?? "none"}" stroke="${stroke ?? "none"}" stroke-width="${width ?? 0}"/>`;
    },
    text: (text, x, y, size, rotation, colour) => {
      out.body += `<text transform="translate(${x} ${y}) rotate(${rotation})" font-size="${size}" font-weight="700" font-family="${FONT_FAMILY}" fill="${colour}">${escapeXml(text)}</text>`;
    },
    measure: (text, size) => font.widthOfTextAtSize(text, size),
    image: (image, x, y, width, height) => {
      out.body += `<image href="${image.dataUrl}" x="${x}" y="${y}" width="${width}" height="${height}"/>`;
    },
  };
}

async function embedImage(pdf: PDFDocument, bytes: Uint8Array): Promise<SealImage> {
  const png = bytes[0] === 0x89;
  const embedded = await (png ? pdf.embedPng(bytes) : pdf.embedJpg(bytes));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return { embedded, dataUrl: `data:image/${png ? "png" : "jpeg"};base64,${btoa(binary)}`, width: embedded.width, height: embedded.height };
}

async function embedImages(pdf: PDFDocument, files: SealFiles): Promise<SealImages> {
  return {
    ...(files.seal && { seal: await embedImage(pdf, files.seal) }),
    ...(files.emblem && { emblem: await embedImage(pdf, files.emblem) }),
  };
}

/** Draws the seal, and any separate QR code, on the page. */
export async function drawSeal(pdf: PDFDocument, page: PDFPage, content: SealContent, files: SealFiles = {}) {
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const images = await embedImages(pdf, files);
  const layout = plan(page.getWidth(), page.getHeight(), content, images);
  drawPlan((centre) => pdfPen(page, font, centre, layout.scale), layout, content, images);
}

const asImage = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const sampleUrl = "https://legitfy.dev/v/UDS-26-7K4Q9-XPM2C";
const SAMPLE_CODE = "UDS-26-7K4Q9-XPM2C";

/** An image of just the seal, for choosing a design. */
export async function sealPreview(institution: string, style: SealStyle, files: SealFiles = {}): Promise<string> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const out = { body: "" };
  drawFace(svgPen(font, out), { url: sampleUrl, code: SAMPLE_CODE, institution, style }, await embedImages(pdf, files));
  const box = HALF + 2;
  return asImage(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-box} ${-box} ${2 * box} ${2 * box}">${out.body}</svg>`);
}

/** An image of a whole A4 page, showing where everything lands. */
export async function pagePreview(institution: string, style: SealStyle, files: SealFiles = {}): Promise<string> {
  const [width, height] = [595, 842];
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const images = await embedImages(pdf, files);
  const content = { url: sampleUrl, code: SAMPLE_CODE, institution, style };
  const layout = plan(width, height, content, images);
  let body = "";
  const lines = Array.from({ length: 22 }, (_, i) => `<rect x="60" y="${90 + i * 32}" width="${i % 5 === 4 ? 300 : 475}" height="8" rx="4" fill="#e4e4ee"/>`).join("");
  drawPlan((centre) => {
    const out = { body: "" };
    const pen = svgPen(font, out);
    const group = (write: () => void) => {
      write();
      body += `<g transform="translate(${centre.x} ${height - centre.y}) scale(${layout.scale})">${out.body}</g>`;
      out.body = "";
    };
    return {
      path: (d, paint) => group(() => pen.path(d, paint)),
      text: (t, x, y, size, rotation, colour) => group(() => pen.text(t, x, y, size, rotation, colour)),
      measure: pen.measure,
      image: (image, x, y, w, h) => group(() => pen.image(image, x, y, w, h)),
    };
  }, layout, content, images);
  return asImage(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#fff"/>${lines}${body}</svg>`);
}
