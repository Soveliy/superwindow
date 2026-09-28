import type {
  AppNotification,
  LeadDetails,
  WorkOrderDetails,
} from '@/features/leads/model/leads.types';

export interface LeadsDemoState {
  schemaVersion: 1;
  leads: LeadDetails[];
  workOrders: WorkOrderDetails[];
  notifications: AppNotification[];
}

const RUB = 'RUB' as const;

const addMilliseconds = (date: Date, milliseconds: number): string =>
  new Date(date.getTime() + milliseconds).toISOString();

const addHours = (date: Date, hours: number): string =>
  addMilliseconds(date, hours * 60 * 60 * 1_000);

const addDays = (date: Date, days: number): string =>
  addMilliseconds(date, days * 24 * 60 * 60 * 1_000);

const toDateInputValue = (date: Date): string => date.toISOString().slice(0, 10);

const dateAfterDays = (date: Date, days: number): string =>
  toDateInputValue(new Date(date.getTime() + days * 24 * 60 * 60 * 1_000));

const svgDataUrl = (title: string, subtitle: string, accent = '#0b6bcb'): string => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="420" viewBox="0 0 720 420"><rect width="720" height="420" fill="#eef2f6"/><path d="M0 95 720 40M0 300 720 215M110 0l120 420M520 0l-70 420" stroke="#ccd6e1" stroke-width="18"/><path d="M30 350C170 210 260 315 400 170S610 80 700 55" fill="none" stroke="${accent}" stroke-width="9"/><circle cx="400" cy="170" r="20" fill="#e43b3b" stroke="white" stroke-width="7"/><rect x="24" y="24" width="350" height="78" rx="12" fill="white" opacity=".94"/><text x="44" y="56" font-family="Arial" font-size="24" font-weight="700" fill="#102a43">${title}</text><text x="44" y="84" font-family="Arial" font-size="18" fill="#52667a">${subtitle}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const housePreview = svgDataUrl('Фото объекта', 'Частный дом, Курская область', '#25895e');
const kurskMap = svgDataUrl('Курск', 'Район выезда к клиенту');
const deliveryRouteMap = svgDataUrl('Маршрут доставки', 'Склад → ул. Ленина, 46', '#14a66f');
const completionPreview = svgDataUrl('Фотоотчёт', 'Монтаж завершён', '#14a66f');

export const createLeadsMockState = (
  dealerId = 'DEV-0001',
  now = new Date(),
): LeadsDemoState => {
  const leads: LeadDetails[] = [
    {
      id: 'LEAD-8492',
      externalId: '8492-L',
      version: 1,
      status: 'available',
      serviceType: 'measurement',
      title: 'Замена окон в жилом доме',
      product: 'Окна премиум-класса с тройным остеклением',
      region: 'Курская область',
      city: 'Курск',
      budget: { min: 300_000, max: 380_000, currency: RUB },
      publishedAt: addHours(now, -4),
      expiresAt: addHours(now, 44),
      customer: {
        name: 'Иванов Иван',
        phone: '+7 951 123-45-67',
        isMasked: false,
      },
      project: {
        product: 'Окна премиум-класса с тройным остеклением',
        volume: '12 единиц',
        budget: { min: 300_000, max: 380_000, currency: RUB },
      },
      location: {
        region: 'Курская область',
        city: 'Курск',
        address: 'г. Курск, ул. Строителей, д. 15, кв. 42',
        latitude: 51.7305,
        longitude: 36.192,
        mapImageUrl: kurskMap,
      },
      factoryNotes:
        'Клиенту требуются энергоэффективные профильные системы. Установку желательно выполнить до середины октября.',
      attachments: [
        {
          id: 'ATT-8492-1',
          name: 'site_photo_01.jpg',
          url: housePreview,
          thumbnailUrl: housePreview,
          kind: 'image',
          mimeType: 'image/jpeg',
          size: 428_514,
        },
        {
          id: 'ATT-8492-2',
          name: 'План_этажа.pdf',
          url: 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrCg==',
          kind: 'document',
          mimeType: 'application/pdf',
          size: 182_400,
        },
      ],
      createdAt: addHours(now, -4),
      updatedAt: addHours(now, -4),
    },
    {
      id: 'LEAD-8498',
      externalId: '8498-L',
      version: 2,
      status: 'available',
      serviceType: 'installation',
      title: 'Остекление квартиры',
      product: 'Пластиковые окна, профиль 70 мм',
      region: 'Орловская область',
      city: 'Орёл',
      reward: { amount: 7_500, currency: RUB },
      publishedAt: addHours(now, -2),
      expiresAt: addHours(now, 5),
      customer: {
        name: 'Марина Соколова',
        phone: '+7 910 555-03-22',
        isMasked: false,
      },
      project: {
        product: 'Пластиковые окна, профиль 70 мм',
        volume: '5 окон и балконная дверь',
      },
      location: {
        region: 'Орловская область',
        city: 'Орёл',
        address: 'г. Орёл, ул. Октябрьская, д. 33, кв. 18',
        latitude: 52.9685,
        longitude: 36.0692,
        mapImageUrl: svgDataUrl('Орёл', 'Адрес монтажа'),
      },
      factoryNotes: 'Нужен демонтаж старых рам. В доме работает грузовой лифт.',
      attachments: [],
      createdAt: addHours(now, -2),
      updatedAt: addHours(now, -1),
    },
    {
      id: 'LEAD-8501',
      externalId: '8501-L',
      version: 1,
      status: 'available',
      serviceType: 'delivery',
      title: 'Доставка окон на объект',
      product: 'Пластиковые окна',
      region: 'Курская область',
      city: 'Курск',
      reward: { amount: 4_500, currency: RUB },
      publishedAt: addHours(now, -1),
      expiresAt: addHours(now, 23),
      customer: {
        name: 'Алексей Воронов',
        phone: '+7 900 321-44-18',
        isMasked: false,
      },
      project: {
        product: 'Пластиковые окна',
        volume: '8 изделий',
      },
      location: {
        region: 'Курская область',
        city: 'Курск',
        address: 'г. Курск, ул. Ленина, д. 46, кв. 24',
        latitude: 51.735,
        longitude: 36.193,
        mapImageUrl: deliveryRouteMap,
      },
      factoryNotes: 'Получатель просит позвонить за час до доставки.',
      attachments: [],
      createdAt: addHours(now, -1),
      updatedAt: addHours(now, -1),
    },
    {
      id: 'LEAD-8469',
      externalId: '8469-L',
      version: 3,
      status: 'assigned',
      serviceType: 'measurement',
      title: 'Панорамные окна для коттеджа',
      product: 'Панорамное остекление загородного дома',
      region: 'Курская область',
      city: 'Железногорск',
      budget: { min: 550_000, max: 700_000, currency: RUB },
      publishedAt: addDays(now, -1),
      expiresAt: addDays(now, 1),
      customer: {
        name: 'Пётр Николаев',
        phone: '+7 920 201-74-19',
        isMasked: false,
      },
      project: {
        product: 'Панорамное остекление загородного дома',
        volume: '18 конструкций',
        budget: { min: 550_000, max: 700_000, currency: RUB },
      },
      location: {
        region: 'Курская область',
        city: 'Железногорск',
        address: 'Железногорский район, пос. Тепличный, д. 7',
        latitude: 52.331,
        longitude: 35.371,
        mapImageUrl: svgDataUrl('Железногорск', 'Объект замера'),
      },
      factoryNotes: 'Предварительно согласовать время визита по телефону.',
      attachments: [],
      dealerId,
      takenAt: addHours(now, -14),
      scheduleDueAt: addHours(now, 10),
      createdAt: addDays(now, -1),
      updatedAt: addHours(now, -14),
    },
    {
      id: 'LEAD-8455',
      externalId: '8455-L',
      version: 4,
      status: 'in_work',
      serviceType: 'measurement',
      title: 'Замер окон в офисе',
      product: 'Офисные окна, шумоизоляционный стеклопакет',
      region: 'Курская область',
      city: 'Курск',
      budget: { min: 180_000, max: 240_000, currency: RUB },
      publishedAt: addDays(now, -2),
      expiresAt: addDays(now, -1),
      customer: {
        name: 'ООО «Вектор»',
        phone: '+7 4712 55-19-80',
        isMasked: false,
      },
      scheduledVisit: {
        date: dateAfterDays(now, 2),
        timeFrom: '10:00',
        timeTo: '12:00',
      },
      project: {
        product: 'Офисные окна, шумоизоляционный стеклопакет',
        volume: '9 единиц',
        budget: { min: 180_000, max: 240_000, currency: RUB },
      },
      location: {
        region: 'Курская область',
        city: 'Курск',
        address: 'г. Курск, ул. Радищева, д. 22, офис 304',
        latitude: 51.7372,
        longitude: 36.187,
        mapImageUrl: kurskMap,
      },
      attachments: [],
      dealerId,
      takenAt: addDays(now, -1),
      scheduleDueAt: addHours(now, 5),
      createdAt: addDays(now, -2),
      updatedAt: addHours(now, -5),
    },
    {
      id: 'LEAD-8402',
      externalId: '8402-L',
      version: 6,
      status: 'converted',
      serviceType: 'measurement',
      title: 'Окна для загородного дома',
      product: 'Окна ПВХ для коттеджа',
      region: 'Белгородская область',
      city: 'Старый Оскол',
      budget: { min: 420_000, max: 480_000, currency: RUB },
      publishedAt: addDays(now, -12),
      expiresAt: addDays(now, -10),
      customer: {
        name: 'Анна Белова',
        phone: '+7 920 555-21-09',
        isMasked: false,
      },
      scheduledVisit: {
        date: dateAfterDays(now, -8),
        timeFrom: '14:00',
        timeTo: '16:00',
      },
      project: {
        product: 'Окна ПВХ для коттеджа',
        volume: '14 единиц',
        budget: { min: 420_000, max: 480_000, currency: RUB },
      },
      location: {
        region: 'Белгородская область',
        city: 'Старый Оскол',
        address: 'г. Старый Оскол, ул. Сосновая, д. 8',
      },
      attachments: [],
      dealerId,
      takenAt: addDays(now, -11),
      scheduleDueAt: addDays(now, -10),
      convertedAt: addDays(now, -7),
      convertedOrderId: 'ORD-792',
      createdAt: addDays(now, -12),
      updatedAt: addDays(now, -7),
    },
    {
      id: 'LEAD-8377',
      externalId: '8377-L',
      version: 2,
      status: 'expired',
      serviceType: 'installation',
      title: 'Монтаж балконного блока',
      product: 'Балконный блок',
      region: 'Курская область',
      city: 'Курск',
      reward: { amount: 3_200, currency: RUB },
      publishedAt: addDays(now, -15),
      expiresAt: addDays(now, -13),
      customer: {
        name: 'Елена ***',
        phone: '+7 (9**) ***-**-31',
        isMasked: true,
      },
      project: { product: 'Балконный блок', volume: '1 комплект' },
      location: { region: 'Курская область', city: 'Курск' },
      attachments: [],
      dealerId,
      createdAt: addDays(now, -15),
      updatedAt: addDays(now, -13),
    },
  ];

  const workOrders: WorkOrderDetails[] = [
    {
      id: 'WORK-M-123',
      version: 3,
      type: 'installation',
      status: 'in_work',
      displayId: 'М-123',
      leadId: 'LEAD-8421',
      dealerId,
      customer: {
        name: 'Иванов Пётр Сергеевич',
        phone: '+7 999 123-45-67',
        isMasked: false,
      },
      product: 'Окна ПВХ (профиль 70 мм)',
      comment: 'Просьба позвонить за час до приезда.',
      reward: { amount: 4_500, currency: RUB },
      createdAt: addDays(now, -3),
      plannedVisit: {
        date: dateAfterDays(now, 2),
        timeFrom: '10:00',
        timeTo: '14:00',
      },
      destination: {
        region: 'Курская область',
        city: 'Курск',
        address: 'г. Курск, ул. Строителей, д. 15, кв. 42',
        latitude: 51.7305,
        longitude: 36.192,
        mapImageUrl: kurskMap,
      },
      reminder: {
        message: 'Позвонить клиенту за час до приезда',
        minutesBefore: 60,
      },
      photos: [],
      updatedAt: addDays(now, -1),
    },
    {
      id: 'WORK-D-123',
      version: 2,
      type: 'delivery',
      status: 'in_work',
      displayId: 'Д-123',
      leadId: 'LEAD-8430',
      dealerId,
      customer: {
        name: 'Иванов Иван',
        phone: '+7 900 123-45-67',
        isMasked: false,
      },
      product: 'Пластиковые окна',
      comment: 'Подъезд со стороны двора, разгрузка у второго подъезда.',
      reward: { amount: 4_500, currency: RUB },
      createdAt: addDays(now, -2),
      plannedVisit: {
        date: dateAfterDays(now, 3),
        timeFrom: '14:00',
        timeTo: '16:00',
      },
      warehouse: {
        region: 'Курская область',
        city: 'Курск',
        address: 'г. Курск, ул. Складская, д. 12',
        latitude: 51.768,
        longitude: 36.155,
        mapImageUrl: deliveryRouteMap,
      },
      destination: {
        region: 'Курская область',
        city: 'Курск',
        address: 'г. Курск, ул. Ленина, д. 46, кв. 24',
        latitude: 51.735,
        longitude: 36.193,
        mapImageUrl: deliveryRouteMap,
      },
      route: {
        distanceKm: 11.8,
        durationMinutes: 28,
        mapImageUrl: deliveryRouteMap,
      },
      reminder: {
        message: 'Позвонить за час до доставки',
        minutesBefore: 60,
      },
      photos: [],
      updatedAt: addDays(now, -1),
    },
    {
      id: 'WORK-M-118',
      version: 7,
      type: 'installation',
      status: 'done',
      displayId: 'М-118',
      dealerId,
      customer: {
        name: 'Сергей Климов',
        phone: '+7 910 403-18-55',
        isMasked: false,
      },
      product: 'Балконный блок и два окна',
      reward: { amount: 5_200, currency: RUB },
      createdAt: addDays(now, -10),
      plannedVisit: {
        date: dateAfterDays(now, -5),
        timeFrom: '09:00',
        timeTo: '13:00',
      },
      actualDate: dateAfterDays(now, -5),
      destination: {
        region: 'Курская область',
        city: 'Курск',
        address: 'г. Курск, пр-т Победы, д. 18, кв. 75',
      },
      photos: [
        {
          id: 'PHOTO-M-118-1',
          name: 'montage-complete.jpg',
          url: completionPreview,
          thumbnailUrl: completionPreview,
          mimeType: 'image/jpeg',
          size: 612_800,
          createdAt: addDays(now, -5),
        },
      ],
      completedAt: addDays(now, -5),
      updatedAt: addDays(now, -5),
    },
    {
      id: 'WORK-D-115',
      version: 4,
      type: 'delivery',
      status: 'cancelled',
      displayId: 'Д-115',
      dealerId,
      customer: {
        name: 'Ольга Романова',
        phone: '+7 951 770-14-02',
        isMasked: false,
      },
      product: 'Комплект окон для квартиры',
      reward: { amount: 3_800, currency: RUB },
      createdAt: addDays(now, -18),
      plannedVisit: { date: dateAfterDays(now, -14), timeFrom: '12:00', timeTo: '15:00' },
      destination: {
        region: 'Курская область',
        city: 'Курчатов',
        address: 'г. Курчатов, ул. Молодёжная, д. 4',
      },
      photos: [],
      cancellationReason: 'Клиент перенёс доставку через завод.',
      updatedAt: addDays(now, -13),
    },
  ];

  const notifications: AppNotification[] = [
    {
      id: 'NOTIFY-1005',
      type: 'lead_schedule_due',
      title: 'Укажите дату замера',
      message: 'Для лида LEAD-8469 осталось 12 часов на назначение даты.',
      createdAt: addHours(now, -1),
      leadId: 'LEAD-8469',
      deliveries: [
        { channel: 'in_app', status: 'sent', sentAt: addHours(now, -1) },
        { channel: 'push', status: 'sent', sentAt: addHours(now, -1) },
        { channel: 'sms', status: 'sent', sentAt: addHours(now, -1) },
        { channel: 'email', status: 'sent', sentAt: addHours(now, -1) },
      ],
    },
    {
      id: 'NOTIFY-1004',
      type: 'work_order_assigned',
      title: 'Назначена доставка Д-123',
      message: `Доставка запланирована на ${dateAfterDays(now, 3)}, 14:00–16:00.`,
      createdAt: addHours(now, -5),
      workOrderId: 'WORK-D-123',
      deliveries: [
        { channel: 'in_app', status: 'sent', sentAt: addHours(now, -5) },
        { channel: 'push', status: 'sent', sentAt: addHours(now, -5) },
      ],
    },
    {
      id: 'NOTIFY-1003',
      type: 'lead_available',
      title: 'Новый лид в Курске',
      message: 'Доступна заявка на доставку окон с вознаграждением 4 500 ₽.',
      createdAt: addHours(now, -8),
      leadId: 'LEAD-8501',
      deliveries: [
        { channel: 'in_app', status: 'sent', sentAt: addHours(now, -8) },
        { channel: 'push', status: 'sent', sentAt: addHours(now, -8) },
        { channel: 'email', status: 'sent', sentAt: addHours(now, -8) },
      ],
    },
    {
      id: 'NOTIFY-1002',
      type: 'lead_taken',
      title: 'Лид закреплён за вами',
      message: 'Контакт клиента открыт. Назначьте дату в течение 24 часов.',
      createdAt: addHours(now, -14),
      readAt: addHours(now, -12),
      leadId: 'LEAD-8469',
      deliveries: [
        { channel: 'in_app', status: 'sent', sentAt: addHours(now, -14) },
        { channel: 'sms', status: 'sent', sentAt: addHours(now, -14) },
      ],
    },
    {
      id: 'NOTIFY-1001',
      type: 'work_order_completed',
      title: 'Фотоотчёт принят',
      message: 'Работа по заказу М-118 завершена, вознаграждение отправлено на проверку.',
      createdAt: addDays(now, -5),
      readAt: addDays(now, -4),
      workOrderId: 'WORK-M-118',
      deliveries: [
        { channel: 'in_app', status: 'sent', sentAt: addDays(now, -5) },
        { channel: 'push', status: 'sent', sentAt: addDays(now, -5) },
        { channel: 'sms', status: 'sent', sentAt: addDays(now, -5) },
        { channel: 'email', status: 'sent', sentAt: addDays(now, -5) },
      ],
    },
  ];

  return {
    schemaVersion: 1,
    leads,
    workOrders,
    notifications,
  };
};

export const leadsMock = createLeadsMockState();
