import { z } from "zod";

// Docker Compose's `${VAR:-}` substitution sets an env var to an empty
// string when the shell doesn't have it set, rather than omitting the key
// entirely — so a plain `.optional()` string isn't enough to make a var
// truly optional there. This normalizes "" to undefined first.
function optionalString(schema: z.ZodString) {
  return z.preprocess(
    (value) => (value === "" ? undefined : value),
    schema.optional(),
  );
}

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  AUTH_SECRET: z.string().min(32),
  S3_ENDPOINT: optionalString(z.string().url()),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  REDIS_URL: z.string().url(),
  LLM_PROVIDER: z.enum(["anthropic", "openai", "fake"]).default("anthropic"),
  ANTHROPIC_API_KEY: optionalString(z.string().min(1)),
  ANTHROPIC_MODEL: z.string().min(1).default("claude-sonnet-5"),
  LLM_EFFORT: z
    .enum(["low", "medium", "high", "xhigh", "max"])
    .default("high"),
  OPENAI_API_KEY: optionalString(z.string().min(1)),
  OPENAI_MODEL: z.string().min(1).default("gpt-5.4"),
  GENERATION_DAILY_LIMIT: z.coerce.number().int().positive().default(10),
}).superRefine((value, ctx) => {
  if (value.LLM_PROVIDER === "anthropic" && !value.ANTHROPIC_API_KEY) {
    ctx.addIssue({
      code: "custom",
      path: ["ANTHROPIC_API_KEY"],
      message: "ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic",
    });
  }
  if (value.LLM_PROVIDER === "openai" && !value.OPENAI_API_KEY) {
    ctx.addIssue({
      code: "custom",
      path: ["OPENAI_API_KEY"],
      message: "OPENAI_API_KEY is required when LLM_PROVIDER=openai",
    });
  }
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(
  source: Record<string, string | undefined> = process.env,
): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

export const env = loadEnv();
