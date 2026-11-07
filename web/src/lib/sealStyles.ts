/** Apart from seal.ts, so the editor can list these without loading the PDF tools. */
export const SEAL_DESIGNS = ["rosette", "classic", "beaded", "milled", "octagon", "plaque"] as const;
export const SEAL_COLOURS = {
  violet: { ink: "#17114f", accent: "#6a3bf0" },
  navy: { ink: "#0f1b3d", accent: "#1f3a7a" },
  blue: { ink: "#0b2a66", accent: "#1565d8" },
  green: { ink: "#0c3b2a", accent: "#12805c" },
  red: { ink: "#5c0a18", accent: "#c81e3a" },
} as const;
export const SEAL_SOURCES = ["template", "upload"] as const;
export const SEAL_CENTRES = ["initials", "emblem"] as const;
export const SEAL_QR_MODES = ["inside", "separate", "none"] as const;
export const SEAL_POSITIONS = ["bottom-right", "bottom-left", "top-right", "top-left"] as const;
export const SEAL_ARRANGEMENTS = ["opposite", "horizontal", "vertical"] as const;

export type SealDesign = (typeof SEAL_DESIGNS)[number];
export type SealColour = keyof typeof SEAL_COLOURS;
export interface SealStyle {
  design: SealDesign;
  colour: SealColour;
  source: (typeof SEAL_SOURCES)[number];
  centre: (typeof SEAL_CENTRES)[number];
  /** Empty means the automatic value. */
  initials: string;
  topText: string;
  bottomText: string;
  poBox: string;
  showDate: boolean;
  qr: (typeof SEAL_QR_MODES)[number];
  position: (typeof SEAL_POSITIONS)[number];
  /** Where a separate QR code sits relative to the seal. */
  arrangement: (typeof SEAL_ARRANGEMENTS)[number];
}
export const DEFAULT_SEAL: SealStyle = {
  design: "rosette", colour: "violet", source: "template", centre: "initials", initials: "", topText: "", bottomText: "",
  poBox: "", showDate: false, qr: "inside", position: "bottom-right", arrangement: "opposite",
};
