import type { OrderStatus } from '@/features/orders/model/orders.mock';

export interface OrderStatusUi {
  label: string;
  badgeClassName: string;
}

export const orderStatusUi: Record<OrderStatus, OrderStatusUi> = {
  ready: {
    label: 'Готов',
    badgeClassName: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  in_progress: {
    label: 'В работе',
    badgeClassName: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  paid: {
    label: 'Оплачен',
    badgeClassName: 'border-sky-200 bg-sky-50 text-sky-700',
  },
  new: {
    label: 'Новый',
    badgeClassName: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  },
};

export const getOrderStatusUi = (status: OrderStatus | undefined): OrderStatusUi =>
  status ? orderStatusUi[status] : orderStatusUi.new;
