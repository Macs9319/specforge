import { z } from "zod";

const normalizedEmail = z.string().trim().toLowerCase().email();

export const registerSchema = z.object({
  email: normalizedEmail,
  password: z.string().min(8),
});

export const loginSchema = z.object({
  email: normalizedEmail,
  password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
