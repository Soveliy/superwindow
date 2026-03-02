import { useEffect, useState } from 'react';
import { Grid2X2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { loginRequest } from '@/features/auth/api/login';
import { authStorage } from '@/features/auth/model/auth-storage';
import { getDevAuthHint, tryDevLogin } from '@/features/auth/model/dev-auth';
import type { LoginFormValues } from '@/features/auth/model/login.schema';
import { LoginForm } from '@/features/auth/ui/LoginForm';
import { HttpError } from '@/shared/api/http-client';

const getErrorMessage = (error: unknown): string => {
  if (error instanceof HttpError) {
    return `Ошибка авторизации (${error.status}). Проверьте доступ к API.`;
  }

  return 'Не удалось выполнить вход. Повторите попытку.';
};

export const LoginPage = () => {
  const navigate = useNavigate();
  const [isSubmitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const devAuthHint = getDevAuthHint();
  const loginImageSrc = `${import.meta.env.BASE_URL}login-image.jpg`;

  useEffect(() => {
    if (authStorage.hasSession()) {
      navigate('/orders', { replace: true });
    }
  }, [navigate]);

  const handleLogin = async (values: LoginFormValues): Promise<void> => {
    setSubmitting(true);
    setServerError(null);

    try {
      const payload = {
        emailOrDealerId: values.emailOrDealerId,
        password: values.password,
      };

      const response =
        tryDevLogin(payload) ??
        (await loginRequest({
          emailOrDealerId: payload.emailOrDealerId,
          password: payload.password,
        }));

      authStorage.saveSession(
        {
          token: response.token || 'temporary-session-token',
          dealerId: response.dealerId ?? values.emailOrDealerId,
          loggedAt: new Date().toISOString(),
        },
        values.rememberMe,
      );

      navigate('/orders', { replace: true });
    } catch (error) {
      setServerError(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-page px-2 py-3">
      <main className="mx-auto w-full max-w-[576px] rounded-[34px] bg-surface shadow-panel">
        <header className="items-center px-4 pb-4 pt-5">
          <h1 className="w-full text-center text-2xl font-bold text-ink-800">Портал дилера</h1>
          <span />
        </header>
        <section className="px-6 pb-7">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-5 inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
              <Grid2X2 className="h-9 w-9"/>
            </div>
            <h2 className="text-4xl font-extrabold tracking-tight text-ink-800">С возвращением</h2>
            <p className="mt-2 text-sm text-slate-500">Войдите, чтобы управлять заказами и оплатами</p>
            {devAuthHint ? (
              <p className="mt-3 rounded-xl bg-brand-50 px-3 py-2 text-xs text-brand-700">
                Тестовый доступ: <b>{devAuthHint.emailOrDealerId}</b> / <b>{devAuthHint.password}</b>
              </p>
            ) : null}
          </div>
          <LoginForm isSubmitting={isSubmitting} serverError={serverError} onSubmit={handleLogin} />
          <p className="mt-7 text-center text-sm text-slate-500">
            Еще не зарегистрированы как дилер?{' '}
            <button type="button" className="font-semibold text-brand-600 transition-colors hover:text-brand-700">
              Связаться с поддержкой
            </button>
          </p>
          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
            <img className="h-full w-full object-cover" src={loginImageSrc} alt="" />
          </div>
        </section>
      </main>
    </div>
  );
};
