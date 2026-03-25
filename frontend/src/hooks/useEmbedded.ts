export function useEmbedded(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get("embedded") === "true";
}
