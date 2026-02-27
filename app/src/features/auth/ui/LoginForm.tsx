import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { loginSchema, type LoginFormValues } from '@/features/auth/model/login.schema';
import { Button } from '@/shared/ui/Button';
import { CheckboxField } from '@/shared/ui/CheckboxField';
import { TextField } from '@/shared/ui/TextField';

interface LoginFormProps {
  isSubmitting: boolean;
  serverError: string | null;
  onSubmit: (values: LoginFormValues) => Promise<void>;
}

export const LoginForm = ({ isSubmitting, serverError, onSubmit }: LoginFormProps) => {
  const [isPasswordVisible, setPasswordVisible] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      emailOrDealerId: '',
      password: '',
      rememberMe: true,
    },
  });

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
      <TextField
        label="Email или ID дилера"
        placeholder="Введите ваш ID"
        autoComplete="username"
        error={errors.emailOrDealerId?.message}
        {...register('emailOrDealerId')}
      />
      <TextField
        label="Пароль"
        placeholder="Введите пароль"
        type={isPasswordVisible ? 'text' : 'password'}
        autoComplete="current-password"
        error={errors.password?.message}
        rightSlot={
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center text-slate-400 transition-colors hover:text-ink-700"
            onClick={() => setPasswordVisible((currentValue) => !currentValue)}
            aria-label={isPasswordVisible ? 'Скрыть пароль' : 'Показать пароль'}
          >
            {isPasswordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        }
        {...register('password')}
      />
      <div className="flex items-center justify-between gap-2">
        <CheckboxField label="Запомнить меня" {...register('rememberMe')} />
        <button type="button" className="text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700">
          Забыли пароль?
        </button>
      </div>
      {serverError ? <p className="rounded-xl border border-error/40 bg-error/10 px-3 py-2 text-sm text-error">{serverError}</p> : null}
      <Button type="submit" loading={isSubmitting}>
        Войти в кабинет
      </Button>
    </form>
  );
};
