import { api } from "./api";
import type { SealFiles } from "./seal";

export interface SealImageFlags { seal: boolean; emblem: boolean }

const read = async (kind: keyof SealFiles) =>
  new Uint8Array(await (await api<Blob>(`/institution/seal-image/${kind}`)).arrayBuffer());

/** Reads whatever the institution has uploaded for its seal. */
export async function loadSealFiles(flags: SealImageFlags): Promise<SealFiles> {
  const [seal, emblem] = await Promise.all([flags.seal ? read("seal") : undefined, flags.emblem ? read("emblem") : undefined]);
  return { ...(seal && { seal }), ...(emblem && { emblem }) };
}
