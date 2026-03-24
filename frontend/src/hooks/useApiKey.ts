import { useState, useEffect } from "react";

export function useApiKey() {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("claude-sonnet-4-20250514");

  useEffect(() => {
    const saved = sessionStorage.getItem("maxpy-api-key");
    if (saved) setApiKey(saved);
    const savedModel = sessionStorage.getItem("maxpy-model");
    if (savedModel) setModel(savedModel);
  }, []);

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
