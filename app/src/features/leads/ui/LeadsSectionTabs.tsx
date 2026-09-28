import { Archive, ClipboardList, Store, Wrench } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/shared/lib/cn';

const items = [
  { to: '/leads', label: 'Витрина', icon: Store, end: true },
  { to: '/leads/my', label: 'Мои лиды', icon: ClipboardList, end: false },
  { to: '/leads/archive', label: 'Архив', icon: Archive, end: false },
  { to: '/work-orders', label: 'Работы', icon: Wrench, end: false },
] as const;

export const LeadsSectionTabs = () => (
  <nav className="mb-4" aria-label="Разделы лидов">
    <ul className="grid grid-cols-4 gap-1 rounded-lg bg-slate-100 p-1">
      {items.map((item) => (
        <li key={item.to}>
          <NavLink
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex min-h-12 flex-col items-center justify-center gap-1 rounded-md px-1 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 sm:flex-row sm:gap-1.5 sm:text-xs',
                isActive ? 'bg-surface text-ink-800 shadow-sm' : 'text-slate-500 hover:text-ink-700',
              )
            }
          >
            <item.icon className="h-4 w-4" aria-hidden="true" />
            {item.label}
          </NavLink>
        </li>
      ))}
    </ul>
  </nav>
);
