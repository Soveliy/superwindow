import { useEffect, useState } from 'react';
import { listNotifications } from '@/features/leads';
import { NotificationsBell } from '@/features/leads/ui/NotificationsBell';

export const UnreadNotificationsAction = () => {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let active = true;

    const refresh = () => {
      void listNotifications()
        .then((items) => {
          if (active) {
            setUnreadCount(items.filter((item) => !item.readAt).length);
          }
        })
        .catch(() => {
          // The page itself remains usable if the notification counter cannot load.
        });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    };

    refresh();
    const intervalId = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return <NotificationsBell unreadCount={unreadCount} />;
};
