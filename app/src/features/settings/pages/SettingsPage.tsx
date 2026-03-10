import { ArrowLeft, Bell, Building2, ChevronRight, LockKeyhole, LogOut, Moon, Sun, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BottomNav } from '@/app/layout/BottomNav';
import { authStorage } from '@/features/auth/model/auth-storage';
import { type AppTheme, useTheme } from '@/shared/theme/ThemeProvider';
import { Button } from '@/shared/ui/Button';

const menuItems = [
  {
    title: 'Профиль компании',
    icon: Building2,
  },
  {
    title: 'Настройки уведомлений',
    icon: Bell,
  },
  {
    title: 'Безопасность и пароль',
    icon: LockKeyhole,
  },
] as const;

const themeOptions: Array<{ id: AppTheme; label: string; icon: typeof Sun }> = [
  { id: 'dark', label: 'Темная', icon: Moon },
  { id: 'light', label: 'Светлая', icon: Sun },
];

export const SettingsPage = () => {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  const handleLogout = (): void => {
    authStorage.clearSession();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-page px-2 py-3">
      <main className="mx-auto w-full max-w-[576px] rounded-[34px] bg-surface shadow-panel pb-16">
        <section className="flex-1 px-4 pb-5 pt-5">
          <header className="mb-5 grid grid-cols-[40px_1fr_40px] items-center">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-700 transition-colors hover:bg-slate-100"
              onClick={() => navigate('/orders')}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <h1 className="text-center text-2xl font-extrabold tracking-tight text-ink-800">Настройки</h1>
            <span />
          </header>

          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 inline-flex h-16 w-16 items-center justify-center rounded-full bg-slate-200 text-slate-500">
              <UserRound className="h-8 w-8" />
            </div>
            <p className="text-[30px] font-extrabold leading-none tracking-tight text-ink-800">
            Дилерский центр
            </p>
            <p className="mt-1 text-sm text-slate-500">john.dealer@example.com</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-brand-600">ID дилера #88234</p>
          </div>

          <article className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <h2 className="mb-3 text-xl font-extrabold tracking-tight text-ink-800">Логика ценообразования</h2>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Моя маржа, %
              </span>
              <div className="relative">
                <input
                  type="number"
                  defaultValue={25}
                  className="h-12 w-full rounded-xl border border-slate-300 bg-slate-100 px-3 pr-9 text-base font-semibold text-ink-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">%</span>
              </div>
            </label>
            <p className="mt-2 text-xs text-slate-500">
              Этот процент автоматически добавляется к базовой себестоимости для всех расчетов клиентов.
            </p>
            <Button className="mt-4 h-11">Сохранить изменения</Button>
          </article>

          <article className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <h2 className="mb-1 text-xl font-extrabold tracking-tight text-ink-800">Тема интерфейса</h2>
            <p className="text-xs text-slate-500">Выберите режим отображения приложения.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {themeOptions.map((option) => {
                const isActive = option.id === theme;
                const Icon = option.icon;

                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setTheme(option.id)}
                    className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition-colors ${
                      isActive
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-slate-200 bg-slate-100 text-slate-500 hover:border-slate-300 hover:text-ink-700'
                    }`}
                    aria-pressed={isActive}
                  >
                    <Icon className="h-4 w-4" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </article>

          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Данные аккаунта</p>
            <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-slate-50">
              {menuItems.map((item) => (
                <li key={item.title}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-3 text-left transition-colors hover:bg-slate-100"
                  >
                    <span className="inline-flex items-center gap-3">
                      <item.icon className="h-4 w-4 text-brand-600" />
                      <span className="font-medium text-ink-700">{item.title}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <button
            type="button"
            onClick={handleLogout}
            className="mt-7 flex w-full items-center justify-center gap-2 text-lg font-semibold text-error transition-colors hover:text-error/80"
          >
            <LogOut className="h-4 w-4" />
            Выйти
          </button>
          <p className="mt-2 text-center text-xs text-slate-400">Версия 2.4.1 (сборка 882)</p>
        </section>
        <BottomNav />
      </main>
    </div>
  );
};
