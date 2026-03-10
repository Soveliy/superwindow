export type OrderStatus = 'ready' | 'in_progress' | 'paid' | 'new';

export interface OrderSummary {
  id: string;
  date: string;
  customer: string;
  status: OrderStatus;
  amount: number | null;
  subtitle: string;
  note: string;
  leadTime: string;
  code: string;
  margin: string;
}

export interface OrderItem {
  id: string;
  title: string;
  details: string;
  price: number;
}

export type DeliveryMode = 'manual' | 'pickup';

export interface InstallationOrderService {
  type: 'installation';
  discount: number;
}

export interface DeliveryOrderService {
  type: 'delivery';
  mode: DeliveryMode;
  price: number;
}

export type OrderService = InstallationOrderService | DeliveryOrderService;

export const ordersMock: OrderSummary[] = [
  {
    id: 'ORD-772',
    date: '24 окт. 2023',
    customer: 'Smith Residence',
    status: 'ready',
    amount: 12500,
    subtitle: 'Бригада +2',
    note: 'Оплата получена',
    leadTime: 'до 27 окт. 2023',
    code: 'SW-772',
    margin: '22%',
  },
  {
    id: 'ORD-768',
    date: '23 окт. 2023',
    customer: 'Johnson Office',
    status: 'in_progress',
    amount: 8240,
    subtitle: '8 шт. — двойной стеклопакет',
    note: 'В работе',
    leadTime: 'до 29 окт. 2023',
    code: 'SW-768',
    margin: '18%',
  },
  {
    id: 'ORD-765',
    date: '22 окт. 2023',
    customer: 'Green Villa',
    status: 'paid',
    amount: 24100,
    subtitle: 'Оплата получена',
    note: 'Оплачен',
    leadTime: 'до 30 окт. 2023',
    code: 'SW-765',
    margin: '25%',
  },
  {
    id: 'ORD-780',
    date: '2 часа назад',
    customer: 'Новый расчет',
    status: 'new',
    amount: null,
    subtitle: 'Ожидание расчета',
    note: 'Оценка',
    leadTime: 'Срок уточняется',
    code: 'SW-780',
    margin: '—',
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
    title: 'Москитная сетка (стандарт)',
    details: 'Совместимо с окном №1 | Цвет: антрацит',
    price: 35,
  },
];

export const orderDetailsMock = {
  orderId: 'ORD-88291',
  code: 'SW-88291',
  margin: '18%',
  leadTime: 'Срок уточняется',
  customerName: 'Robert C. Miller',
  packageTitle: 'Премиальный комплект окон (12 шт.)',
  totalAmount: 485,
};
