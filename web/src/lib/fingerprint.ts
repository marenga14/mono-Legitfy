/**
 * Draws a file's SHA-256 as a fingerprint. Every byte of the hash shapes the drawing and nothing
 * else does, so the same file always gives the same print and a changed file gives a visibly
 * different one. It is a picture of the hash, not an extra check.
 */
const VIEW = 200;
const RIDGES = 14;
/** Used only while no file is loaded, and always drawn dimmed so it can't pass for a result. */
export const IDLE_PATTERN = `0x${"3c9a51e7".repeat(8)}`;

function toBytes(hash: string): number[] {
  const hex = hash.replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("A fingerprint needs a 32-byte hash.");
  return Array.from({ length: 32 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16));
}

/** Inside the rounded outline of a fingertip. */
const inThumb = (x: number, y: number) => ((x - 100) / 74) ** 2 + ((y - 106) / 90) ** 2 <= 1;

export function fingerprintPaths(hash: string): string[] {
  const b = toBytes(hash);
  const cx = VIEW / 2 + (b[0]! / 255 - 0.5) * 26;
  const cy = VIEW / 2 + 8 + (b[1]! / 255 - 0.5) * 34;
  const paths: string[] = [];

  for (let i = 0; i < RIDGES; i++) {
    const shape = b[(3 * i + 2) % 32]!;
    const phase = (b[(3 * i + 3) % 32]! / 255) * Math.PI * 2;
    const gap = (b[(3 * i + 4) % 32]! / 255) * Math.PI * 2;
    const radius = 7 + i * 6.6;
    const lobes = 2 + (shape % 3);
    // Kept below half the ridge spacing, so neighbouring ridges never cross.
    const wobble = 1 + (shape / 255) * 1.7;
    let d = "";
    let pen = false;
    const steps = 96;
    for (let s = 0; s <= steps; s++) {
      const t = (s / steps) * Math.PI * 2;
      const fromGap = Math.abs(Math.atan2(Math.sin(t - gap), Math.cos(t - gap)));
      const r = radius + wobble * Math.sin(lobes * t + phase);
      const x = cx + r * Math.cos(t);
      const y = cy + 1.22 * r * Math.sin(t);
      if (fromGap < 0.2 + (shape / 255) * 0.3 || !inThumb(x, y)) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`;
      pen = true;
    }
    if (d) paths.push(d);
  }
  return paths;
}
