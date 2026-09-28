import { Compass, LayoutList, Settings } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/shared/lib/cn';

const tabs = [
  {
    to: '/orders',
    label: 'Заказы',
    icon: LayoutList,
  },
  {
    to: '/leads',
    label: 'Лиды',
    icon: Compass,
  },
  {
    to: '/settings',
    label: 'Настройки',
    icon: Settings,
  },
] as const;

export const BottomNav = () => {
  const { pathname } = useLocation();

  const isTabActive = (to: string) => {
    if (to === '/leads') {
      return pathname === '/leads' || pathname.startsWith('/leads/') || pathname === '/work-orders' || pathname.startsWith('/work-orders/');
    }
    if (to === '/orders') {
      return pathname === '/' || pathname === '/calculator' || pathname === '/orders' || pathname.startsWith('/orders/');
    }
    return pathname === to || pathname.startsWith(`${to}/`);
  };

  return (
    <nav aria-label="Главная навигация" className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-300 bg-surface/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-sm">
      <ul className="mx-auto grid max-w-[620px] grid-cols-3 gap-1">
        {tabs.map((tab) => (
          <li key={tab.to}>
            <Link
              to={tab.to}
              aria-current={isTabActive(tab.to) ? 'page' : undefined}
              className={cn(
                'flex min-h-12 flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
                isTabActive(tab.to) ? 'bg-brand-100 text-ink-800' : 'text-slate-500 hover:text-ink-800',
              )}
            >
              <tab.icon className="h-5 w-5" aria-hidden="true" />
              <span>{tab.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
};
