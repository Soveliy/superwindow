export type OrderStatus = 'ready' | 'in_progress' | 'paid' | 'new';

export interface OrderSummary {
  id: string;
  date: string;
  customer: string;
  status: OrderStatus;
  amount: number | null;
  subtitle: string;
  note: string;
}

export interface OrderItem {
  id: string;
  title: string;
  details: string;
  price: number;
}

export const ordersMock: OrderSummary[] = [
  {
    id: 'ORD-772',
    date: '24 окт. 2023',
    customer: 'Smith Residence',
    status: 'ready',
    amount: 12500,
    subtitle: 'Бригада +2',
    note: 'Оплата получена',
  },
  {
    id: 'ORD-768',
    date: '23 окт. 2023',
    customer: 'Johnson Office',
    status: 'in_progress',
    amount: 8240,
    subtitle: '8 шт. - двойной стеклопакет',
    note: 'В работе',
  },
  {
    id: 'ORD-765',
    date: '22 окт. 2023',
    customer: 'Green Villa',
    status: 'paid',
    amount: 24100,
    subtitle: 'Оплата получена',
    note: 'Оплачен',
  },
  {
    id: 'ORD-780',
    date: '2 часа назад',
    customer: 'Новый расчет',
    status: 'new',
    amount: null,
    subtitle: 'Ожидание расчета',
    note: 'Оценка',
  },
];

export const orderItemsMock: OrderItem[] = [
  {
    id: 'item-1',
    title: 'Двустворчатое окно Премиум',
    details: 'Размер: 1200 x 1400 мм | Профиль: Rehau Delight',
    price: 450,
  },
  {
    id: 'item-2',
    title: 'Москитная сетка (Стандарт)',
    details: 'Совместимо с окном №1 | Цвет: антрацит',
    price: 35,
  },
];

export const orderDetailsMock = {
  orderId: 'ORD-88291',
  code: 'PFT-12500',
  customerName: 'Robert C. Miller',
  packageTitle: 'Премиальный комплект окон (12 шт.)',
  totalAmount: 485,
};
