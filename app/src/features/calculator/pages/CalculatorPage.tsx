import { useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type PointerEvent as ReactPointerEvent } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Crown,
  Minus,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  type AdditionalOptionType,
  type CalculatorAdditionalOption,
  type CalculatorPosition,
  type DrainageType,
  type HandleColor,
  type HandleType,
  type MullionOffsets,
  type MullionOrientation,
  type OpeningType,
  type PackageType,
  type SealColor,
  type SillColor,
  type WindowColor,
  type WindowColorSide,
  readCalculatorPositions,
  writeCalculatorPositions,
} from '@/features/calculator/model/positions.storage';
import { cn } from '@/shared/lib/cn';
import { formatCurrency } from '@/shared/lib/format';
import { Button } from '@/shared/ui/Button';

type ProfileId = 'rula-58' | 'isotech-58' | 'grunder-60' | 'wintech-70' | 'exprof-arctica' | 'profecta-plus';

interface CalculatorLocationState {
  positionId?: number;
  resetPositions?: boolean;
  returnTo?: string;
}

interface DraftState {
  width: number;
  height: number;
  packageType: PackageType;
  openingType: OpeningType;
  profileId: ProfileId;
  drainage: DrainageType;
  sealColor: SealColor;
  windowColorSide: WindowColorSide;
  windowColor: WindowColor;
  handleType: HandleType;
  handleColor: HandleColor;
  mullionOrientation: MullionOrientation;
  mullionOffsets: MullionOffsets;
  additionalOptions: CalculatorAdditionalOption[];
}

interface OptionFormState {
  type: AdditionalOptionType;
  length: number;
  width: number;
  sillColor: SillColor;
}

type MullionControlMode = 'drag' | 'input';

const withBase = (path: string): string => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;

const profileCatalog = [
  { id: 'rula-58', label: 'Rula 58 мм', description: 'Базовый профиль', pricePerSquare: 3200 },
  { id: 'isotech-58', label: 'Isotech 58 мм', description: 'Надежный вариант', pricePerSquare: 3500 },
  { id: 'grunder-60', label: 'Grunder 60 мм', description: 'Оптимальный баланс', pricePerSquare: 4100 },
  { id: 'wintech-70', label: 'Wintech 70 мм', description: 'Теплый профиль', pricePerSquare: 4700 },
  { id: 'exprof-arctica', label: 'Exprof Arctica', description: 'Для холодных регионов', pricePerSquare: 4900 },
  { id: 'profecta-plus', label: 'Profecta Plus', description: 'Премиальная серия', pricePerSquare: 5600 },
] as const;

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
  { id: 'balcony', label: 'Балконная дверь', factor: 2.12, image: withBase('/windows/1.svg') },
];

const packageOptions: Array<{ id: PackageType; label: string; factor: number }> = [
  { id: 'budget', label: 'Бюджет', factor: 1 },
  { id: 'standard', label: 'Стандарт', factor: 1.12 },
  { id: 'premium', label: 'Премиум', factor: 1.26 },
];

const packageIcons: Record<PackageType, LucideIcon> = {
  budget: Wallet,
  standard: ShieldCheck,
  premium: Crown,
};

const sealColorOptions: Array<{ id: SealColor; label: string; extra: number }> = [
  { id: 'black', label: 'Черный', extra: 0 },
  { id: 'gray', label: 'Серый', extra: 180 },
  { id: 'white', label: 'Белый', extra: 220 },
];

const drainageOptions: Array<{ id: DrainageType; label: string; extra: number }> = [
  { id: 'bottom', label: 'Снизу', extra: 0 },
  { id: 'none', label: 'Нет', extra: 0 },
  { id: 'street', label: 'Со стороны улицы', extra: 120 },
];

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
  { id: 'white', label: 'Белый', extra: 0, swatchClassName: 'bg-slate-100' },
  { id: 'anthracite', label: 'Антрацит', extra: 600, swatchClassName: 'bg-slate-500' },
  { id: 'golden_oak', label: 'Золотой дуб', extra: 780, swatchClassName: 'bg-amber-400' },
  { id: 'dark_oak', label: 'Темный дуб', extra: 820, swatchClassName: 'bg-amber-950' },
  { id: 'mahogany', label: 'Махагон', extra: 720, swatchClassName: 'bg-orange-800' },
  { id: 'silver', label: 'Серебро', extra: 740, swatchClassName: 'bg-gradient-to-br from-slate-100 via-slate-300 to-slate-600' },
];

const handleTypeOptions: Array<{ id: HandleType; label: string; extra: number }> = [
  { id: 'standard', label: 'Стандарт', extra: 0 },
  { id: 'premium', label: 'Премиум', extra: 420 },
  { id: 'design', label: 'Дизайн', extra: 680 },
];

const handleColorOptions: Array<{
  id: HandleColor;
  label: string;
  extra: number;
  swatchClassName: string;
}> = [
  { id: 'white', label: 'Белый', extra: 0, swatchClassName: 'bg-white' },
  { id: 'brown', label: 'Коричневый', extra: 140, swatchClassName: 'bg-amber-950' },
  { id: 'silver', label: 'Серебро', extra: 160, swatchClassName: 'bg-slate-300' },
  { id: 'gold', label: 'Золото', extra: 220, swatchClassName: 'bg-yellow-400' },
];
const sillColorOptions: Array<{ id: SillColor; label: string; extra: number }> = [
  { id: 'white', label: 'Белый', extra: 0 },
  { id: 'brown', label: 'Коричневый', extra: 260 },
  { id: 'anthracite', label: 'Антрацит', extra: 380 },
];

const mullionOrientationOptions: Array<{ id: MullionOrientation; label: string }> = [
  { id: 'vertical', label: 'Вертикальный' },
  { id: 'horizontal', label: 'Горизонтальный' },
];

const defaultDrainage: DrainageType = 'bottom';
const defaultSealColor: SealColor = 'black';
const defaultWindowColorSide: WindowColorSide = 'outside';
const defaultWindowColor: WindowColor = 'white';
const defaultHandleType: HandleType = 'standard';
const defaultHandleColor: HandleColor = 'white';
const defaultMullionOrientation: MullionOrientation = 'vertical';

const MULLION_STEP = 10;
const MULLION_MIN_SECTION_FALLBACK = 80;
const MULLION_MIN_SECTION_TARGET = 250;

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
): MullionOffsets => {
  if (mullionCount <= 0 || axisSize <= 0) {
    return {};
  }

  const minSectionSize = getMullionMinSectionSize(axisSize, mullionCount);
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
    const minOffset = previous + minSectionSize;
    values[index] = Math.max(values[index], minOffset);
    previous = values[index];
  }

  let next = axisSize;
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const maxOffset = next - minSectionSize;
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
): { min: number; max: number } => {
  const minSectionSize = getMullionMinSectionSize(axisSize, mullionCount);
  const previousOffset = index > 1 ? offsets[String(index - 1)] ?? 0 : 0;
  const nextOffset = index < mullionCount ? offsets[String(index + 1)] ?? axisSize : axisSize;
  const min = previousOffset + minSectionSize;
  const max = nextOffset - minSectionSize;

  if (min > max) {
    const midpoint = roundToMullionStep((min + max) / 2);
    return { min: midpoint, max: midpoint };
  }

  return { min, max };
};

const clampDimension = (value: number): number => Math.max(500, Math.min(3200, value));
const clampOptionLength = (value: number): number => Math.max(300, Math.min(6000, value));
const clampOptionWidth = (value: number): number => Math.max(50, Math.min(1000, value));

const normalizePositionId = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.trunc(value)) : null;
const isProfileId = (value: string | undefined): value is ProfileId => profileCatalog.some((item) => item.id === value);
const isOpeningType = (value: string | undefined): value is OpeningType =>
  openingTypeOptions.some((item) => item.id === value);
const isWindowColorSide = (value: string | undefined): value is WindowColorSide =>
  windowColorSideOptions.some((item) => item.id === value);
const isWindowColor = (value: string | undefined): value is WindowColor =>
  windowColorOptions.some((item) => item.id === value);
const isHandleType = (value: string | undefined): value is HandleType =>
  handleTypeOptions.some((item) => item.id === value);
const isHandleColor = (value: string | undefined): value is HandleColor =>
  handleColorOptions.some((item) => item.id === value);
const getOpeningTypeById = (openingType: OpeningType) =>
  openingTypeOptions.find((item) => item.id === openingType) ?? openingTypeOptions[2];

const createDefaultDraft = (): DraftState => ({
  width: 1300,
  height: 1400,
  packageType: 'standard',
  openingType: 'double',
  profileId: 'grunder-60',
  drainage: defaultDrainage,
  sealColor: defaultSealColor,
  windowColorSide: defaultWindowColorSide,
  windowColor: defaultWindowColor,
  handleType: defaultHandleType,
  handleColor: defaultHandleColor,
  mullionOrientation: defaultMullionOrientation,
  mullionOffsets: {},
  additionalOptions: [],
});

const createDefaultOptionForm = (): OptionFormState => ({
  type: 'sill',
  length: 1300,
  width: 300,
  sillColor: 'white',
});

const createDraftFromPosition = (position?: CalculatorPosition): DraftState => {
  const defaults = createDefaultDraft();

  if (!position) {
    return defaults;
  }

  return {
    width: clampDimension(position.width ?? defaults.width),
    height: clampDimension(position.height ?? defaults.height),
    packageType: position.packageType ?? defaults.packageType,
    openingType: isOpeningType(position.openingType) ? position.openingType : defaults.openingType,
    profileId: isProfileId(position.profileId) ? position.profileId : defaults.profileId,
    drainage: position.drainage ?? defaults.drainage,
    sealColor: position.sealColor ?? defaults.sealColor,
    windowColorSide: isWindowColorSide(position.windowColorSide) ? position.windowColorSide : defaults.windowColorSide,
    windowColor: isWindowColor(position.windowColor) ? position.windowColor : defaults.windowColor,
    handleType: isHandleType(position.handleType) ? position.handleType : defaults.handleType,
    handleColor: isHandleColor(position.handleColor) ? position.handleColor : defaults.handleColor,
    mullionOrientation: isMullionOrientation(position.mullionOrientation)
      ? position.mullionOrientation
      : defaults.mullionOrientation,
    mullionOffsets: isMullionOffsets(position.mullionOffsets) ? position.mullionOffsets : defaults.mullionOffsets,
    additionalOptions: position.additionalOptions ?? [],
  };
};

const getOptionPrice = (option: CalculatorAdditionalOption): number => {
  const length = option.length ?? 0;
  const width = option.width ?? 0;
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
  const returnTo = typeof state?.returnTo === 'string' && state.returnTo.length > 0 ? state.returnTo : '/orders/new';
  const requestedPositionId = normalizePositionId(state?.positionId);
  const [positions, setPositions] = useState<CalculatorPosition[]>([]);
  const [positionId, setPositionId] = useState(requestedPositionId ?? 1);
  const [draft, setDraft] = useState<DraftState>(() => createDefaultDraft());
  const [isOptionDialogOpen, setOptionDialogOpen] = useState(false);
  const [editingOptionId, setEditingOptionId] = useState<number | null>(null);
  const [optionForm, setOptionForm] = useState<OptionFormState>(() => createDefaultOptionForm());
  const [mullionControlMode] = useState<MullionControlMode>('drag');
  const [activeMullionId, setActiveMullionId] = useState<number | null>(null);
  const mullionPreviewRef = useRef<HTMLDivElement | null>(null);
  const mullionDragStateRef = useRef<{ pointerId: number; index: number } | null>(null);

  useEffect(() => {
    const storedPositions = state?.resetPositions ? [] : readCalculatorPositions();
    const nextPositionId =
      requestedPositionId ?? (storedPositions.length > 0 ? Math.max(...storedPositions.map((item) => item.id)) + 1 : 1);
    const currentPosition = storedPositions.find((item) => item.id === nextPositionId);

    setPositions(storedPositions);
    setPositionId(nextPositionId);
    setDraft(createDraftFromPosition(currentPosition));
  }, [location.key, requestedPositionId, state?.resetPositions]);

  useEffect(() => {
    setDraft((value) => {
      const nextMullionCount = getMullionCountByOpeningType(value.openingType);
      const nextAxisSize = getMullionAxisSize(value.width, value.height, value.mullionOrientation);
      const nextOffsets = sanitizeMullionOffsets(value.mullionOffsets, nextMullionCount, nextAxisSize);

      if (areMullionOffsetsEqual(value.mullionOffsets, nextOffsets)) {
        return value;
      }

      return {
        ...value,
        mullionOffsets: nextOffsets,
      };
    });
  }, [draft.height, draft.mullionOrientation, draft.openingType, draft.width]);

  const currentProfile = profileCatalog.find((item) => item.id === draft.profileId) ?? profileCatalog[2];
  const currentPackage = packageOptions.find((item) => item.id === draft.packageType) ?? packageOptions[1];
  const currentOpening = getOpeningTypeById(draft.openingType);
  const currentWindowColor = windowColorOptions.find((item) => item.id === draft.windowColor) ?? windowColorOptions[0];
  const currentHandleColor = handleColorOptions.find((item) => item.id === draft.handleColor) ?? handleColorOptions[0];
  const mullionCount = getMullionCountByOpeningType(draft.openingType);
  const mullionAxisSize = getMullionAxisSize(draft.width, draft.height, draft.mullionOrientation);

  const normalizedMullionOffsets = useMemo(
    () => sanitizeMullionOffsets(draft.mullionOffsets, mullionCount, mullionAxisSize),
    [draft.mullionOffsets, mullionAxisSize, mullionCount],
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

  const totalPrice = useMemo(() => {
    const area = (draft.width * draft.height) / 1_000_000;
    const sealExtra = sealColorOptions.find((item) => item.id === draft.sealColor)?.extra ?? 0;
    const drainageExtra = drainageOptions.find((item) => item.id === draft.drainage)?.extra ?? 0;
    const windowColorExtra = windowColorOptions.find((item) => item.id === draft.windowColor)?.extra ?? 0;
    const handleTypeExtra = handleTypeOptions.find((item) => item.id === draft.handleType)?.extra ?? 0;
    const handleColorExtra = handleColorOptions.find((item) => item.id === draft.handleColor)?.extra ?? 0;
    const optionPrice = draft.additionalOptions.reduce((total, option) => total + getOptionPrice(option), 0);

    return Math.round(
      (area * currentProfile.pricePerSquare * currentOpening.factor +
        sealExtra +
        drainageExtra +
        windowColorExtra +
        handleTypeExtra +
        handleColorExtra +
        optionPrice) *
        currentPackage.factor,
    );
  }, [currentOpening.factor, currentPackage.factor, currentProfile.pricePerSquare, draft]);
  const openAddOptionDialog = (): void => {
    setEditingOptionId(null);
    setOptionForm(createDefaultOptionForm());
    setOptionDialogOpen(true);
  };

  const openEditOptionDialog = (option: CalculatorAdditionalOption): void => {
    setEditingOptionId(option.id);
    setOptionForm({
      type: option.type,
      length: option.length ?? 1300,
      width: option.width ?? (option.type === 'sill' ? 300 : 150),
      sillColor: option.sillColor ?? 'white',
    });
    setOptionDialogOpen(true);
  };

  const saveOption = (): void => {
    const nextOption: CalculatorAdditionalOption = {
      id:
        editingOptionId ??
        (draft.additionalOptions.length > 0 ? Math.max(...draft.additionalOptions.map((item) => item.id)) + 1 : 1),
      type: optionForm.type,
      length: clampOptionLength(optionForm.length),
      width: clampOptionWidth(optionForm.width),
      sillColor: optionForm.type === 'sill' ? optionForm.sillColor : undefined,
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

  const setMullionOffset = (mullionIndex: number, nextOffset: number): void => {
    if (!Number.isFinite(nextOffset)) {
      return;
    }

    setDraft((value) => {
      const nextMullionCount = getMullionCountByOpeningType(value.openingType);
      const nextAxisSize = getMullionAxisSize(value.width, value.height, value.mullionOrientation);
      const offsets = sanitizeMullionOffsets(value.mullionOffsets, nextMullionCount, nextAxisSize);
      const bounds = getMullionBounds(mullionIndex, offsets, nextMullionCount, nextAxisSize);
      const normalizedOffset = roundToMullionStep(Math.max(bounds.min, Math.min(bounds.max, nextOffset)));
      const nextOffsets = sanitizeMullionOffsets(
        {
          ...offsets,
          [String(mullionIndex)]: normalizedOffset,
        },
        nextMullionCount,
        nextAxisSize,
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

  const save = (): void => {
    const existingPosition = positions.find((item) => item.id === positionId);
    const nextPosition: CalculatorPosition = {
      ...(existingPosition ?? { id: positionId }),
      id: positionId,
      width: draft.width,
      height: draft.height,
      price: totalPrice,
      packageType: draft.packageType,
      openingType: draft.openingType,
      profileId: draft.profileId,
      drainage: draft.drainage,
      sealColor: draft.sealColor,
      windowColorSide: draft.windowColorSide,
      windowColor: draft.windowColor,
      handleType: draft.handleType,
      handleColor: draft.handleColor,
      mullionOrientation: draft.mullionOrientation,
      mullionOffsets: normalizedMullionOffsets,
      additionalOptions: draft.additionalOptions,
    };
    const nextPositions = [...positions.filter((item) => item.id !== positionId), nextPosition].sort((a, b) => a.id - b.id);

    writeCalculatorPositions(nextPositions);
    navigate(returnTo, { state: { calculatorPositions: nextPositions } });
  };

  return (
    <div className="min-h-screen bg-page px-2 py-3">
      <main className="mx-auto w-full max-w-[576px] rounded-xl bg-surface shadow-panel">
        <header className="border-b border-slate-200 px-4 pb-4 pt-5">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => navigate(returnTo)}
              className="justify-self-start rounded-0 text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Позиция {positionId}</p>
              <h1 className="text-base font-extrabold text-ink-800">Калькулятор</h1>
            </div>
            <button
              type="button"
              onClick={() => navigate(returnTo)}
              className="px-2 text-sm font-semibold text-slate-500 hover:text-ink-700"
            >
              Отмена
            </button>
          </div>
        </header>

        <section className="space-y-5 px-4 pb-36 pt-4">
          <article className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Текущая конфигурация</p>
            <div className="mt-2 flex items-end justify-between gap-3">
              <div>
                <p className="text-2xl font-extrabold leading-none text-ink-800">
                  {draft.width} x {draft.height} мм
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  {currentOpening.label} · {currentProfile.label} · {currentPackage.label}
                </p>
              </div>
            </div>
            <p className="mt-2 text-[30px] font-extrabold leading-none text-ink-800">
              {formatCurrency(totalPrice, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </article>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">Типовая схема</h2>
            <div className="grid grid-cols-2 gap-3">
              {openingTypeOptions.map((item) => (
                <ChoiceButton
                  key={item.id}
                  type="button"
                  active={draft.openingType === item.id}
                  onClick={() => setDraft((value) => ({ ...value, openingType: item.id }))}
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
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setDraft((value) => ({ ...value, width: clampDimension(value.width - 50) }))}
                  className="inline-flex h-12 w-12 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-slate-600"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <label className="flex h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-brand-400 bg-slate-50 px-3">
                  <input
                    value={draft.width}
                    inputMode="numeric"
                    onChange={(event) =>
                      setDraft((value) => ({
                        ...value,
                        width: clampDimension(Number.parseInt(event.target.value.replace(/\D/g, '') || '500', 10)),
                      }))
                    }
                    className="w-full border-none bg-transparent text-center text-[34px] font-extrabold leading-none text-ink-800 outline-none"
                  />
                  <span className="text-sm font-semibold text-slate-500">мм</span>
                </label>
                <button
                  type="button"
                  onClick={() => setDraft((value) => ({ ...value, width: clampDimension(value.width + 50) }))}
                  className="inline-flex h-12 w-12 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-slate-600"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setDraft((value) => ({ ...value, height: clampDimension(value.height - 50) }))}
                  className="inline-flex h-12 w-12 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-slate-600"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <label className="flex h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3">
                  <input
                    value={draft.height}
                    inputMode="numeric"
                    onChange={(event) =>
                      setDraft((value) => ({
                        ...value,
                        height: clampDimension(Number.parseInt(event.target.value.replace(/\D/g, '') || '500', 10)),
                      }))
                    }
                    className="w-full border-none bg-transparent text-center text-[34px] font-extrabold leading-none text-ink-800 outline-none"
                  />
                  <span className="text-sm font-semibold text-slate-500">мм</span>
                </label>
                <button
                  type="button"
                  onClick={() => setDraft((value) => ({ ...value, height: clampDimension(value.height + 50) }))}
                  className="inline-flex h-12 w-12 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-slate-600"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

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

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">Профильная система</h2>
            <div className="grid grid-cols-1 gap-2">
              {packageOptions.map((item) => {
                const Icon = packageIcons[item.id];

                return (
                  <ChoiceButton
                    key={item.id}
                    type="button"
                    active={draft.packageType === item.id}
                    onClick={() => setDraft((value) => ({ ...value, packageType: item.id }))}
                    className="h-14 gap-2 text-sm font-semibold"
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                  </ChoiceButton>
                );
              })}
            </div>

            <div className="grid grid-cols-1 gap-2">
              {profileCatalog.map((item) => (
                <ChoiceButton
                  key={item.id}
                  type="button"
                  active={draft.profileId === item.id}
                  onClick={() => setDraft((value) => ({ ...value, profileId: item.id }))}
                  className="flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-lg font-extrabold">{item.label}</p>
                    <p className="text-sm text-slate-500">{item.description}</p>
                  </div>
                  <div className="text-right">
                    <span
                      className={cn(
                        'mt-2 inline-flex h-6 w-6 items-center justify-center rounded-full border',
                        draft.profileId === item.id
                          ? 'border-brand-500 bg-white text-slate-100'
                          : 'border-slate-300 bg-slate-100 text-slate-100',
                      )}
                    >
                      <Check className="h-4 w-4" />
                    </span>
                  </div>
                </ChoiceButton>
              ))}
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
                <div className="grid grid-cols-2 gap-2">
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
                </div>



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
                            'absolute z-20 rounded bg-brand-600 shadow-sm outline-none transition-colors',
                            draft.mullionOrientation === 'vertical'
                              ? 'bottom-2 top-2 w-3 -translate-x-1/2 cursor-col-resize'
                              : 'left-2 right-2 h-3 translate-y-1/2 cursor-row-resize',
                            isActive ? 'bg-brand-600' : 'hover:bg-brand-600',
                          )}
                          style={
                            draft.mullionOrientation === 'vertical'
                              ? { left: `${offsetPercent}%`, touchAction: 'none' }
                              : { bottom: `${offsetPercent}%`, touchAction: 'none' }
                          }
                        >
                          <span className="sr-only">Импост {mullionIndex}</span>
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
                                value={offset}
                                inputMode="numeric"
                                onChange={(event) => {
                                  const digits = Number.parseInt(event.target.value.replace(/\D/g, ''), 10);
                                  setMullionOffset(mullionIndex, Number.isFinite(digits) ? digits : offset);
                                }}
                                className="w-full border-none bg-transparent text-lg font-extrabold text-ink-800 outline-none"
                              />
                            </label>

                            <label className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                                {mullionSecondPartLabel}
                              </span>
                              <input
                                value={reverseOffset}
                                inputMode="numeric"
                                onChange={(event) => {
                                  const digits = Number.parseInt(event.target.value.replace(/\D/g, ''), 10);
                                  const nextReverseOffset = Number.isFinite(digits) ? digits : reverseOffset;
                                  setMullionOffset(mullionIndex, mullionAxisSize - nextReverseOffset);
                                }}
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
              <p className="text-sm text-slate-500">Выберите сторону и цвет окна</p>
            </div>

            <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-slate-100 p-1">
              {windowColorSideOptions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setDraft((value) => ({ ...value, windowColorSide: item.id }))}
                  className={cn(
                    'h-9 rounded-lg text-sm font-semibold transition-colors',
                    draft.windowColorSide === item.id
                      ? 'text-ink-800 shadow-sm'
                      : 'text-slate-500 hover:text-ink-700',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3">
              {windowColorOptions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setDraft((value) => ({ ...value, windowColor: item.id }))}
                  className="group text-left"
                >
                  <span
                    className={cn(
                      'mb-2 inline-flex h-16 w-16 items-center justify-center rounded-full border-2 border-transparent transition-all',
                      draft.windowColor === item.id ? 'border-brand-500 ring-2 ring-brand-200' : 'border-slate-200',
                    )}
                  >
                    <span
                      className={cn(
                        'inline-flex h-14 w-14 items-center justify-center rounded-full border border-slate-300 text-white',
                        item.swatchClassName,
                      )}
                    >
                      {draft.windowColor === item.id ? <Check className="h-5 w-5" /> : null}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'block text-xs font-semibold',
                      draft.windowColor === item.id ? 'text-brand-600' : 'text-slate-600 group-hover:text-ink-700',
                    )}
                  >
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div>
              <h2 className="text-2xl font-bold text-ink-800">Выбор ручки</h2>
              <p className="text-sm text-slate-500">Тип ручки и цвет фурнитуры</p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {handleTypeOptions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setDraft((value) => ({ ...value, handleType: item.id }))}
                  className={cn(
                    'rounded-xl border p-3 text-center transition-colors',
                    draft.handleType === item.id
                      ? 'border-brand-500 bg-brand-500 text-white'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300',
                  )}
                >
                  <span className="mx-auto mb-2 inline-flex h-12 w-12 items-center justify-center rounded-lg border border-current/30">
                    <span className="h-5 w-2 rounded-sm bg-current" />
                  </span>
                  <span className="block text-sm font-semibold">{item.label}</span>
                </button>
              ))}
            </div>

            <article className="rounded-xl border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-500">Цвет ручки</p>
                <p className="text-sm font-semibold text-brand-600">{currentHandleColor.label}</p>
              </div>
              <div className="flex items-center gap-3">
                {handleColorOptions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setDraft((value) => ({ ...value, handleColor: item.id }))}
                    className={cn(
                      'inline-flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all',
                      draft.handleColor === item.id ? 'border-brand-500 ring-2 ring-brand-100' : 'border-slate-200',
                    )}
                    aria-label={item.label}
                  >
                    <span className={cn('h-6 w-6 rounded-full border border-slate-300', item.swatchClassName)} />
                  </button>
                ))}
              </div>
            </article>
          </section>

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
                        <p className="mt-1 text-sm text-slate-500">{`${option.length ?? 0} x ${option.width ?? 0} мм`}</p>
                        {option.type === 'sill' ? (
                          <p className="text-sm text-slate-500">
                            Цвет: {sillColorOptions.find((item) => item.id === option.sillColor)?.label ?? 'Белый'}
                          </p>
                        ) : (
                          <p className="text-sm text-slate-500">Материал отлива задается на производстве</p>
                        )}
                      </div>
                      <p className="text-lg font-extrabold text-ink-800">{formatCurrency(getOptionPrice(option))}</p>
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

        <footer className="fixed bottom-0 left-1/2 z-50 w-[calc(100%-1rem)] max-w-[560px] -translate-x-1/2 border border-slate-200 bg-surface/95 px-4 pb-4 pt-3 shadow-panel backdrop-blur-sm">
          <div className="mb-3 flex items-end justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Стоимость</p>
              <p className="text-[38px] font-extrabold leading-none tracking-tight text-ink-800">
                {formatCurrency(totalPrice, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-brand-50 px-2 py-1 text-[11px] font-semibold text-brand-600">
              {currentWindowColor.label}
            </span>
          </div>
          <Button className="h-12 text-base" onClick={save}>
            Сохранить позицию
            <ChevronRight className="h-4 w-4" />
          </Button>
        </footer>
      </main>

      {isOptionDialogOpen ? (
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
                  onClick={() => setOptionForm((value) => ({ ...value, type: 'sill' }))}
                  className="h-11 text-center text-sm font-semibold"
                >
                  Подоконник
                </ChoiceButton>
                <ChoiceButton
                  type="button"
                  active={optionForm.type === 'drip'}
                  onClick={() => setOptionForm((value) => ({ ...value, type: 'drip' }))}
                  className="h-11 text-center text-sm font-semibold"
                >
                  Отлив
                </ChoiceButton>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Длина, мм</span>
                  <input
                    value={optionForm.length}
                    inputMode="numeric"
                    onChange={(event) =>
                      setOptionForm((value) => ({
                        ...value,
                        length: clampOptionLength(Number.parseInt(event.target.value.replace(/\D/g, '') || '300', 10)),
                      }))
                    }
                    className="w-full border-none bg-transparent text-lg font-extrabold text-ink-800 outline-none"
                  />
                </label>
                <label className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Ширина, мм</span>
                  <input
                    value={optionForm.width}
                    inputMode="numeric"
                    onChange={(event) =>
                      setOptionForm((value) => ({
                        ...value,
                        width: clampOptionWidth(Number.parseInt(event.target.value.replace(/\D/g, '') || '50', 10)),
                      }))
                    }
                    className="w-full border-none bg-transparent text-lg font-extrabold text-ink-800 outline-none"
                  />
                </label>
              </div>

              {optionForm.type === 'sill' ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Цвет подоконника</p>
                  <div className="grid grid-cols-3 gap-2">
                    {sillColorOptions.map((item) => (
                      <ChoiceButton
                        key={item.id}
                        type="button"
                        active={optionForm.sillColor === item.id}
                        onClick={() => setOptionForm((value) => ({ ...value, sillColor: item.id }))}
                        className="h-10 px-2 text-center text-xs font-semibold"
                      >
                        {item.label}
                      </ChoiceButton>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                  Для отлива выбор материала отключен.
                </div>
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

