export type EmbedMode = "none" | "web" | "m4l";

export function useEmbedded(): boolean {
  return useEmbedMode() !== "none";
}

export function useEmbedMode(): EmbedMode {
  const params = new URLSearchParams(window.location.search);
  const val = params.get("embedded");
  if (val === "m4l") return "m4l";
  if (val === "true" || val === "1") return "web";
  return "none";
}

export function isM4L(): boolean {
  return useEmbedMode() === "m4l";
}
