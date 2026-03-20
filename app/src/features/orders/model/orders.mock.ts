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
  measurementDate: string;
  productionDate: string;
  installationDate: string;
  items: string[];
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
    subtitle: 'Оплата получена',
    note: 'Оплата получена',
    leadTime: 'до 27 окт. 2023',
    code: 'SW-772',
    margin: '22%',
    measurementDate: '20 окт. 2023',
    productionDate: '27 окт. 2023',
    installationDate: '31 окт. 2023',
    items: ['Двухстворчатое окно 1200 x 1400 мм', 'Москитная сетка'],
  },
  {
    id: 'ORD-768',
    date: '23 окт. 2023',
    customer: 'Johnson Office',
    status: 'in_progress',
    amount: 8240,
    subtitle: 'Оплата получена',
    note: 'В работе',
    leadTime: 'до 29 окт. 2023',
    code: 'SW-768',
    margin: '18%',
    measurementDate: '21 окт. 2023',
    productionDate: '29 окт. 2023',
    installationDate: '',
    items: ['8 шт. — двойной стеклопакет'],
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
    measurementDate: '19 окт. 2023',
    productionDate: '30 окт. 2023',
    installationDate: '02 нояб. 2023',
    items: ['Пакет остекления для коттеджа'],
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
    measurementDate: '',
    productionDate: '',
    installationDate: '',
    items: [],
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
