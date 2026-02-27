import { Calculator, CreditCard, LayoutList, Settings } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/shared/lib/cn';

const tabs = [
  {
    to: '/orders',
    label: 'Заказы',
    icon: LayoutList,
  },
  {
    to: '/calculator',
    label: 'Калькулятор',
    icon: Calculator,
  },
  {
    to: '/payment',
    label: 'Оплата',
    icon: CreditCard,
  },
  {
    to: '/settings',
    label: 'Настройки',
    icon: Settings,
  },
] as const;

export const BottomNav = () => {
  return (
    <nav className="fixed w-full left-0 bottom-0 border-t border-slate-200 bg-surface/95 px-2 pb-2  pt-2 backdrop-blur-sm">
      <ul className="grid grid-cols-4 gap-1">
        {tabs.map((tab) => (
          <li key={tab.to}>
            <NavLink
              to={tab.to}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] font-semibold transition-colors',
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-400 hover:text-brand-500',
                )
              }
            >
              <tab.icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
};
