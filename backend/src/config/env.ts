import "dotenv/config";

const required = (name: string, fallback?: string): string => process.env[name] || fallback || "";

export const env = {
  port: Number(required("PORT", "5000")),
  jwtSecret: required("JWT_SECRET", "development_only_change_me"),
  jwtExpiresIn: required("JWT_EXPIRES_IN", "1d"),
  geminiKey: process.env.GEMINI_API_KEY?.startsWith("replace_") ? "" : (process.env.GEMINI_API_KEY || ""),
  geminiModel: required("GEMINI_MODEL", "gemini-2.5-flash"),
  fallbackModels: (
    process.env.GEMINI_FALLBACK_MODELS ||
    "gemini-2.5-flash,gemini-2.5-pro,gemini-2.0-flash,gemini-2.5-flash-lite"
  )
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean),
  mockAi: process.env.USE_MOCK_AI === "true",
};

