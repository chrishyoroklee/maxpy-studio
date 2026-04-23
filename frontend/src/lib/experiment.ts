export type PanelOrderVariant = "graph-first" | "code-first";

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

export function getPanelOrderVariant(uid: string | null | undefined): PanelOrderVariant {
  if (!uid) return "graph-first";
  return djb2(uid) % 2 === 0 ? "graph-first" : "code-first";
}
