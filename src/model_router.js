const SAFE_MODEL_ID = /^[a-zA-Z0-9.-]{2,80}$/;
const DEFAULT_MODELS = {
  simple: "gemini-3.5-flash-lite",
  complex: "gemini-3.8-flash"
};

function configuredModel(value) {
  return typeof value === "string" && SAFE_MODEL_ID.test(value) ? value : null;
}

export function resolveGeminiRoute(env, tier = "complex") {
  const selectedTier = tier === "simple" ? "simple" : "complex";
  const configured = configuredModel(env[`GEMINI_${selectedTier.toUpperCase()}_MODEL`]);
  const legacy = configuredModel(env.GEMINI_MODEL);
  return {
    provider: "gemini",
    tier: selectedTier,
    model: configured || (selectedTier === "complex" && legacy) || DEFAULT_MODELS[selectedTier]
  };
}
