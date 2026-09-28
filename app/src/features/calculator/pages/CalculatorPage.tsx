import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Minus,
  Pencil,
  Percent,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BottomNav } from '@/app/layout/BottomNav';
import {
  type AdditionalOptionType,
  type CalculatorAdditionalOption,
  type CalculatorPosition,
  type CalculatorProductionQuery,
  type CalculatorSashConfig,
  type DripColor,
  type DrainageType,
  type HandleColor,
  type HandleType,
  type MullionOffsets,
  type MullionOrientation,
  type OpeningType,
  type PackageType,
  type SashId,
  type SealColor,
  type SillColor,
  type SillType,
  type WindowColor,
  type WindowColorSide,
  readCalculatorPositions,
  writeCalculatorPositions,
} from '@/features/calculator/model/positions.storage';
import { type OrderService } from '@/features/orders/model/orders.mock';
import { type OrderCustomerForm } from '@/features/orders/model/orders.storage';
import { LOCAL_AJAX_PATHS, postLocalAjaxJson } from '@/shared/api/local-ajax';
import { cn } from '@/shared/lib/cn';
import { formatCurrency } from '@/shared/lib/format';
import { Button } from '@/shared/ui/Button';

type ProfileId = 'rula-58' | 'isotech-58' | 'grunder-60' | 'wintech-70' | 'exprof-arctica' | 'profecta-plus';

interface CalculatorLocationState {
  positionId?: number;
  resetPositions?: boolean;
  readOnly?: boolean;
  returnTo?: string;
  draftForm?: OrderCustomerForm;
  draftServices?: OrderService[];
  draftWindowDiscount?: number;
  sourceLeadId?: string;
  sourceLeadVersion?: number;
}

interface DraftState {
  width: number;
  height: number;
  packageType: PackageType;
  openingType: OpeningType;
  profileId: ProfileId;
  dealerDiscountPercent: number;
  drainage: DrainageType;
  sealColor: SealColor;
  windowColorSide: WindowColorSide;
  windowColor: WindowColor;
  handleType: HandleType;
  handleColor: HandleColor;
  mullionOrientation: MullionOrientation;
  mullionOffsets: MullionOffsets;
  additionalOptions: CalculatorAdditionalOption[];
  sashes: CalculatorSashConfig[];
}

interface OptionFormState {
  type: AdditionalOptionType;
  length: number;
  width: number;
  sillType: SillType;
  sillColor: SillColor;
  dripColor: DripColor;
}

type MullionControlMode = 'drag' | 'input';
type DimensionField = 'width' | 'height';
type DimensionInputState = Record<DimensionField, string>;
type DimensionErrorState = Record<DimensionField, string | null>;
type RemotePriceStatus = 'idle' | 'loading' | 'success' | 'error';
type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeRemotePrice = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace(/\s+/g, '').replace(',', '.'));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  return null;
};

const extractRemotePrice = (response: unknown): number | null => {
  if (!isRecord(response)) {
    return null;
  }

  return normalizeRemotePrice(response.serverPrice) ?? normalizeRemotePrice(response.price) ?? normalizeRemotePrice(response.amount);
};

const hasPayload = (value: unknown): value is { payload: unknown } =>
  value !== null && typeof value === 'object' && 'payload' in value;

const extractRemoteErrorMessage = (value: unknown): string | null => {
  if (hasPayload(value)) {
    return extractRemoteErrorMessage(value.payload);
  }

  if (!isRecord(value)) {
    return null;
  }

  return (
    extractRemoteErrorMessage(value.payload) ??
    extractRemoteErrorMessage(value.responsePayload) ??
    extractRemoteErrorMessage(value.response) ??
    (typeof value.message === 'string' && value.message.trim().length > 0 ? value.message : null)
  );
};

const getRemotePriceErrorMessage = (error: unknown): string =>
  extractRemoteErrorMessage(error) ??
  (error instanceof Error && error.message.trim().length > 0
    ? error.message
    : 'Не удалось получить цену c сервера');

const withBase = (path: string): string => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
const accadoHandleImage = withBase('/handles/accado.png');
const extractOrderIdFromReturnPath = (value: string): string | null => {
  const match = value.match(/^\/orders\/([^/?#]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
};

const profileCatalog = [
  { id: 'rula-58', label: 'Rula 58 мм', description: 'Базовый профиль', pricePerSquare: 3200 },
  { id: 'isotech-58', label: 'Isotech 58 мм', description: 'Надежный вариант', pricePerSquare: 3500 },
  { id: 'grunder-60', label: 'Grunder 60 мм', description: 'Оптимальный баланс', pricePerSquare: 4100 },
  { id: 'wintech-70', label: 'Wintech 70 мм', description: 'Теплый профиль', pricePerSquare: 4700 },
  { id: 'exprof-arctica', label: 'Exprof Arctica', description: 'Для холодных регионов', pricePerSquare: 4900 },
  { id: 'profecta-plus', label: 'Profecta Plus', description: 'Премиальная серия', pricePerSquare: 5600 },
] as const;

const profileLabels = profileCatalog.reduce<Record<ProfileId, string>>((acc, item) => {
  acc[item.id] = item.label;
  return acc;
}, {
  'rula-58': 'Rula 58 мм',
  'isotech-58': 'Isotech 58 мм',
  'grunder-60': 'Grunder 60 мм',
  'wintech-70': 'Wintech 70 мм',
  'exprof-arctica': 'Exprof Arctica',
  'profecta-plus': 'Profecta Plus',
});

const openingTypeOptions: Array<{ id: OpeningType; label: string; factor: number; image: string }> = [
  { id: 'single', label: 'Одностворчатое окно', factor: 1, image: withBase('/windows/9.svg') },
  { id: 'single_turn', label: 'Одностворчатое окно (поворотное)', factor: 1.08, image: withBase('/windows/7.svg') },
  { id: 'double', label: 'Двухстворчатое окно', factor: 1.48, image: withBase('/windows/8.svg') },
  { id: 'double_left_active', label: 'Двухстворчатое окно (активная левая)', factor: 1.56, image: withBase('/windows/5.svg') },
  { id: 'double_right_active', label: 'Двухстворчатое окно (активная правая)', factor: 1.56, image: withBase('/windows/6.svg') },
  { id: 'double_dual_active', label: 'Двухстворчатое окно (две активные)', factor: 1.62, image: withBase('/windows/4.svg') },
  { id: 'triple', label: 'Трехстворчатое окно', factor: 1.93, image: withBase('/windows/3.svg') },
  { id: 'triple_dual_active', label: 'Трехстворчатое окно (две активные)', factor: 2.03, image: withBase('/windows/2.svg') },
  // { id: 'triple_full_active', label: 'Трехстворчатое окно (три активные)', factor: 2.14, image: withBase('/windows/7.svg') },
  // { id: 'balcony', label: 'Балконная дверь', factor: 2.12, image: withBase('/windows/1.svg') },
];

const openingTypeLabels = openingTypeOptions.reduce<Record<OpeningType, string>>((acc, option) => {
  acc[option.id] = option.label;
  return acc;
}, {
  single: 'Одностворчатое окно',
  single_turn: 'Одностворчатое окно (поворотное)',
  double: 'Двухстворчатое окно',
  double_left_active: 'Двухстворчатое окно (активная левая)',
  double_right_active: 'Двухстворчатое окно (активная правая)',
  double_dual_active: 'Двухстворчатое окно (две активные)',
  triple: 'Трехстворчатое окно',
  triple_dual_active: 'Трехстворчатое окно (две активные)',
  triple_full_active: 'Трехстворчатое окно (три активные)',
  balcony: 'Балконная дверь',
  balcony_left_door: 'Балконная дверь (створка слева)',
  balcony_right_door: 'Балконная дверь (створка справа)',
});

const packageOptions: Array<{ id: PackageType; label: string; factor: number }> = [
  { id: 'budget', label: 'Бюджет', factor: 1 },
  { id: 'standard', label: 'Стандарт', factor: 1.12 },
  { id: 'premium', label: 'Премиум', factor: 1.26 },
];

const packageLabels = packageOptions.reduce<Record<PackageType, string>>((acc, option) => {
  acc[option.id] = option.label;
  return acc;
}, { budget: 'Бюджет', standard: 'Стандарт', premium: 'Премиум' });

const sealColorOptions: Array<{ id: SealColor; label: string; extra: number }> = [
  { id: 'black', label: 'Черный', extra: 0 },
  { id: 'gray', label: 'Серый ', extra: 180 },
];

const drainageOptions: Array<{ id: DrainageType; label: string; extra: number }> = [
  { id: 'bottom', label: 'Снизу', extra: 0 },
  { id: 'none', label: 'Нет', extra: 0 },
  { id: 'street', label: 'С улицы', extra: 120 },
];

const sealColorLabels = sealColorOptions.reduce<Record<SealColor, string>>((acc, option) => {
  acc[option.id] = option.label;
  return acc;
}, { black: 'Черный', gray: 'Серый ', white: 'Белый' });

const drainageLabels = drainageOptions.reduce<Record<DrainageType, string>>((acc, option) => {
  acc[option.id] = option.label;
  return acc;
}, { bottom: 'Снизу', none: 'Нет', street: 'С улицы' });

const windowColorSideOptions: Array<{ id: WindowColorSide; label: string }> = [
  { id: 'outside', label: 'Снаружи' },
  { id: 'inside', label: 'Внутри' },
  { id: 'solid', label: 'В массе' },
];

const windowColorOptions: Array<{
  id: WindowColor;
  label: string;
  extra: number;
  swatchClassName: string;
}> = [
  { id: 'white', label: 'Белый', extra: 0, swatchClassName: 'bg-white' },
  { id: 'anthracite', label: 'Антрацит', extra: 600, swatchClassName: 'bg-slate-500' },
  { id: 'golden_oak', label: 'Золотой дуб', extra: 780, swatchClassName: 'bg-amber-400' },
  { id: 'dark_oak', label: 'Темный дуб', extra: 820, swatchClassName: 'bg-amber-950' },
  { id: 'mahogany', label: 'Африканская вишня', extra: 720, swatchClassName: 'bg-orange-800' },
  { id: 'silver', label: 'Кварц серый', extra: 740, swatchClassName: 'bg-gradient-to-br from-slate-100 via-slate-300 to-slate-600' },
];

const windowColorSideLabels = windowColorSideOptions.reduce<Record<WindowColorSide, string>>((acc, option) => {
  acc[option.id] = option.label;
  return acc;
}, { outside: 'Снаружи', inside: 'Внутри', solid: 'В массе' });

const windowColorLabels = windowColorOptions.reduce<Record<WindowColor, string>>((acc, option) => {
  acc[option.id] = option.label;
  return acc;
}, {
  white: 'Белый',
  anthracite: 'Антрацит',
  golden_oak: 'Золотой дуб',
  dark_oak: 'Темный дуб',
  mahogany: 'Африканская вишня',
  silver: 'Кварц серый',
});

const handleTypeOptions: Array<{ id: HandleType; label: string; extra: number }> = [
  { id: 'standard', label: 'ACCADO', extra: 0 },
];

const handleColorOptions: Array<{
  id: HandleColor;
  label: string;
  extra: number;
  swatchClassName: string;
}> = [
  { id: 'white', label: 'Белый', extra: 0, swatchClassName: 'bg-white' },
  { id: 'anthracite', label: 'Антрацит', extra: 0, swatchClassName: 'bg-slate-500' },
  { id: 'brown', label: 'Коричневый', extra: 0, swatchClassName: 'bg-amber-950' },
  { id: 'light_brown', label: 'Светлокоричневый', extra: 0, swatchClassName: 'bg-orange-800' },
  { id: 'black', label: 'Черный', extra: 0, swatchClassName: 'bg-black' },
];
const sillColorOptions: Array<{ id: SillColor; label: string; extra: number }> = [
  { id: 'white', label: 'Белый', extra: 0 },
];
const sillTypeOptions: Array<{ id: SillType; label: string }> = [
  { id: 'fineber', label: 'Fineber' },
];
const SUPPORTED_DRIP_DEPTH = 180;
const dripColorOptions: Array<{ id: DripColor; label: string; swatchClassName: string }> = [
  { id: 'white', label: 'Белый', swatchClassName: 'bg-white' },
  { id: 'brown', label: 'Коричневый', swatchClassName: 'bg-amber-950' },
  { id: 'gray', label: 'Серый ', swatchClassName: 'bg-slate-500' },
];
const sillDepthOptions = Array.from({ length: 11 }, (_, index) => 100 + index * 50);
const dripDepthOptions = [SUPPORTED_DRIP_DEPTH];

const handleTypeLabels = handleTypeOptions.reduce<Record<HandleType, string>>((acc, option) => {
  acc[option.id] = option.label;
  return acc;
}, { standard: 'ACCADO', premium: 'Премиум', design: 'Дизайн' });

const handleColorLabels = handleColorOptions.reduce<Record<HandleColor, string>>((acc, option) => {
  acc[option.id] = option.label;
  return acc;
}, {
  white: 'Белый',
  anthracite: 'Антрацит',
  brown: 'Коричневый',
  light_brown: 'Светлокоричневый',
  black: 'Черный',
});

const productionHandleColorLabels: Record<HandleColor, string> = {
  white: ' БЕЛЫЙ',
  anthracite: 'АНТРАЦИТ',
  brown: 'КОРИЧНЕВЫЙ',
  light_brown: 'СВЕТЛОКОРИЧНЕВЫЙ',
  black: 'ЧЁРНЫЙ',
};

const sillColorLabels = sillColorOptions.reduce<Record<SillColor, string>>((acc, option) => {
  acc[option.id] = option.label;
  return acc;
}, { white: 'Белый', brown: 'Коричневый', anthracite: 'Антрацит' });

const sillTypeLabels = sillTypeOptions.reduce<Record<SillType, string>>((acc, option) => {
  acc[option.id] = option.label;
  return acc;
}, { fineber: 'Fineber', komfort: 'KOMFORT' });
const dripColorLabels = dripColorOptions.reduce<Record<DripColor, string>>((acc, option) => {
  acc[option.id] = option.label;
  return acc;
}, { white: 'Белый', brown: 'Коричневый', gray: 'Серый ' });
const productionWindowColorLabels: Record<WindowColor, string> = {
  white: '  Белый',
  anthracite: '  Белый/Антрацит уль',
  golden_oak: '  Белый/Золотой дуб',
  dark_oak: '  Белый/Темн. дуб',
  mahogany: '  Белый/Африк. вишня',
  silver: '  Белый/Квар. серый',
};
const profectaPlusProductionWindowColorLabels: Partial<Record<WindowColor, string>> = {
  mahogany: '  Белый/Африк. вишня',
};
const laminateProfileIds = new Set<ProfileId>(['grunder-60', 'wintech-70', 'profecta-plus']);
const productionDripColorLabels: Record<DripColor, string> = {
  white: 'Белый',
  brown: 'КОРИЧНЕВЫЙ',
  gray: 'Серый ',
};
const productionDripArticleLabels: Record<number, string> = {
  180: 'ОТЛ. 180 (ш-0,23)',
};
const productionSillTypeArticleLabels: Record<SillType, string> = {
  fineber: 'FineBer',
  komfort: 'KOMFORT',
};

const additionalOptionTypeLabels: Record<AdditionalOptionType, string> = {
  sill: 'Подоконник',
  drip: 'Отлив',
};

const defaultDrainage: DrainageType = 'bottom';
const defaultSealColor: SealColor = 'black';
const defaultWindowColorSide: WindowColorSide = 'outside';
const defaultWindowColor: WindowColor = 'white';
const defaultHandleType: HandleType = 'standard';
const defaultHandleColor: HandleColor = 'white';
const defaultMullionOrientation: MullionOrientation = 'vertical';

const productionTypeIds: Record<OpeningType, number> = {
  single: 344,
  single_turn: 345,
  double: 351,
  double_left_active: 347,
  double_right_active: 346,
  double_dual_active: 352,
  triple: 348,
  triple_dual_active: 353,
  triple_full_active: 348,
  balcony: 349,
  balcony_left_door: 350,
  balcony_right_door: 350,
};

const productionContourCounts: Record<OpeningType, CalculatorProductionQuery['contours'][number]['id']> = {
  single: 1,
  single_turn: 2,
  double: 1,
  double_left_active: 2,
  double_right_active: 2,
  double_dual_active: 3,
  triple: 2,
  triple_dual_active: 3,
  triple_full_active: 3,
  balcony: 2,
  balcony_left_door: 2,
  balcony_right_door: 2,
};

const productionSystemIds: Record<ProfileId, string> = {
  'rula-58': '/_СИСТЕМЫ/1 ОКОННЫЕ СИСТЕМЫ/СИСТЕМЫ 58 мм-60 мм/ RULA 58 мм',
  'isotech-58': '/_СИСТЕМЫ/1 ОКОННЫЕ СИСТЕМЫ/СИСТЕМЫ 58 мм-60 мм/ISOTECH 58',
  'grunder-60': '/_СИСТЕМЫ/1 ОКОННЫЕ СИСТЕМЫ/СИСТЕМЫ 58 мм-60 мм/GRUNDER 60',
  'wintech-70': '/_СИСТЕМЫ/1 ОКОННЫЕ СИСТЕМЫ/СИСТЕМЫ 70 мм-80 мм/ WINTECH 70 КЛАСС А',
  'exprof-arctica': '/_СИСТЕМЫ/1 ОКОННЫЕ СИСТЕМЫ/СИСТЕМЫ 70 мм-80 мм/EXPROF ARCTICA',
  'profecta-plus': '/_СИСТЕМЫ/1 ОКОННЫЕ СИСТЕМЫ/СИСТЕМЫ 70 мм-80 мм/PROFECTA PLUS',
};

const MAX_DEALER_DISCOUNT_PERCENT = 46;
const MOSQUITO_SCREEN_ARTICLE = 'МС';
const MOSQUITO_SCREEN_COLOR = 'Без цвета';

const clampDealerDiscountPercent = (value: number): number =>
  Math.max(0, Math.min(MAX_DEALER_DISCOUNT_PERCENT, Math.trunc(Number.isFinite(value) ? value : 0)));

const calculateCustomerPrice = (serverPrice: number, discountPercent: number): number =>
  Math.max(0, Math.round(serverPrice * (1 - clampDealerDiscountPercent(discountPercent) / 100)));

const calculateDealerProfitAmount = (serverPrice: number, discountPercent: number): number =>
  Math.max(0, Math.round(serverPrice * ((MAX_DEALER_DISCOUNT_PERCENT - clampDealerDiscountPercent(discountPercent)) / 100)));

const buildDealerProfitCode = (profitAmount: number): string => `PRFT-${Math.max(0, Math.round(profitAmount))}`;

const productionDrainageLabels: Record<DrainageType, string> = {
  bottom: 'СНИЗУ',
  none: 'НЕТ',
  street: 'СО СТОРОНЫ УЛИЦЫ',
};

const getProductionAccessoryArticle = (option: CalculatorAdditionalOption): string => {
  const depth = option.type === 'drip' ? SUPPORTED_DRIP_DEPTH : option.width ?? 300;

  if (option.type === 'sill') {
    return `Под ${depth} ${productionSillTypeArticleLabels.fineber}`;
  }

  return productionDripArticleLabels[SUPPORTED_DRIP_DEPTH];
};

const normalizeSupportedAdditionalOptions = (
  options: CalculatorAdditionalOption[] | undefined,
): CalculatorAdditionalOption[] =>
  (options ?? []).map((option) =>
    option.type === 'drip' && option.width !== SUPPORTED_DRIP_DEPTH
      ? { ...option, width: SUPPORTED_DRIP_DEPTH }
      : option,
  );

const productionActiveContourOverrides: Partial<
  Record<OpeningType, Array<CalculatorProductionQuery['contours'][number]['id']>>
> = {
  triple_dual_active: [2],
};

const buildProductionHandleContour = (
  id: CalculatorProductionQuery['contours'][number]['id'],
  handleColor: HandleColor,
): CalculatorProductionQuery['contours'][number] => ({
  id,
  parameters: [
    {
      'ТИП РУЧКИ': '  ОКОННАЯ',
    },
    {
      'ВИД РУЧКИ': 'ACCADO',
    },
    {
      'ЦВЕТ РУЧКИ ACCADO': productionHandleColorLabels[handleColor],
    },
  ],
});

const buildProductionContours = (
  openingType: OpeningType,
  handleColor: HandleColor,
): CalculatorProductionQuery['contours'] => {
  const activeContourIds = productionActiveContourOverrides[openingType];

  if (activeContourIds) {
    return activeContourIds.map((id) => buildProductionHandleContour(id, handleColor));
  }

  return Array.from({ length: productionContourCounts[openingType] }, (_, index) => {
    const id = (index + 1) as CalculatorProductionQuery['contours'][number]['id'];

    if (id === 1) {
      return null;
    }

    return buildProductionHandleContour(id, handleColor);
  }).filter((contour): contour is CalculatorProductionQuery['contours'][number] => contour !== null);
};

const MULLION_STEP = 10;
const MULLION_MIN_SECTION_FALLBACK = 80;
const MULLION_MIN_SECTION_TARGET = 250;
const TWO_SASH_ACTIVE_SECTION_MIN = 450;
const DOUBLE_LEFT_ACTIVE_SECTION_MIN = 350;

const openingTypeMullionCount: Record<OpeningType, 0 | 1 | 2> = {
  single: 0,
  single_turn: 0,
  double: 1,
  double_left_active: 1,
  double_right_active: 1,
  double_dual_active: 1,
  triple: 2,
  triple_dual_active: 2,
  triple_full_active: 2,
  balcony: 1,
  balcony_left_door: 1,
  balcony_right_door: 1,
};

interface SashLayoutItem {
  id: SashId;
  label: string;
  left: number;
  width: number;
}

const singleSashLayout: SashLayoutItem[] = [{ id: 'single', label: 'Створка', left: 12, width: 76 }];
const doubleSashLayout: SashLayoutItem[] = [
  { id: 'left', label: 'Левая', left: 9, width: 39 },
  { id: 'right', label: 'Правая', left: 52, width: 39 },
];
const tripleSashLayout: SashLayoutItem[] = [
  { id: 'left', label: 'Левая', left: 7, width: 27 },
  { id: 'center', label: 'Центр', left: 36.5, width: 27 },
  { id: 'right', label: 'Правая', left: 66, width: 27 },
];

const activeSashIdsByOpeningType: Record<OpeningType, readonly SashId[]> = {
  single: [],
  single_turn: ['single'],
  double: [],
  double_left_active: ['left'],
  double_right_active: ['right'],
  double_dual_active: ['left', 'right'],
  triple: ['center'],
  triple_dual_active: ['left', 'right'],
  triple_full_active: ['left', 'center', 'right'],
  balcony: ['left', 'right'],
  balcony_left_door: ['left'],
  balcony_right_door: ['right'],
};

const getSashLayout = (openingType: OpeningType): SashLayoutItem[] => {
  if (openingType.startsWith('triple')) {
    return tripleSashLayout;
  }

  if (openingType.startsWith('double') || openingType.startsWith('balcony')) {
    return doubleSashLayout;
  }

  return singleSashLayout;
};

const getActiveSashLayout = (openingType: OpeningType): SashLayoutItem[] => {
  const activeSashIds = new Set(activeSashIdsByOpeningType[openingType]);

  return getSashLayout(openingType).filter((sash) => activeSashIds.has(sash.id));
};

const openingTypeHasActiveSashes = (openingType: OpeningType): boolean =>
  activeSashIdsByOpeningType[openingType].length > 0;

const normalizeSashesForOpening = (
  openingType: OpeningType,
  sourceSashes: CalculatorSashConfig[] | undefined,
): CalculatorSashConfig[] => {
  const sourceById = new Map((sourceSashes ?? []).map((sash) => [sash.id, sash]));

  return getActiveSashLayout(openingType).map((layoutItem) => ({
    id: layoutItem.id,
    mosquitoScreenEnabled: sourceById.get(layoutItem.id)?.mosquitoScreenEnabled === true,
  }));
};

const isMullionOrientation = (value: string | undefined): value is MullionOrientation =>
  value === 'vertical' || value === 'horizontal';

const isMullionOffsets = (value: unknown): value is MullionOffsets => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return Object.entries(value).every(
    ([key, item]) => /^\d+$/.test(key) && typeof item === 'number' && Number.isFinite(item) && item >= 0,
  );
};

const getMullionCountByOpeningType = (openingType: OpeningType): 0 | 1 | 2 => openingTypeMullionCount[openingType];
const getMullionAxisSize = (width: number, height: number, orientation: MullionOrientation): number =>
  orientation === 'vertical' ? width : height;
const roundToMullionStep = (value: number): number => Math.round(value / MULLION_STEP) * MULLION_STEP;
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const getMullionMinSectionSize = (axisSize: number, mullionCount: number): number => {
  if (axisSize <= 0 || mullionCount <= 0) {
    return 0;
  }

  const maxAvailablePerSection = Math.floor(axisSize / (mullionCount + 1));
  return Math.max(MULLION_MIN_SECTION_FALLBACK, Math.min(MULLION_MIN_SECTION_TARGET, maxAvailablePerSection));
};

const getMullionSectionMinSizes = (
  openingType: OpeningType | undefined,
  mullionCount: number,
  axisSize: number,
): number[] => {
  const fallbackSize = getMullionMinSectionSize(axisSize, mullionCount);
  const sizes = Array.from({ length: mullionCount + 1 }, () => fallbackSize);

  if (mullionCount !== 1) {
    return sizes;
  }

  if (openingType === 'double_left_active') {
    sizes[0] = DOUBLE_LEFT_ACTIVE_SECTION_MIN;
  }

  if (
    openingType === 'double' ||
    openingType === 'double_right_active' ||
    openingType === 'double_dual_active'
  ) {
    sizes[1] = TWO_SASH_ACTIVE_SECTION_MIN;
  }

  return sizes;
};

const createDefaultMullionOffsets = (mullionCount: number, axisSize: number): MullionOffsets => {
  if (mullionCount <= 0 || axisSize <= 0) {
    return {};
  }

  const offsets: MullionOffsets = {};
  const sectionSize = axisSize / (mullionCount + 1);

  for (let index = 1; index <= mullionCount; index += 1) {
    offsets[String(index)] = roundToMullionStep(sectionSize * index);
  }

  return offsets;
};

const sanitizeMullionOffsets = (
  rawOffsets: MullionOffsets | undefined,
  mullionCount: number,
  axisSize: number,
  openingType?: OpeningType,
): MullionOffsets => {
  if (mullionCount <= 0 || axisSize <= 0) {
    return {};
  }

  const minSectionSizes = getMullionSectionMinSizes(openingType, mullionCount, axisSize);
  const defaults = createDefaultMullionOffsets(mullionCount, axisSize);
  const values: number[] = [];

  for (let index = 1; index <= mullionCount; index += 1) {
    const key = String(index);
    const rawValue = rawOffsets?.[key];
    const fallbackValue = defaults[key] ?? roundToMullionStep((axisSize / (mullionCount + 1)) * index);
    const nextValue = isFiniteNumber(rawValue) ? rawValue : fallbackValue;

    values.push(roundToMullionStep(Math.max(0, Math.min(axisSize, nextValue))));
  }

  let previous = 0;
  for (let index = 0; index < values.length; index += 1) {
    const minOffset = previous + minSectionSizes[index];
    values[index] = Math.max(values[index], minOffset);
    previous = values[index];
  }

  let next = axisSize;
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const maxOffset = next - minSectionSizes[index + 1];
    values[index] = Math.min(values[index], maxOffset);
    next = values[index];
  }

  const normalized: MullionOffsets = {};
  for (let index = 1; index <= mullionCount; index += 1) {
    normalized[String(index)] = roundToMullionStep(Math.max(0, Math.min(axisSize, values[index - 1])));
  }

  return normalized;
};

const areMullionOffsetsEqual = (left: MullionOffsets | undefined, right: MullionOffsets | undefined): boolean => {
  const leftKeys = Object.keys(left ?? {}).sort();
  const rightKeys = Object.keys(right ?? {}).sort();

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  for (let index = 0; index < leftKeys.length; index += 1) {
    const key = leftKeys[index];

    if (key !== rightKeys[index]) {
      return false;
    }

    if ((left?.[key] ?? 0) !== (right?.[key] ?? 0)) {
      return false;
    }
  }

  return true;
};

const getMullionBounds = (
  index: number,
  offsets: MullionOffsets,
  mullionCount: number,
  axisSize: number,
  openingType?: OpeningType,
): { min: number; max: number } => {
  const minSectionSizes = getMullionSectionMinSizes(openingType, mullionCount, axisSize);
  const previousOffset = index > 1 ? offsets[String(index - 1)] ?? 0 : 0;
  const nextOffset = index < mullionCount ? offsets[String(index + 1)] ?? axisSize : axisSize;
  const min = previousOffset + minSectionSizes[index - 1];
  const max = nextOffset - minSectionSizes[index];

  if (min > max) {
    const midpoint = roundToMullionStep((min + max) / 2);
    return { min: midpoint, max: midpoint };
  }

  return { min, max };
};

const DIMENSION_MIN = 500;
const DIMENSION_MAX = 3200;
const clampDimension = (value: number): number => Math.max(DIMENSION_MIN, Math.min(DIMENSION_MAX, value));
const clampOptionLength = (value: number): number => Math.max(300, Math.min(6000, value));
const clampSillLength = (value: number): number => Math.max(1, Math.min(6000, value));

const normalizePositionId = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.trunc(value)) : null;
const isProfileId = (value: string | undefined): value is ProfileId => profileCatalog.some((item) => item.id === value);
const isOpeningType = (value: string | undefined): value is OpeningType =>
  openingTypeOptions.some((item) => item.id === value);
const isSealColor = (value: string | undefined): value is SealColor =>
  sealColorOptions.some((item) => item.id === value);
const isWindowColor = (value: string | undefined): value is WindowColor =>
  windowColorOptions.some((item) => item.id === value);

const isLaminateColorAvailable = (profileId: ProfileId, color: WindowColor): boolean =>
  color === 'white' || laminateProfileIds.has(profileId);

const normalizeWindowColorForProfile = (profileId: ProfileId, color: WindowColor): WindowColor =>
  isLaminateColorAvailable(profileId, color) ? color : 'white';

const getProductionWindowColor = (profileId: ProfileId, color: WindowColor): string => {
  const normalizedColor = normalizeWindowColorForProfile(profileId, color);

  if (profileId === 'profecta-plus') {
    return profectaPlusProductionWindowColorLabels[normalizedColor] ?? productionWindowColorLabels[normalizedColor];
  }

  return productionWindowColorLabels[normalizedColor];
};
const isHandleType = (value: string | undefined): value is HandleType =>
  handleTypeOptions.some((item) => item.id === value);
const isHandleColor = (value: string | undefined): value is HandleColor =>
  handleColorOptions.some((item) => item.id === value);
const getOpeningTypeById = (openingType: OpeningType) =>
  openingTypeOptions.find((item) => item.id === openingType) ?? openingTypeOptions[2];

const formatProductionMeters = (valueMm: number): string => {
  const valueMeters = Math.max(0, valueMm) / 1000;
  const roundedValue = Number(valueMeters.toFixed(3));

  return String(roundedValue).replace('.', ',');
};

const getSashSectionWidths = (
  openingType: OpeningType,
  windowWidth: number,
  mullionOffsets: MullionOffsets,
  mullionOrientation: MullionOrientation,
): Map<SashId, number> => {
  const layout = getSashLayout(openingType);
  const equalSectionWidth = Math.max(1, Math.round(windowWidth / Math.max(1, layout.length)));

  if (layout.length <= 1 || mullionOrientation !== 'vertical') {
    return new Map(layout.map((sash) => [sash.id, layout.length === 1 ? windowWidth : equalSectionWidth]));
  }

  const offsets = Object.values(mullionOffsets)
    .filter((offset) => Number.isFinite(offset) && offset > 0 && offset < windowWidth)
    .sort((a, b) => a - b)
    .slice(0, layout.length - 1);

  if (offsets.length !== layout.length - 1) {
    return new Map(layout.map((sash) => [sash.id, equalSectionWidth]));
  }

  const boundaries = [0, ...offsets, windowWidth];

  return new Map(
    layout.map((sash, index) => [sash.id, Math.max(1, Math.round(boundaries[index + 1] - boundaries[index]))]),
  );
};

const buildProductionMosquitoAccessories = (
  draftState: DraftState,
  mullionOffsets: MullionOffsets,
  startId: number,
): NonNullable<CalculatorProductionQuery['accessories']> => {
  const selectedSashes = draftState.sashes.filter((sash) => sash.mosquitoScreenEnabled);

  if (selectedSashes.length === 0) {
    return [];
  }

  const sectionWidths = getSashSectionWidths(
    draftState.openingType,
    draftState.width,
    mullionOffsets,
    draftState.mullionOrientation,
  );

  return selectedSashes.map((sash, index) => ({
    id: startId + index,
    article: MOSQUITO_SCREEN_ARTICLE,
    color: MOSQUITO_SCREEN_COLOR,
    quantity: '1',
    length: formatProductionMeters(draftState.height),
    width: formatProductionMeters(sectionWidths.get(sash.id) ?? draftState.width),
  }));
};

const buildProductionAccessories = (
  options: CalculatorAdditionalOption[],
  windowWidth: number,
): CalculatorProductionQuery['accessories'] => {
  if (options.length === 0) {
    return undefined;
  }

  return normalizeSupportedAdditionalOptions(options).map((option) => {
    const accessoryColor =
      option.type === 'sill'
        ? sillColorLabels[option.sillColor ?? 'white']
        : productionDripColorLabels[option.dripColor ?? 'white'];

    return {
      id: option.id,
      article: getProductionAccessoryArticle(option),
      color: accessoryColor,
      quantity: '1',
      length: formatProductionMeters(option.type === 'drip' ? windowWidth : option.length ?? 0),
      width: formatProductionMeters(option.type === 'drip' ? SUPPORTED_DRIP_DEPTH : option.width ?? 0),
    };
  });
};

const buildProductionQuery = (
  draftState: DraftState,
  mullionOffsets: MullionOffsets,
): CalculatorProductionQuery => {
  const sortedMullionOffsets = Object.entries(mullionOffsets)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([index, offset]) => ({ [index]: offset }));
  const optionAccessories = buildProductionAccessories(draftState.additionalOptions, draftState.width) ?? [];
  const nextAccessoryId = Math.max(0, ...optionAccessories.map((accessory) => accessory.id)) + 1;
  const mosquitoAccessories = buildProductionMosquitoAccessories(draftState, mullionOffsets, nextAccessoryId);
  const accessories = [...optionAccessories, ...mosquitoAccessories];
  const discount = clampDealerDiscountPercent(draftState.dealerDiscountPercent);

  return {
    type_id: productionTypeIds[draftState.openingType],
    width: draftState.width,
    height: draftState.height,
    system_id: productionSystemIds[draftState.profileId],
    color: getProductionWindowColor(draftState.profileId, draftState.windowColor),
    discount: String(discount),
    mullionOffset: sortedMullionOffsets,
    parameters: {
      sealColor: sealColorLabels[draftState.sealColor],
      drainage: productionDrainageLabels[draftState.drainage],
    },
    contours: buildProductionContours(draftState.openingType, draftState.handleColor),
    ...(accessories.length > 0 ? { accessories } : {}),
  };
};

const getProductionQueryForRequest = (
  productionQuery: CalculatorProductionQuery,
  includeDiscount: boolean,
): CalculatorProductionQuery => {
  if (includeDiscount || !productionQuery.discount) {
    return productionQuery;
  }

  const { discount: _discount, ...queryWithoutDiscount } = productionQuery;
  return queryWithoutDiscount;
};

const buildProductionRequestPayload = (
  productionQuery: CalculatorProductionQuery,
  options?: { includeDiscount?: boolean },
) => {
  const requestQuery = getProductionQueryForRequest(productionQuery, options?.includeDiscount !== false);

  return {
    query: requestQuery,
    productionQuery: requestQuery,
    type_id: requestQuery.type_id,
    width: requestQuery.width,
    height: requestQuery.height,
    system_id: requestQuery.system_id,
    color: requestQuery.color,
    ...(requestQuery.discount ? { discount: requestQuery.discount } : {}),
    mullionOffset: requestQuery.mullionOffset,
    parameters: requestQuery.parameters,
    contours: requestQuery.contours,
    ...(requestQuery.accessories ? { accessories: requestQuery.accessories } : {}),
  };
};

const createDefaultDraft = (): DraftState => ({
  width: 1300,
  height: 1400,
  packageType: 'standard',
  openingType: 'single',
  profileId: 'grunder-60',
  dealerDiscountPercent: 0,
  drainage: defaultDrainage,
  sealColor: defaultSealColor,
  windowColorSide: defaultWindowColorSide,
  windowColor: defaultWindowColor,
  handleType: defaultHandleType,
  handleColor: defaultHandleColor,
  mullionOrientation: defaultMullionOrientation,
  mullionOffsets: {},
  additionalOptions: [],
  sashes: normalizeSashesForOpening('single', []),
});

const createDefaultOptionForm = (windowWidth = 1300): OptionFormState => ({
  type: 'sill',
  length: clampOptionLength(windowWidth),
  width: 300,
  sillType: 'fineber',
  sillColor: 'white',
  dripColor: 'white',
});

const createDraftFromPosition = (position?: CalculatorPosition): DraftState => {
  const defaults = createDefaultDraft();

  if (!position) {
    return defaults;
  }

  const openingType = isOpeningType(position.openingType) ? position.openingType : defaults.openingType;
  const profileId = isProfileId(position.profileId) ? position.profileId : defaults.profileId;
  const windowColor = isWindowColor(position.windowColor) ? position.windowColor : defaults.windowColor;

  return {
    width: clampDimension(position.width ?? defaults.width),
    height: clampDimension(position.height ?? defaults.height),
    packageType: position.packageType ?? defaults.packageType,
    openingType,
    profileId,
    dealerDiscountPercent: clampDealerDiscountPercent(position.dealerDiscountPercent ?? defaults.dealerDiscountPercent),
    drainage: position.drainage ?? defaults.drainage,
    sealColor: isSealColor(position.sealColor) ? position.sealColor : defaults.sealColor,
    windowColorSide: defaults.windowColorSide,
    windowColor: normalizeWindowColorForProfile(profileId, windowColor),
    handleType: isHandleType(position.handleType) ? position.handleType : defaults.handleType,
    handleColor: isHandleColor(position.handleColor) ? position.handleColor : defaults.handleColor,
    mullionOrientation: isMullionOrientation(position.mullionOrientation)
      ? position.mullionOrientation
      : defaults.mullionOrientation,
    mullionOffsets: isMullionOffsets(position.mullionOffsets) ? position.mullionOffsets : defaults.mullionOffsets,
    additionalOptions: normalizeSupportedAdditionalOptions(position.additionalOptions),
    sashes: normalizeSashesForOpening(openingType, position.sashes),
  };
};

const getOptionPrice = (option: CalculatorAdditionalOption, windowWidth = option.length ?? 0): number => {
  const length = option.type === 'drip' ? windowWidth : option.length ?? 0;
  const width = option.width ?? (option.type === 'drip' ? 180 : 0);
  const area = (length * width) / 1_000_000;

  if (option.type === 'sill') {
    const colorExtra = sillColorOptions.find((item) => item.id === option.sillColor)?.extra ?? 0;
    return Math.round(area * 8200 + colorExtra);
  }

  return Math.round(area * 6100);
};

const ChoiceButton = ({
  active,
  className,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) => (
  <button
    disabled={disabled}
    {...props}
    className={cn(
      'flex items-center justify-center gap-1 rounded-lg border px-3 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:hover:border-slate-200',
      active ? 'border-brand-800 bg-brand-50 text-brand-700' : 'border-slate-200 bg-slate-50 hover:border-slate-300',
      disabled ? 'opacity-60' : null,
      className,
    )}
  />
);

export const CalculatorPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as CalculatorLocationState | null;
  const sourceQuery = new URLSearchParams(location.search);
  const queriedSourceLeadVersion = Number(sourceQuery.get('sourceLeadVersion'));
  const sourceLeadId =
    typeof state?.sourceLeadId === 'string' && state.sourceLeadId.trim()
      ? state.sourceLeadId.trim()
      : sourceQuery.get('sourceLeadId')?.trim() || undefined;
  const sourceLeadVersion =
    typeof state?.sourceLeadVersion === 'number' && Number.isFinite(state.sourceLeadVersion)
      ? state.sourceLeadVersion
      : Number.isFinite(queriedSourceLeadVersion) && queriedSourceLeadVersion > 0
        ? queriedSourceLeadVersion
        : undefined;
  const fallbackReturnParams = sourceLeadId
    ? new URLSearchParams({
        sourceLeadId,
        ...(sourceLeadVersion ? { sourceLeadVersion: String(sourceLeadVersion) } : {}),
      })
    : null;
  const returnTo =
    typeof state?.returnTo === 'string' && state.returnTo.length > 0
      ? state.returnTo
      : `/orders/new${fallbackReturnParams ? `?${fallbackReturnParams.toString()}` : ''}`;
  const isReadOnly = state?.readOnly === true;
  const linkedOrderId = extractOrderIdFromReturnPath(returnTo);
  const requestedPositionId = normalizePositionId(state?.positionId);
  const [positions, setPositions] = useState<CalculatorPosition[]>([]);
  const [positionId, setPositionId] = useState(requestedPositionId ?? 1);
  const [draft, setDraft] = useState<DraftState>(() => createDefaultDraft());
  const [dimensionInput, setDimensionInput] = useState<DimensionInputState>(() => ({
    width: '1300',
    height: '1400',
  }));
  const [dimensionError, setDimensionError] = useState<DimensionErrorState>({
    width: null,
    height: null,
  });
  const [isOptionDialogOpen, setOptionDialogOpen] = useState(false);
  const [editingOptionId, setEditingOptionId] = useState<number | null>(null);
  const [optionForm, setOptionForm] = useState<OptionFormState>(() => createDefaultOptionForm());
  const [mullionControlMode] = useState<MullionControlMode>('drag');
  const [activeMullionId, setActiveMullionId] = useState<number | null>(null);
  const [remotePrice, setRemotePrice] = useState<number | null>(null);
  const [remotePriceStatus, setRemotePriceStatus] = useState<RemotePriceStatus>('idle');
  const [remotePriceError, setRemotePriceError] = useState<string | null>(null);
  const [isSaving, setSaving] = useState(false);
  const mullionPreviewRef = useRef<HTMLDivElement | null>(null);
  const mullionDragStateRef = useRef<{ pointerId: number; index: number } | null>(null);
  const priceRequestSequenceRef = useRef(0);

  const buildReturnState = (nextPositions?: CalculatorPosition[]) => ({
    ...(!isReadOnly ? { calculatorPositions: nextPositions } : {}),
    draftForm: state?.draftForm,
    draftServices: state?.draftServices,
    draftWindowDiscount: state?.draftWindowDiscount,
    sourceLeadId,
    sourceLeadVersion,
  });

  useEffect(() => {
    const storedPositions = state?.resetPositions ? [] : readCalculatorPositions();
    const nextPositionId =
      requestedPositionId ?? (storedPositions.length > 0 ? Math.max(...storedPositions.map((item) => item.id)) + 1 : 1);
    const currentPosition = storedPositions.find((item) => item.id === nextPositionId);
    const nextDraft = createDraftFromPosition(currentPosition);

    setPositions(storedPositions);
    setPositionId(nextPositionId);
    setDraft(nextDraft);
    setDimensionInput({
      width: String(nextDraft.width),
      height: String(nextDraft.height),
    });
    setDimensionError({
      width: null,
      height: null,
    });
  }, [location.key, requestedPositionId, state?.resetPositions]);

  useEffect(() => {
    setDraft((value) => {
      const nextMullionCount = getMullionCountByOpeningType(value.openingType);
      const nextAxisSize = getMullionAxisSize(value.width, value.height, value.mullionOrientation);
      const nextOffsets = sanitizeMullionOffsets(value.mullionOffsets, nextMullionCount, nextAxisSize, value.openingType);

      if (areMullionOffsetsEqual(value.mullionOffsets, nextOffsets)) {
        return value;
      }

      return {
        ...value,
        mullionOffsets: nextOffsets,
      };
    });
  }, [draft.height, draft.mullionOrientation, draft.openingType, draft.width]);

  const currentOpening = getOpeningTypeById(draft.openingType);
  const currentHandleColor = handleColorOptions.find((item) => item.id === draft.handleColor) ?? handleColorOptions[0];
  const sashLayout = useMemo(() => getActiveSashLayout(draft.openingType), [draft.openingType]);
  const hasActiveSashes = sashLayout.length > 0;
  const availableWindowColorOptions = useMemo(
    () => windowColorOptions.filter((item) => isLaminateColorAvailable(draft.profileId, item.id)),
    [draft.profileId],
  );
  const selectedMosquitoScreens = useMemo(
    () => draft.sashes.filter((sash) => sash.mosquitoScreenEnabled).map((sash) => sash.id),
    [draft.sashes],
  );
  const mullionCount = getMullionCountByOpeningType(draft.openingType);
  const mullionAxisSize = getMullionAxisSize(draft.width, draft.height, draft.mullionOrientation);

  const normalizedMullionOffsets = useMemo(
    () => sanitizeMullionOffsets(draft.mullionOffsets, mullionCount, mullionAxisSize, draft.openingType),
    [draft.mullionOffsets, draft.openingType, mullionAxisSize, mullionCount],
  );

  const mullionSegments = useMemo(() => {
    if (mullionCount <= 0) {
      return [mullionAxisSize];
    }

    const segments: number[] = [];
    let previous = 0;

    for (let index = 1; index <= mullionCount; index += 1) {
      const offset = normalizedMullionOffsets[String(index)] ?? previous;
      segments.push(Math.max(0, offset - previous));
      previous = offset;
    }

    segments.push(Math.max(0, mullionAxisSize - previous));
    return segments;
  }, [mullionAxisSize, mullionCount, normalizedMullionOffsets]);

  const mullionFirstPartLabel = draft.mullionOrientation === 'vertical' ? 'Левая часть, мм' : 'Нижняя часть, мм';
  const mullionSecondPartLabel = draft.mullionOrientation === 'vertical' ? 'Правая часть, мм' : 'Верхняя часть, мм';
  const mullionFromEdgeLabel = draft.mullionOrientation === 'vertical' ? 'от левого края' : 'от нижнего края';

  const calculateDraftPrice = (draftState: DraftState): number => {
    const area = (draftState.width * draftState.height) / 1_000_000;
    const profile = profileCatalog.find((item) => item.id === draftState.profileId) ?? profileCatalog[2];
    const opening = getOpeningTypeById(draftState.openingType);
    const packageOption = packageOptions.find((item) => item.id === draftState.packageType) ?? packageOptions[1];
    const sealExtra = sealColorOptions.find((item) => item.id === draftState.sealColor)?.extra ?? 0;
    const drainageExtra = drainageOptions.find((item) => item.id === draftState.drainage)?.extra ?? 0;
    const effectiveWindowColor = normalizeWindowColorForProfile(draftState.profileId, draftState.windowColor);
    const windowColorExtra = windowColorOptions.find((item) => item.id === effectiveWindowColor)?.extra ?? 0;
    const handleTypeExtra = handleTypeOptions.find((item) => item.id === draftState.handleType)?.extra ?? 0;
    const handleColorExtra = handleColorOptions.find((item) => item.id === draftState.handleColor)?.extra ?? 0;
    const optionPrice = draftState.additionalOptions.reduce(
      (total, option) => total + getOptionPrice(option, draftState.width),
      0,
    );

    return Math.round(
      (area * profile.pricePerSquare * opening.factor +
        sealExtra +
        drainageExtra +
        windowColorExtra +
        handleTypeExtra +
        handleColorExtra +
        optionPrice) *
        packageOption.factor,
    );
  };

  const currentProductionQuery = useMemo(
    () => buildProductionQuery(draft, normalizedMullionOffsets),
    [draft, normalizedMullionOffsets],
  );
  const displayPrice = remotePrice ?? (remotePriceStatus === 'error' ? calculateDraftPrice(draft) : null);
  const customerPrice = displayPrice === null ? null : calculateCustomerPrice(displayPrice, draft.dealerDiscountPercent);
  const dealerProfitAmount = displayPrice === null ? 0 : calculateDealerProfitAmount(displayPrice, draft.dealerDiscountPercent);
  const dealerProfitCode = buildDealerProfitCode(dealerProfitAmount);
  const totalPriceLabel =
    customerPrice === null ? '—' : formatCurrency(customerPrice, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const serverPriceLabel =
    displayPrice === null ? '—' : formatCurrency(displayPrice, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  useEffect(() => {
    const requestId = priceRequestSequenceRef.current + 1;
    priceRequestSequenceRef.current = requestId;
    let isActive = true;

    setRemotePrice(null);
    setRemotePriceStatus('loading');
    setRemotePriceError(null);

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          const priceResponse = await postLocalAjaxJson<unknown>({
            label: 'product_price',
            path: LOCAL_AJAX_PATHS.getProductPrice,
            payload: {
              source: 'calculator',
              action: 'product_price',
              positionId,
              ...buildProductionRequestPayload(currentProductionQuery),
            },
          });

          if (!isActive || priceRequestSequenceRef.current !== requestId) {
            return;
          }

          const nextRemotePrice = extractRemotePrice(priceResponse);

          if (nextRemotePrice === null) {
            throw new Error('В ответе InviteCraft нет цены');
          }

          setRemotePrice(nextRemotePrice);
          setRemotePriceStatus('success');
          setRemotePriceError(null);
        } catch (error: unknown) {
          if (!isActive || priceRequestSequenceRef.current !== requestId) {
            return;
          }

          setRemotePrice(null);
          setRemotePriceStatus('error');
          setRemotePriceError(getRemotePriceErrorMessage(error));
        }
      })();
    }, 450);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [currentProductionQuery, positionId]);

  const openAddOptionDialog = (): void => {
    setEditingOptionId(null);
    setOptionForm(createDefaultOptionForm(draft.width));
    setOptionDialogOpen(true);
  };

  const openEditOptionDialog = (option: CalculatorAdditionalOption): void => {
    setEditingOptionId(option.id);
    setOptionForm({
      type: option.type,
      length: option.length ?? draft.width,
      width: option.width ?? (option.type === 'drip' ? 180 : 300),
      sillType: 'fineber',
      sillColor: 'white',
      dripColor: option.dripColor ?? 'white',
    });
    setOptionDialogOpen(true);
  };

  const saveOption = (): void => {
    const nextOption: CalculatorAdditionalOption = {
      id:
        editingOptionId ??
        (draft.additionalOptions.length > 0 ? Math.max(...draft.additionalOptions.map((item) => item.id)) + 1 : 1),
      type: optionForm.type,
      length: optionForm.type === 'sill' ? clampSillLength(optionForm.length || draft.width) : clampOptionLength(draft.width),
      width: optionForm.width,
      sillType: optionForm.type === 'sill' ? 'fineber' : undefined,
      sillColor: optionForm.type === 'sill' ? 'white' : undefined,
      dripColor: optionForm.type === 'drip' ? optionForm.dripColor : undefined,
    };

    setDraft((value) => ({
      ...value,
      additionalOptions: [...value.additionalOptions.filter((item) => item.id !== nextOption.id), nextOption].sort(
        (first, second) => first.id - second.id,
      ),
    }));
    setOptionDialogOpen(false);
  };

  const removeOption = (optionId: number): void => {
    setDraft((value) => ({
      ...value,
      additionalOptions: value.additionalOptions.filter((item) => item.id !== optionId),
    }));

    if (editingOptionId === optionId) {
      setOptionDialogOpen(false);
    }
  };

  const validateDimensionInput = (rawValue: string): { value: number | null; error: string | null } => {
    if (rawValue.length === 0) {
      return { value: null, error: 'Введите значение' };
    }

    const parsedValue = Number.parseInt(rawValue, 10);

    if (!Number.isFinite(parsedValue)) {
      return { value: null, error: 'Введите значение' };
    }

    if (parsedValue < DIMENSION_MIN) {
      return { value: null, error: `Минимум ${DIMENSION_MIN} мм` };
    }

    if (parsedValue > DIMENSION_MAX) {
      return { value: null, error: `Максимум ${DIMENSION_MAX} мм` };
    }

    return { value: parsedValue, error: null };
  };

  const applyDimensionValue = (field: DimensionField, nextValue: number): void => {
    setDraft((value) => ({
      ...value,
      [field]: nextValue,
    }));
    setDimensionInput((value) => ({
      ...value,
      [field]: String(nextValue),
    }));
    setDimensionError((value) => ({
      ...value,
      [field]: null,
    }));
  };

  const handleDimensionInputChange = (field: DimensionField, rawValue: string): void => {
    const digitsOnly = rawValue.replace(/\D/g, '');

    setDimensionInput((value) => ({
      ...value,
      [field]: digitsOnly,
    }));
    setDimensionError((value) => ({
      ...value,
      [field]: null,
    }));
  };

  const handleDimensionInputKeyDown = (field: DimensionField, event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();

    const validation = validateDimensionInput(dimensionInput[field]);

    if (validation.error || validation.value === null) {
      setDimensionError((value) => ({
        ...value,
        [field]: validation.error,
      }));
      return;
    }

    applyDimensionValue(field, validation.value);
  };

  const adjustDimension = (field: DimensionField, delta: number): void => {
    const inputValue = Number.parseInt(dimensionInput[field], 10);
    const fallbackValue = field === 'width' ? draft.width : draft.height;
    const baseValue = Number.isFinite(inputValue) ? inputValue : fallbackValue;

    applyDimensionValue(field, clampDimension(baseValue + delta));
  };

  const setDealerDiscountPercent = (nextValue: number): void => {
    setDraft((value) => ({
      ...value,
      dealerDiscountPercent: clampDealerDiscountPercent(nextValue),
    }));
  };

  const adjustDealerDiscountPercent = (delta: number): void => {
    setDealerDiscountPercent(draft.dealerDiscountPercent + delta);
  };

  const toggleMosquitoScreen = (sashId: SashId): void => {
    setDraft((value) => ({
      ...value,
      sashes: normalizeSashesForOpening(value.openingType, value.sashes).map((sash) =>
        sash.id === sashId ? { ...sash, mosquitoScreenEnabled: !sash.mosquitoScreenEnabled } : sash,
      ),
    }));
  };

  const setMullionOffset = (mullionIndex: number, nextOffset: number): void => {
    if (!Number.isFinite(nextOffset)) {
      return;
    }

    setDraft((value) => {
      const nextMullionCount = getMullionCountByOpeningType(value.openingType);
      const nextAxisSize = getMullionAxisSize(value.width, value.height, value.mullionOrientation);
      const offsets = sanitizeMullionOffsets(value.mullionOffsets, nextMullionCount, nextAxisSize, value.openingType);
      const bounds = getMullionBounds(mullionIndex, offsets, nextMullionCount, nextAxisSize, value.openingType);
      const normalizedOffset = roundToMullionStep(Math.max(bounds.min, Math.min(bounds.max, nextOffset)));
      const nextOffsets = sanitizeMullionOffsets(
        {
          ...offsets,
          [String(mullionIndex)]: normalizedOffset,
        },
        nextMullionCount,
        nextAxisSize,
        value.openingType,
      );

      if (areMullionOffsetsEqual(value.mullionOffsets, nextOffsets)) {
        return value;
      }

      return {
        ...value,
        mullionOffsets: nextOffsets,
      };
    });
  };

  const normalizeNumericInput = (value: string): string => value.replace(/\D/g, '');

  const commitMullionStartInput = (mullionIndex: number, input: HTMLInputElement, fallbackOffset: number): void => {
    const digits = normalizeNumericInput(input.value);

    if (!digits) {
      input.value = String(fallbackOffset);
      return;
    }

    const parsed = Number.parseInt(digits, 10);

    if (!Number.isFinite(parsed)) {
      input.value = String(fallbackOffset);
      return;
    }

    setMullionOffset(mullionIndex, parsed);
  };

  const commitMullionReverseInput = (
    mullionIndex: number,
    input: HTMLInputElement,
    fallbackReverseOffset: number,
  ): void => {
    const digits = normalizeNumericInput(input.value);

    if (!digits) {
      input.value = String(fallbackReverseOffset);
      return;
    }

    const parsed = Number.parseInt(digits, 10);

    if (!Number.isFinite(parsed)) {
      input.value = String(fallbackReverseOffset);
      return;
    }

    setMullionOffset(mullionIndex, mullionAxisSize - parsed);
  };

  const updateMullionFromPoint = (event: ReactPointerEvent<HTMLButtonElement>, mullionIndex: number): void => {
    const container = mullionPreviewRef.current;

    if (!container || mullionAxisSize <= 0) {
      return;
    }

    const rect = container.getBoundingClientRect();
    const ratio =
      draft.mullionOrientation === 'vertical'
        ? (event.clientX - rect.left) / rect.width
        : (rect.bottom - event.clientY) / rect.height;
    const rawOffset = ratio * mullionAxisSize;

    setMullionOffset(mullionIndex, rawOffset);
  };

  const handleMullionPointerDown = (event: ReactPointerEvent<HTMLButtonElement>, mullionIndex: number): void => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    mullionDragStateRef.current = { pointerId: event.pointerId, index: mullionIndex };
    setActiveMullionId(mullionIndex);
    updateMullionFromPoint(event, mullionIndex);
  };

  const handleMullionPointerMove = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const dragState = mullionDragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    updateMullionFromPoint(event, dragState.index);
  };

  const handleMullionPointerEnd = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const dragState = mullionDragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    mullionDragStateRef.current = null;
    setActiveMullionId(null);
  };

  const save = async (): Promise<void> => {
    if (isSaving) {
      return;
    }

    const widthValidation = validateDimensionInput(dimensionInput.width);
    const heightValidation = validateDimensionInput(dimensionInput.height);

    setDimensionError({
      width: widthValidation.error,
      height: heightValidation.error,
    });

    if (widthValidation.value === null || heightValidation.value === null) {
      return;
    }

    const nextDraft: DraftState = {
      ...draft,
      width: widthValidation.value,
      height: heightValidation.value,
      dealerDiscountPercent: clampDealerDiscountPercent(draft.dealerDiscountPercent),
      additionalOptions: normalizeSupportedAdditionalOptions(draft.additionalOptions),
      sashes: normalizeSashesForOpening(draft.openingType, draft.sashes),
    };
    const nextMullionCount = getMullionCountByOpeningType(nextDraft.openingType);
    const nextMullionAxisSize = getMullionAxisSize(nextDraft.width, nextDraft.height, nextDraft.mullionOrientation);
    const nextMullionOffsets = sanitizeMullionOffsets(
      nextDraft.mullionOffsets,
      nextMullionCount,
      nextMullionAxisSize,
      nextDraft.openingType,
    );
    const productionQuery = buildProductionQuery(nextDraft, nextMullionOffsets);

    setSaving(true);
    setRemotePriceStatus('loading');
    setRemotePriceError(null);

    try {
      const nextServerPrice = remotePrice ?? calculateDraftPrice(nextDraft);
      const nextCustomerPrice = calculateCustomerPrice(nextServerPrice, nextDraft.dealerDiscountPercent);
      const nextDealerProfitAmount = calculateDealerProfitAmount(nextServerPrice, nextDraft.dealerDiscountPercent);
      const nextDealerProfitCode = buildDealerProfitCode(nextDealerProfitAmount);
      const nextHasActiveSashes = openingTypeHasActiveSashes(nextDraft.openingType);
      const nextMosquitoScreens = nextDraft.sashes.filter((sash) => sash.mosquitoScreenEnabled).map((sash) => sash.id);
    const existingPosition = positions.find((item) => item.id === positionId);
    const nextPosition: CalculatorPosition = {
      ...(existingPosition ?? { id: positionId }),
      id: positionId,
      width: nextDraft.width,
      height: nextDraft.height,
      price: nextCustomerPrice,
      serverPrice: nextServerPrice,
      customerPrice: nextCustomerPrice,
      dealerDiscountPercent: nextDraft.dealerDiscountPercent,
      dealerProfitAmount: nextDealerProfitAmount,
      dealerProfitCode: nextDealerProfitCode,
      packageType: nextDraft.packageType,
      openingType: nextDraft.openingType,
      profileId: nextDraft.profileId,
      drainage: nextDraft.drainage,
      sealColor: nextDraft.sealColor,
      windowColorSide: nextDraft.windowColorSide,
      windowColor: nextDraft.windowColor,
      handleType: nextHasActiveSashes ? nextDraft.handleType : undefined,
      handleColor: nextHasActiveSashes ? nextDraft.handleColor : undefined,
      mullionOrientation: nextDraft.mullionOrientation,
      mullionOffsets: nextMullionOffsets,
      additionalOptions: nextDraft.additionalOptions,
      sashes: nextDraft.sashes,
      productionQuery,
    };
    const nextPositions = [...positions.filter((item) => item.id !== positionId), nextPosition].sort((a, b) => a.id - b.id);
    const additionalOptionLabels = nextDraft.additionalOptions.map((option) => ({
      id: option.id,
      type: option.type,
      typeLabel: additionalOptionTypeLabels[option.type],
      length: option.length ?? 0,
      width: option.width ?? (option.type === 'drip' ? 180 : 0),
      sillType: option.type === 'sill' ? 'fineber' : null,
      sillTypeLabel: option.type === 'sill' ? sillTypeLabels.fineber : null,
      sillColor: option.sillColor ?? null,
      sillColorLabel: option.sillColor ? sillColorLabels[option.sillColor] : null,
      dripColor: option.dripColor ?? null,
      dripColorLabel: option.dripColor ? dripColorLabels[option.dripColor] : null,
    }));
    const mullionList = Object.entries(nextMullionOffsets)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([index, offset]) => {
        const leftMm = offset;
        const rightMm = Math.max(0, nextMullionAxisSize - offset);
        return {
          index: Number(index),
          leftMm,
          rightMm,
          leftPartMm: leftMm,
          rightPartMm: rightMm,
          leftLabel: `Левая часть: ${leftMm} мм`,
          rightLabel: `Правая часть: ${rightMm} мм`,
        };
      });
    const mosquitoScreenLabels = nextMosquitoScreens.map((sashId) => {
      const layoutItem = getSashLayout(nextDraft.openingType).find((item) => item.id === sashId);
      return layoutItem ? `Москитная сетка: ${layoutItem.label}` : `Москитная сетка: ${sashId}`;
    });

    const labels = {
      openingTypeLabel: openingTypeLabels[nextDraft.openingType],
      profileLabel: profileLabels[nextDraft.profileId],
      packageLabel: packageLabels[nextDraft.packageType],
      serverPriceLabel: formatCurrency(nextServerPrice, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      customerPriceLabel: formatCurrency(nextCustomerPrice, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      dealerDiscountPercentLabel: `${nextDraft.dealerDiscountPercent}%`,
      dealerProfitLabel: formatCurrency(nextDealerProfitAmount),
      dealerProfitCode: nextDealerProfitCode,
      sealColorLabel: sealColorLabels[nextDraft.sealColor],
      drainageLabel: drainageLabels[nextDraft.drainage],
      windowColorSideLabel: windowColorSideLabels[nextDraft.windowColorSide],
      windowColorLabel: windowColorLabels[nextDraft.windowColor],
      handleTypeLabel: nextHasActiveSashes ? handleTypeLabels[nextDraft.handleType] : '',
      handleColorLabel: nextHasActiveSashes ? handleColorLabels[nextDraft.handleColor] : '',
      mullionOrientationLabel: nextDraft.mullionOrientation === 'vertical' ? 'Вертикальные импосты' : 'Горизонтальные импосты',
      mullionOffsetsLabel: mullionList.length
        ? mullionList.map((item) => `Импост ${item.index}: ${item.leftMm} мм / ${item.rightMm} мм`)
        : [],
      mosquitoScreensLabel: mosquitoScreenLabels,
      additionalOptions: additionalOptionLabels,
    };
    const values = {
      positionId,
      widthMm: nextDraft.width,
      heightMm: nextDraft.height,
      totalPrice: nextCustomerPrice,
      serverPrice: nextServerPrice,
      customerPrice: nextCustomerPrice,
      dealerDiscountPercent: nextDraft.dealerDiscountPercent,
      dealerProfitAmount: nextDealerProfitAmount,
      dealerProfitCode: nextDealerProfitCode,
      openingType: nextDraft.openingType,
      profileId: nextDraft.profileId,
      packageType: nextDraft.packageType,
      sealColor: nextDraft.sealColor,
      drainage: nextDraft.drainage,
      windowColorSide: nextDraft.windowColorSide,
      windowColor: nextDraft.windowColor,
      handleType: nextHasActiveSashes ? nextDraft.handleType : null,
      handleColor: nextHasActiveSashes ? nextDraft.handleColor : null,
      mullionOrientation: nextDraft.mullionOrientation,
      mullionOffsets: nextMullionOffsets,
      mullions: mullionList,
      sashes: nextDraft.sashes,
      mosquitoScreens: nextMosquitoScreens,
      productionQuery,
      query: productionQuery,
      additionalOptions: nextDraft.additionalOptions.map((option) => ({
        id: option.id,
        type: option.type,
        length: option.length ?? 0,
        width: option.width ?? (option.type === 'drip' ? 180 : 0),
        sillType: option.type === 'sill' ? 'fineber' : null,
        sillColor: option.sillColor ?? null,
        dripColor: option.dripColor ?? null,
      })),
      rawDraft: nextDraft,
      rawPosition: nextPosition,
      rawPositions: nextPositions,
    };

    const addProductResponse = await postLocalAjaxJson<unknown>({
      label: 'product_add',
      path: LOCAL_AJAX_PATHS.addProduct,
      payload: {
        source: 'calculator',
        action: 'product_add',
        orderId: linkedOrderId,
        positionId,
        ...buildProductionRequestPayload(productionQuery),
        dimensions: {
          widthMm: nextDraft.width,
          heightMm: nextDraft.height,
          label: `${nextDraft.width} x ${nextDraft.height} мм`,
        },
        totalPrice: nextCustomerPrice,
        totalPriceLabel: formatCurrency(nextCustomerPrice, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        serverPrice: nextServerPrice,
        serverPriceLabel: formatCurrency(nextServerPrice, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        customerPrice: nextCustomerPrice,
        dealerDiscountPercent: nextDraft.dealerDiscountPercent,
        dealerProfitAmount: nextDealerProfitAmount,
        dealerProfitCode: nextDealerProfitCode,
        labels,
        values,
      },
    });

    const savedServerPrice = remotePrice ?? extractRemotePrice(addProductResponse) ?? nextServerPrice;
    const savedCustomerPrice = calculateCustomerPrice(savedServerPrice, nextDraft.dealerDiscountPercent);
    const savedDealerProfitAmount = calculateDealerProfitAmount(savedServerPrice, nextDraft.dealerDiscountPercent);
    const savedPosition: CalculatorPosition = {
      ...nextPosition,
      price: savedCustomerPrice,
      serverPrice: savedServerPrice,
      customerPrice: savedCustomerPrice,
      dealerProfitAmount: savedDealerProfitAmount,
      dealerProfitCode: buildDealerProfitCode(savedDealerProfitAmount),
    };
    const savedPositions = [...positions.filter((item) => item.id !== positionId), savedPosition].sort((a, b) => a.id - b.id);

    setRemotePrice(savedServerPrice);
    setRemotePriceStatus('success');
    writeCalculatorPositions(savedPositions);
    navigate(returnTo, { state: buildReturnState(savedPositions) });
    } catch (error: unknown) {
      setRemotePrice(null);
      setRemotePriceStatus('error');
      setRemotePriceError(getRemotePriceErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-page px-2 py-3">
      <main className="mx-auto w-full max-w-[576px] rounded-xl bg-surface shadow-panel">
        <header className="border-b border-slate-200 px-4 pb-4 pt-5">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => navigate(returnTo, { state: buildReturnState() })}
              className="justify-self-start rounded-0 text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Позиция {positionId}</p>
              <h1 className="text-base font-extrabold text-ink-800">
                {isReadOnly ? 'Просмотр конфигурации' : 'Калькулятор'}
              </h1>
            </div>
            <button
              type="button"
              onClick={() => navigate(returnTo, { state: buildReturnState() })}
              className="px-2 text-sm font-semibold text-slate-500 hover:text-ink-700"
            >
              {isReadOnly ? 'Закрыть' : 'Отмена'}
            </button>
          </div>
        </header>

        <fieldset disabled={isReadOnly} className={cn('contents', isReadOnly && 'pointer-events-none')}>
        <section className={cn('space-y-5 px-4 pt-4', isReadOnly ? 'pb-[calc(10rem+env(safe-area-inset-bottom))]' : 'pb-[calc(400px+env(safe-area-inset-bottom))]')}>
          <section className="space-y-4">
            <h2 className="text-2xl font-bold">Типовая схема</h2>
            <div className="grid grid-cols-2 gap-3">
              {openingTypeOptions.map((item) => (
                <ChoiceButton
                  key={item.id}
                  type="button"
                  active={draft.openingType === item.id}
                  onClick={() =>
                    setDraft((value) => ({
                      ...value,
                      openingType: item.id,
                      sashes: normalizeSashesForOpening(item.id, value.sashes),
                    }))
                  }
                  className="min-h-[128px] flex-col items-stretch justify-start text-center"
                >
                  <span className="mb-3 flex h-24 items-center justify-center overflow-hidden rounded-lg px-2 py-1">
                    <img src={item.image} alt={item.label} className="h-full w-full object-contain" />
                  </span>
                  <span className="text-sm font-bold text-ink-700">{item.label}</span>
                </ChoiceButton>
              ))}
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <div className="text-xs mb-1 text-center font-bold uppercase tracking-wide text-slate-500">Ширина</div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => adjustDimension('width', -50)}
                    className="inline-flex h-12 w-12 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-slate-600"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <label
                    className={cn(
                      'grid h-12 flex-1 grid-cols-[1fr_28px] items-center gap-2 rounded-lg border bg-slate-50 px-3',
                      dimensionError.width ? 'border-error' : 'border-brand-400',
                    )}
                  >

                    <input
                      value={dimensionInput.width}
                      inputMode="numeric"
                      onChange={(event) => handleDimensionInputChange('width', event.target.value)}
                      onKeyDown={(event) => handleDimensionInputKeyDown('width', event)}
                      className="w-full border-none bg-transparent text-center text-[34px] font-extrabold leading-none text-ink-800 outline-none"
                    />
                    <span className="text-sm font-semibold text-slate-500">мм</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => adjustDimension('width', 50)}
                    className="inline-flex h-12 w-12 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-slate-600"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                {dimensionError.width ? <p className="text-xs text-error">{dimensionError.width}</p> : null}
              </div>

              <div className="space-y-1">
                <div className="text-xs text-center mb-1 font-bold uppercase tracking-wide text-slate-500">Высота</div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => adjustDimension('height', -50)}
                    className="inline-flex h-12 w-12 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-slate-600"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <label
                    className={cn(
                      'grid h-12 flex-1 grid-cols-[1fr_28px] items-center gap-2 rounded-lg border bg-slate-50 px-3',
                      dimensionError.height ? 'border-error' : 'border-slate-300',
                    )}
                  >

                    <input
                      value={dimensionInput.height}
                      inputMode="numeric"
                      onChange={(event) => handleDimensionInputChange('height', event.target.value)}
                      onKeyDown={(event) => handleDimensionInputKeyDown('height', event)}
                      className="w-full border-none bg-transparent text-center text-[34px] font-extrabold leading-none text-ink-800 outline-none"
                    />
                    <span className="text-sm font-semibold text-slate-500">мм</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => adjustDimension('height', 50)}
                    className="inline-flex h-12 w-12 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-slate-600"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                {dimensionError.height ? <p className="text-xs text-error">{dimensionError.height}</p> : null}
              </div>
            </div>

            <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div>
                <h2 className="text-xl font-extrabold text-ink-800">Профиль</h2>
                <p className="text-sm text-slate-500">Выберите профильную систему</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {profileCatalog.map((item) => (
                  <ChoiceButton
                    key={item.id}
                    type="button"
                    active={draft.profileId === item.id}
                    onClick={() =>
                      setDraft((value) => ({
                        ...value,
                        profileId: item.id,
                        windowColor: normalizeWindowColorForProfile(item.id, value.windowColor),
                      }))
                    }
                    className="flex-col items-start gap-1 px-3 py-3"
                  >
                    <span className="text-sm font-extrabold text-ink-800">{item.label}</span>
                    <span className="text-xs font-medium text-slate-500">{item.description}</span>
                  </ChoiceButton>
                ))}
              </div>
            </section>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Дренажное отверстие</p>
                <div className="grid grid-cols-3 gap-2">
                  {drainageOptions.map((item) => (
                    <ChoiceButton
                      key={item.id}
                      type="button"
                      active={draft.drainage === item.id}
                      onClick={() => setDraft((value) => ({ ...value, drainage: item.id }))}
                      className="h-10 px-2 text-center text-xs font-semibold"
                    >
                      {item.label}
                    </ChoiceButton>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Цвет уплотнителя</p>
                <div className="grid grid-cols-3 gap-2">
                  {sealColorOptions.map((item) => (
                    <ChoiceButton
                      key={item.id}
                      type="button"
                      active={draft.sealColor === item.id}
                      onClick={() => setDraft((value) => ({ ...value, sealColor: item.id }))}
                      className="h-10 px-2 text-center text-xs font-semibold"
                    >
                      {item.label}
                    </ChoiceButton>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div>
              <h2 className="text-2xl font-bold text-ink-800">Расположение импоста</h2>
              <p className="text-sm text-slate-500">
                Изменяйте положение импоста {mullionFromEdgeLabel} через перетаскивание или точный ввод.
              </p>
            </div>

            {mullionCount > 0 ? (
              <>
                {/* <div className="grid grid-cols-2 gap-2">
                  {mullionOrientationOptions.map((item) => (
                    <ChoiceButton
                      key={item.id}
                      type="button"
                      active={draft.mullionOrientation === item.id}
                      onClick={() => setDraft((value) => ({ ...value, mullionOrientation: item.id }))}
                      className="h-10 px-2 text-center text-sm font-semibold"
                    >
                      {item.label}
                    </ChoiceButton>
                  ))}
                </div> */}



                <article>
                  <div
                    ref={mullionPreviewRef}
                    className="relative mx-auto aspect-[4/3] w-full max-w-[420px] overflow-hidden rounded-lg border border-slate-300 bg-slate-100"
                    style={{ touchAction: 'none' }}
                  >
                    <div className="absolute inset-3 rounded-md border border-slate-300 bg-slate-200/80" />

                    {mullionSegments.map((segment, index) => {
                      const segmentPosition = mullionSegments.slice(0, index).reduce((total, value) => total + value, 0);
                      const segmentSizePercent = mullionAxisSize > 0 ? (segment / mullionAxisSize) * 100 : 0;
                      const segmentOffsetPercent = mullionAxisSize > 0 ? (segmentPosition / mullionAxisSize) * 100 : 0;

                      return (
                        <div
                          key={`segment-${index}`}
                          className={cn(
                            'absolute text-[10px] font-semibold text-slate-500',
                            draft.mullionOrientation === 'vertical' ? 'bottom-4 top-4' : 'left-4 right-4',
                          )}
                          style={
                            draft.mullionOrientation === 'vertical'
                              ? { left: `${segmentOffsetPercent}%`, width: `${segmentSizePercent}%` }
                              : { bottom: `${segmentOffsetPercent}%`, height: `${segmentSizePercent}%` }
                          }
                        >
                          <span
                            className={cn(
                              'absolute rounded bg-white/80 px-1.5 py-0.5',
                              draft.mullionOrientation === 'vertical'
                                ? 'left-1/2 top-2 -translate-x-1/2'
                                : 'left-2 top-1/2 -translate-y-1/2',
                            )}
                          >
                            {Math.round(segment)} мм
                          </span>
                        </div>
                      );
                    })}

                    {Array.from({ length: mullionCount }, (_, index) => index + 1).map((mullionIndex) => {
                      const offset = normalizedMullionOffsets[String(mullionIndex)] ?? 0;
                      const offsetPercent = mullionAxisSize > 0 ? (offset / mullionAxisSize) * 100 : 0;
                      const isActive = activeMullionId === mullionIndex;

                      return (
                        <button
                          key={`mullion-${mullionIndex}`}
                          type="button"
                          onPointerDown={(event) => handleMullionPointerDown(event, mullionIndex)}
                          onPointerMove={handleMullionPointerMove}
                          onPointerUp={handleMullionPointerEnd}
                          onPointerCancel={handleMullionPointerEnd}
                          className={cn(
                            'absolute z-20 shadow-sm outline-none border transition-colors',
                            isActive ? 'bg-slate-50 border-brand-500' : 'bg-slate-100 border-cyan-800',
                            draft.mullionOrientation === 'vertical'
                              ? 'bottom-3 top-3 w-3 -translate-x-1/2 cursor-col-resize'
                              : 'left-2 right-2 h-3 translate-y-1/2 cursor-row-resize',

                          )}
                          style={
                            draft.mullionOrientation === 'vertical'
                              ? { left: `${offsetPercent}%`, touchAction: 'none' }
                              : { bottom: `${offsetPercent}%`, touchAction: 'none' }
                          }
                        >
                          <span className='flex flex-col gap-2  absolute  left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2'>
                            <span className="h-2 w-2 rounded-full bg-slate-200"></span>
                            <span className="h-2 w-2 rounded-full bg-slate-200"></span>
                            <span className="h-2 w-2 rounded-full bg-slate-200"></span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    {mullionControlMode === 'drag'
                      ? 'Перетащите импост, чтобы изменить размеры секций. На телефоне работает через касание и удержание.'
                      : 'Используйте поля ниже для точного задания расстояний.'}
                  </p>
                </article>


                  <div className="space-y-3">
                    {Array.from({ length: mullionCount }, (_, index) => index + 1).map((mullionIndex) => {
                      const offset = normalizedMullionOffsets[String(mullionIndex)] ?? 0;
                      const reverseOffset = Math.max(0, mullionAxisSize - offset);

                      return (
                        <article key={`input-${mullionIndex}`} className="rounded-xl border border-slate-200 p-3">
                          <p className="mb-3 text-sm font-semibold text-ink-800">Импост {mullionIndex}</p>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                                {mullionFirstPartLabel}
                              </span>
                              <input
                                key={`mullion-${mullionIndex}-start-${offset}`}
                                defaultValue={offset}
                                inputMode="numeric"
                                onChange={(event) => {
                                  const digits = normalizeNumericInput(event.target.value);
                                  if (event.target.value !== digits) {
                                    event.target.value = digits;
                                  }
                                }}
                                onBlur={(event) => {
                                  commitMullionStartInput(mullionIndex, event.currentTarget, offset);
                                }}
                                onKeyDown={(event) => {
                                  if (event.key !== 'Enter') {
                                    return;
                                  }

                                  event.preventDefault();
                                  commitMullionStartInput(mullionIndex, event.currentTarget, offset);
                                  event.currentTarget.blur();
                                }}
                                autoComplete="off"
                                className="w-full border-none bg-transparent text-lg font-extrabold text-ink-800 outline-none"
                              />
                            </label>

                            <label className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                                {mullionSecondPartLabel}
                              </span>
                              <input
                                key={`mullion-${mullionIndex}-reverse-${reverseOffset}-${mullionAxisSize}`}
                                defaultValue={reverseOffset}
                                inputMode="numeric"
                                onChange={(event) => {
                                  const digits = normalizeNumericInput(event.target.value);
                                  if (event.target.value !== digits) {
                                    event.target.value = digits;
                                  }
                                }}
                                onBlur={(event) => {
                                  commitMullionReverseInput(mullionIndex, event.currentTarget, reverseOffset);
                                }}
                                onKeyDown={(event) => {
                                  if (event.key !== 'Enter') {
                                    return;
                                  }

                                  event.preventDefault();
                                  commitMullionReverseInput(mullionIndex, event.currentTarget, reverseOffset);
                                  event.currentTarget.blur();
                                }}
                                autoComplete="off"
                                className="w-full border-none bg-transparent text-lg font-extrabold text-ink-800 outline-none"
                              />
                            </label>
                          </div>
                        </article>
                      );
                    })}
                  </div>



              </>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-100 px-3 py-4 text-sm text-slate-600">
                Для выбранной типовой схемы импосты не предусмотрены.
              </div>
            )}
          </section>
          <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div>
              <h2 className="text-2xl font-bold text-ink-800">Ламинация</h2>
              <p className="text-sm text-slate-500">Снаружи на выбор, внутри всегда белый</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="mb-3 text-center text-sm font-bold text-ink-800">Снаружи</p>
                <div className="grid grid-cols-2 gap-3">
                  {availableWindowColorOptions.map((item) => {
                    const isActive = draft.windowColor === item.id;

                    return (
                      <button
                        key={`outside-${item.id}`}
                        type="button"
                        onClick={() => setDraft((value) => ({ ...value, windowColorSide: 'outside', windowColor: item.id }))}
                        className="group text-center"
                      >
                        <span
                          className={cn(
                            'mb-2 inline-flex h-14 w-14 items-center justify-center rounded-full border-2 border-transparent transition-all',
                            isActive ? 'border-brand-500 ring-2 ring-brand-200' : 'border-slate-200',
                          )}
                        >
                          <span
                            className={cn(
                              'inline-flex h-12 w-12 items-center justify-center rounded-full border border-slate-300 text-white',
                              item.swatchClassName,
                            )}
                          >
                            {isActive ? <Check className={cn('h-5 w-5', item.id === 'white' ? 'text-black' : 'text-white')} /> : null}
                          </span>
                        </span>
                        <span
                          className={cn(
                            'block text-xs font-semibold',
                            isActive ? 'text-brand-600' : 'text-slate-600 group-hover:text-ink-700',
                          )}
                        >
                          {item.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {!laminateProfileIds.has(draft.profileId) ? (
                  <p className="mt-3 text-center text-xs font-semibold text-slate-500">
                    Для выбранного профиля доступен только белый
                  </p>
                ) : null}
              </div>

              <div>
                <p className="mb-3 text-center text-sm font-bold text-ink-800">Внутри</p>
                <div className="grid grid-cols-1 justify-items-center gap-3">
                  <div className="text-center">
                    <span className="mb-2 inline-flex h-14 w-14 items-center justify-center rounded-full border-2 border-brand-500 ring-2 ring-brand-200">
                      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-slate-300 bg-white">
                        <Check className="h-5 w-5 text-black" />
                      </span>
                    </span>
                    <span className="block text-xs font-semibold text-brand-600">Белый</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {hasActiveSashes ? (
            <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div>
              <h2 className="text-2xl font-bold text-ink-800">Москитная сетка</h2>
              <p className="text-sm text-slate-500">Выберите створки, где нужна сетка</p>
            </div>

            <div className="relative mx-auto aspect-[4/3] w-full max-w-[420px] overflow-hidden rounded-lg border border-slate-300 bg-slate-100 p-4">
              <img src={currentOpening.image} alt="" className="absolute inset-4 h-[calc(100%-2rem)] w-[calc(100%-2rem)] object-contain" />
              <div
                className="absolute left-1/2 top-1/2 grid h-[72%] w-[74%] -translate-x-1/2 -translate-y-1/2 gap-1"
                style={{ gridTemplateColumns: `repeat(${sashLayout.length}, minmax(0, 1fr))` }}
              >
                {sashLayout.map((sash) => {
                  const isActive = selectedMosquitoScreens.includes(sash.id);

                  return (
                    <button
                      key={sash.id}
                      type="button"
                      onClick={() => toggleMosquitoScreen(sash.id)}
                      className={cn(
                        'relative flex h-full w-full items-center justify-center rounded-md border-2 text-[11px] font-extrabold transition-all',
                        isActive
                          ? 'border-brand-500 bg-brand-500/35 text-white shadow-sm'
                          : 'border-slate-400 bg-slate-100/20 text-slate-500 hover:border-brand-400 hover:bg-brand-50/30 hover:text-ink-800',
                      )}
                      aria-label={`Москитная сетка: ${sash.label}`}
                    >
                      <span className="inline-flex h-7 min-w-6 items-center justify-center rounded-full border border-slate-300 bg-surface px-2">
                        {isActive ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            </section>
          ) : null}

          {hasActiveSashes ? (
            <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div>
                <h2 className="text-2xl font-bold text-ink-800">Выбор ручки</h2>
              <p className="text-sm text-slate-500">Тип ручки и цвет фурнитуры</p>
            </div>

            <button
              type="button"
              onClick={() => setDraft((value) => ({ ...value, handleType: 'standard' }))}
              className="flex w-full items-center gap-3 rounded-xl border border-brand-500 bg-brand-500 p-3 text-left text-white"
            >
              <span className="inline-flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/40 bg-white">
                <img src={accadoHandleImage} alt="" className="h-full w-full object-contain" />
              </span>
              <span className="text-lg font-extrabold">ACCADO</span>
            </button>

            <article className="rounded-xl border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-500">Цвет ручки</p>
                <p className="text-sm font-semibold text-brand-600">{currentHandleColor.label}</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {handleColorOptions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setDraft((value) => ({ ...value, handleColor: item.id }))}
                    className="group text-center"
                  >
                    <span
                      className={cn(
                        'mx-auto mb-2 inline-flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all',
                        draft.handleColor === item.id ? 'border-brand-500 ring-2 ring-brand-100' : 'border-slate-200',
                      )}
                    >
                      <span className={cn('h-7 w-7 rounded-full border border-slate-300', item.swatchClassName)} />
                    </span>
                    <span
                      className={cn(
                        'block text-[10px] font-semibold leading-tight',
                        draft.handleColor === item.id ? 'text-brand-600' : 'text-slate-600 group-hover:text-ink-700',
                      )}
                    >
                      {item.label}
                    </span>
                  </button>
                ))}
              </div>
            </article>
            </section>
          ) : null}

          <section className="rounded-xl border border-dashed border-slate-200 px-3 py-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-extrabold text-ink-800">Дополнительные опции</h2>
                <p className="text-sm text-slate-500">Мини-корзина подоконников и отливов</p>
              </div>
            </div>
            <button
              type="button"
              onClick={openAddOptionDialog}
              className="mb-4 inline-flex h-10 items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 text-sm font-semibold text-brand-600 hover:bg-brand-100"
            >
              <Plus className="h-4 w-4" />
              Добавить опцию
            </button>

            {draft.additionalOptions.length > 0 ? (
              <div className="space-y-3">
                {draft.additionalOptions.map((option) => (
                  <article key={option.id} className="rounded-xl border border-slate-200 px-3 py-3 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-ink-800">{option.type === 'sill' ? 'Подоконник' : 'Отлив'}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {option.type === 'sill'
                            ? `Длина: ${option.length ?? 0} мм · ширина: ${option.width ?? 0} мм`
                            : `Ширина: ${option.width ?? 180} мм`}
                        </p>
                        {option.type === 'sill' ? (
                          <>
                            <p className="text-sm text-slate-500">
                              Тип: {sillTypeLabels.fineber}
                            </p>
                          </>
                        ) : (
                          <p className="text-sm text-slate-500">
                            Цвет: {option.dripColor ? dripColorLabels[option.dripColor] : 'Белый'}
                          </p>
                        )}
                      </div>
                      <p className="text-lg font-extrabold text-ink-800">{formatCurrency(getOptionPrice(option, draft.width))}</p>
                    </div>
                    <div className="mt-3 flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
                      <button
                        type="button"
                        onClick={() => openEditOptionDialog(option)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-slate-100 text-brand-500 hover:bg-slate-200"
                        aria-label="Редактировать опцию"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeOption(option.id)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-slate-100 text-slate-400 hover:bg-slate-200"
                        aria-label="Удалить опцию"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-slate-500">
                Пока дополнительные опции не добавлены
              </div>
            )}
          </section>
        </section>
        </fieldset>

        {isReadOnly ? (
          <footer className="fixed bottom-[calc(57px+max(0.5rem,env(safe-area-inset-bottom)))] left-1/2 z-30 w-[calc(100%-1rem)] max-w-[560px] -translate-x-1/2 border border-slate-200 bg-surface/95 px-4 pb-4 pt-3 shadow-panel backdrop-blur-sm">
            <Button className="h-12 text-base" onClick={() => navigate(returnTo, { state: buildReturnState() })}>
              Вернуться к заказу
            </Button>
          </footer>
        ) : (
        <footer className="fixed bottom-[calc(57px+max(0.5rem,env(safe-area-inset-bottom)))] left-1/2 z-30 w-[calc(100%-1rem)] max-w-[560px] -translate-x-1/2 space-y-3 border border-slate-200 bg-surface/95 px-4 pb-4 pt-3 shadow-panel backdrop-blur-sm">
          <article className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Текущая конфигурация</p>
                <p className="mt-2 text-2xl font-extrabold leading-none text-ink-800">
                  {draft.width} x {draft.height} мм
                </p>
                <p className="mt-2 truncate text-sm text-slate-500">{currentOpening.label}</p>
              </div>
              <div className="w-44 shrink-0">
                <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span>Скидка</span>
                  <span>{draft.dealerDiscountPercent}%</span>
                </div>
                <div className="grid h-10 grid-cols-[40px_1fr_40px] overflow-hidden rounded-lg border border-slate-300 bg-slate-100">
                  <button type="button" onClick={() => adjustDealerDiscountPercent(-1)} className="flex items-center justify-center">
                    <Minus className="h-4 w-4" />
                  </button>
                  <label className="flex items-center justify-center gap-1 border-x border-slate-300 px-1">
                    <input
                      value={draft.dealerDiscountPercent}
                      inputMode="numeric"
                      onChange={(event) => {
                        const digits = normalizeNumericInput(event.target.value);
                        setDealerDiscountPercent(digits ? Number.parseInt(digits, 10) : 0);
                      }}
                      className="w-full border-none bg-transparent text-center text-base font-extrabold text-ink-800 outline-none"
                    />
                    <Percent className="h-4 w-4 text-slate-500" />
                  </label>
                  <button type="button" onClick={() => adjustDealerDiscountPercent(1)} className="flex items-center justify-center">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-[30px] font-extrabold leading-none text-ink-800">{totalPriceLabel}</p>
                {remotePriceStatus === 'loading' ? (
                  <p className="mt-2 text-xs font-semibold text-slate-500">Получаем цену...</p>
                ) : remotePriceStatus === 'error' ? (
                  <p className="mt-2 text-xs font-semibold text-error">{remotePriceError}</p>
                ) : remotePriceStatus === 'success' ? (
                  <p className="mt-2 text-xs font-semibold text-slate-500">Цена с сервера: {serverPriceLabel}</p>
                ) : null}
              </div>
              <div className="text-right">

                <p className="text-xl font-extrabold text-ink-800">{dealerProfitCode}</p>
              </div>
            </div>
          </article>
          <Button className="h-12 text-base" loading={isSaving} onClick={save}>
            Сохранить позицию
            <ChevronRight className="h-4 w-4" />
          </Button>
        </footer>
        )}
        <BottomNav />
      </main>

      {!isReadOnly && isOptionDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-3 sm:items-center">
          <div className="z-100 w-full max-w-[540px] rounded-xl bg-surface p-4 shadow-panel">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-extrabold text-ink-800">
                  {editingOptionId === null ? 'Добавить опцию' : 'Редактировать опцию'}
                </h3>
                <p className="text-sm text-slate-500">Подоконник или отлив с размерами</p>
              </div>
              <button
                type="button"
                onClick={() => setOptionDialogOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-slate-500 hover:bg-slate-100"
                aria-label="Закрыть"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <ChoiceButton
                  type="button"
                  active={optionForm.type === 'sill'}
                  onClick={() =>
                    setOptionForm((value) => ({
                      ...value,
                      type: 'sill',
                      length: value.length || draft.width,
                      width: sillDepthOptions.includes(value.width) ? value.width : 300,
                    }))
                  }
                  className="h-11 text-center text-sm font-semibold"
                >
                  Подоконник
                </ChoiceButton>
                <ChoiceButton
                  type="button"
                  active={optionForm.type === 'drip'}
                  onClick={() =>
                    setOptionForm((value) => ({
                      ...value,
                      type: 'drip',
                      width: dripDepthOptions.includes(value.width) ? value.width : 180,
                    }))
                  }
                  className="h-11 text-center text-sm font-semibold"
                >
                  Отлив
                </ChoiceButton>
              </div>

              {optionForm.type === 'sill' ? (
                <label className="rounded-xl block border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Длина, мм</span>
                  <input
                    value={optionForm.length || ''}
                    inputMode="numeric"
                    onChange={(event) => {
                      const digits = normalizeNumericInput(event.target.value);
                      setOptionForm((value) => ({
                        ...value,
                        length: digits ? Number.parseInt(digits, 10) : 0,
                      }));
                    }}
                    onBlur={() =>
                      setOptionForm((value) => ({
                        ...value,
                        length: clampSillLength(value.length || draft.width),
                      }))
                    }
                    className="h-9 w-full border-none bg-transparent text-base font-extrabold text-ink-800 outline-none"
                  />
                </label>
              ) : null}

              <div className={optionForm.type === 'sill' ? 'grid grid-cols-2 gap-3' : 'grid grid-cols-1 gap-3'}>
                {optionForm.type === 'sill' ? (
                  <label className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Тип</span>
                    <select
                      value={optionForm.sillType}
                      onChange={(event) =>
                        setOptionForm((value) => ({ ...value, sillType: event.target.value as SillType }))
                      }
                      className="h-9 w-full border-none bg-surface text-base font-extrabold text-ink-800 outline-none"
                    >
                      {sillTypeOptions.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <label className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Ширина</span>
                  <select
                    value={optionForm.width}
                    onChange={(event) =>
                      setOptionForm((value) => ({ ...value, width: Number.parseInt(event.target.value, 10) }))
                    }
                    className="h-9 w-full border-none bg-surface text-base font-extrabold text-ink-800 outline-none"
                  >
                    {(optionForm.type === 'sill' ? sillDepthOptions : dripDepthOptions).map((depth) => (
                      <option key={depth} value={depth}>
                        {depth} мм
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {optionForm.type === 'drip' ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Цвет отлива</p>
                  <div className="grid grid-cols-3 gap-2">
                    {dripColorOptions.map((item) => (
                      <ChoiceButton
                        key={item.id}
                        type="button"
                        active={optionForm.dripColor === item.id}
                        onClick={() => setOptionForm((value) => ({ ...value, dripColor: item.id }))}
                        className="h-12 px-2 text-center text-xs font-semibold"
                      >
                        <span className={cn('h-4 w-4 rounded-full border border-slate-300 shrink-0', item.swatchClassName)} />
                        {item.label}
                      </ChoiceButton>
                    ))}
                  </div>
                </div>
              ) : (
                null
              )}

              <div className="flex gap-3">
                {editingOptionId !== null ? (
                  <button
                    type="button"
                    onClick={() => removeOption(editingOptionId)}
                    className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Удалить
                  </button>
                ) : null}
                <Button className="h-12 flex-1 text-base" onClick={saveOption}>
                  Сохранить опцию
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};


