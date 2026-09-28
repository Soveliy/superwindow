import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';

interface NotificationsBellProps {
  unreadCount?: number;
}

export const NotificationsBell = ({ unreadCount = 0 }: NotificationsBellProps) => (
  <Link
    to="/notifications"
    className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-ink-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
    aria-label={unreadCount > 0 ? `Уведомления: непрочитанных ${unreadCount}` : 'Уведомления'}
  >
    <Bell className="h-5 w-5" aria-hidden="true" />
    {unreadCount > 0 ? (
      <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-error px-1 text-center text-[9px] font-extrabold leading-4 text-white">
        {unreadCount > 9 ? '9+' : unreadCount}
      </span>
    ) : null}
  </Link>
);

