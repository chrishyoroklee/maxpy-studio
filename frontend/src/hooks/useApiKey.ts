import { useState } from "react";

export function useApiKey() {
  const [apiKey, setApiKey] = useState(
    () => sessionStorage.getItem("maxpy-api-key") ?? ""
  );
  const [model, setModel] = useState(
    () => sessionStorage.getItem("maxpy-model") ?? "claude-sonnet-4-20250514"
  );

  const saveApiKey = (key: string) => {
    setApiKey(key);
    sessionStorage.setItem("maxpy-api-key", key);
  };

  const saveModel = (m: string) => {
    setModel(m);
    sessionStorage.setItem("maxpy-model", m);
  };

  return { apiKey, setApiKey: saveApiKey, model, setModel: saveModel };
}
