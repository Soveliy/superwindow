import { z } from 'zod';

export const loginSchema = z.object({
  emailOrDealerId: z
    .string()
    .min(3, 'Введите email или ID дилера')
    .max(100, 'Поле слишком длинное'),
  password: z
    .string()
    .min(6, 'Минимум 6 символов')
    .max(100, 'Поле слишком длинное'),
  rememberMe: z.boolean(),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
