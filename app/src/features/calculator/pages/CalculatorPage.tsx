import { useEffect, useMemo, useState, type ButtonHTMLAttributes } from 'react';
import { ArrowLeft, Check, ChevronRight, Crown, Minus, Pencil, Plus, ShieldCheck, Trash2, Wallet, X, type LucideIcon } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  type AdditionalOptionType,
  type CalculatorAdditionalOption,
  type CalculatorPosition,
  type CalculatorSashConfig,
  type DrainageType,
  type DripMaterial,
  type HandlePosition,
  type OpeningMode,
  type OpeningType,
  type PackageType,
  type SashId,
  type SealColor,
  type SillColor,
  readCalculatorPositions,
  writeCalculatorPositions,
} from '@/features/calculator/model/positions.storage';
import { cn } from '@/shared/lib/cn';
import { formatCurrency } from '@/shared/lib/format';
import { Button } from '@/shared/ui/Button';
import { Toggle } from '@/shared/ui/Toggle';

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
  sashes: CalculatorSashConfig[];
  additionalOptions: CalculatorAdditionalOption[];
}

interface OptionFormState {
  type: AdditionalOptionType;
  length: number;
  width: number;
  sillColor: SillColor;
  dripMaterial: DripMaterial;
}

const withBase = (path: string): string => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;

const profileCatalog = [
  { id: 'rula-58', label: 'Rula 58мм', description: 'Базовый профиль', pricePerSquare: 3200 },
  { id: 'isotech-58', label: 'Isotech 58мм', description: 'Надежный вариант', pricePerSquare: 3500 },
  { id: 'grunder-60', label: 'Grunder 60 мм', description: 'Оптимальный баланс', pricePerSquare: 4100 },
  { id: 'wintech-70', label: 'Wintech 70мм', description: 'Теплый профиль', pricePerSquare: 4700 },
  { id: 'exprof-arctica', label: 'Exprof Arctica', description: 'Для холодных регионов', pricePerSquare: 4900 },
  { id: 'profecta-plus', label: 'Profecta Plus', description: 'Премиальная серия', pricePerSquare: 5600 },
] as const;

const openingTypes: Array<{ id: OpeningType; label: string; factor: number }> = [
  { id: 'single', label: '1 створка', factor: 1 },
  { id: 'double', label: '2 створки', factor: 1.48 },
  { id: 'triple', label: '3 створки', factor: 1.93 },
  { id: 'balcony', label: 'Балкон', factor: 2.12 },
];

const openingTypeImages: Record<OpeningType, string> = {
  single: withBase('/windows/1.png'),
  double: withBase('/windows/2.png'),
  triple: withBase('/windows/3.png'),
  balcony: withBase('/windows/4.png'),
};

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

const openingModes: Array<{ id: OpeningMode; label: string; price: number }> = [
  { id: 'fixed', label: 'Глухое', price: 0 },
  { id: 'turn', label: 'Поворотное', price: 900 },
  { id: 'tilt_turn', label: 'Поворотно-откидное', price: 1500 },
  { id: 'fanlight', label: 'Фрамужное', price: 700 },
];

const openingSashMap: Record<OpeningType, SashId[]> = {
  single: ['single'],
  double: ['left', 'right'],
  triple: ['left', 'center', 'right'],
  balcony: ['left', 'right'],
};

const sashLabels: Record<SashId, string> = {
  single: 'Створка',
  left: 'Левая',
  center: 'Центральная',
  right: 'Правая',
};

const handleLabels: Record<HandlePosition, string> = {
  none: 'Нет ручки',
  left: 'Слева',
  right: 'Справа',
  top: 'Сверху',
};

const sealColorOptions: Array<{ id: SealColor; label: string; extra: number }> = [
  { id: 'black', label: 'Черный', extra: 0 },
  { id: 'gray', label: 'Серый', extra: 180 },
  { id: 'white', label: 'Белый', extra: 220 },
];

const drainageOptions: Array<{ id: DrainageType; label: string; extra: number }> = [
  { id: 'bottom', label: 'Снизу', extra: 0 },
  { id: 'front', label: 'Спереди', extra: 180 },
  { id: 'hidden', label: 'Скрытое', extra: 420 },
];

const sillColorOptions: Array<{ id: SillColor; label: string; extra: number }> = [
  { id: 'white', label: 'Белый', extra: 0 },
  { id: 'brown', label: 'Коричневый', extra: 260 },
  { id: 'anthracite', label: 'Антрацит', extra: 380 },
];

const dripMaterialOptions: Array<{ id: DripMaterial; label: string; extra: number }> = [
  { id: 'aluminum', label: 'Алюминий', extra: 450 },
  { id: 'polyester', label: 'Полиэстер', extra: 260 },
  { id: 'galvanized', label: 'Оцинковка', extra: 120 },
];

const defaultDrainage: DrainageType = 'bottom';
const defaultSealColor: SealColor = 'black';
const mosquitoPatternStyle = {
  backgroundImage:
    'linear-gradient(rgba(148, 163, 184, 0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.22) 1px, transparent 1px)',
  backgroundSize: '8px 8px',
} as const;

const clampDimension = (value: number): number => Math.max(500, Math.min(3200, value));
const clampOptionLength = (value: number): number => Math.max(300, Math.min(6000, value));
const clampOptionWidth = (value: number): number => Math.max(50, Math.min(1000, value));
const normalizePositionId = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.trunc(value)) : null;
const isProfileId = (value: string | undefined): value is ProfileId => profileCatalog.some((item) => item.id === value);

const getOpeningModePrice = (mode: OpeningMode): number =>
  openingModes.find((item) => item.id === mode)?.price ?? 0;

const getDefaultHandlePosition = (mode: OpeningMode, sashId: SashId): HandlePosition => {
  if (mode === 'fixed') {
    return 'none';
  }
  if (mode === 'fanlight') {
    return 'top';
  }
  return sashId === 'right' ? 'left' : 'right';
};

const getHandleOptions = (mode: OpeningMode): HandlePosition[] => {
  if (mode === 'fixed') {
    return ['none'];
  }
  if (mode === 'fanlight') {
    return ['top'];
  }
  return ['left', 'right'];
};

const getOpeningModeLabel = (mode: OpeningMode | undefined): string =>
  openingModes.find((item) => item.id === mode)?.label ?? '—';

const getGridColumnsClass = (count: number): string => (count === 1 ? 'grid-cols-1' : count === 2 ? 'grid-cols-2' : 'grid-cols-3');

const createDefaultSash = (id: SashId, openingType: OpeningType): CalculatorSashConfig => {
  const mode =
    openingType === 'single'
      ? 'tilt_turn'
      : openingType === 'triple' && id === 'center'
        ? 'tilt_turn'
        : openingType === 'balcony' && id === 'right'
          ? 'turn'
          : id === 'left'
            ? 'turn'
            : 'fixed';

  return {
    id,
    mode,
    handlePosition: getDefaultHandlePosition(mode, id),
    mosquitoScreenEnabled: false,
  };
};

const normalizeSashes = (openingType: OpeningType, sashes: CalculatorSashConfig[]): CalculatorSashConfig[] => {
  const nextIds = openingSashMap[openingType];
  const byId = new Map(sashes.map((sash) => [sash.id, sash]));

  return nextIds.map((id, index) => {
    const fallback = byId.get(id) ?? sashes[index];
    const base = createDefaultSash(id, openingType);
    const mode = fallback?.mode ?? base.mode ?? 'fixed';
    const handleOptions = getHandleOptions(mode);
    const handlePosition =
      fallback?.handlePosition && handleOptions.includes(fallback.handlePosition)
        ? fallback.handlePosition
        : getDefaultHandlePosition(mode, id);

    return {
      id,
      mode,
      handlePosition,
      mosquitoScreenEnabled: fallback?.mosquitoScreenEnabled ?? base.mosquitoScreenEnabled ?? false,
    };
  });
};

const createLegacySashes = (position: CalculatorPosition, openingType: OpeningType): CalculatorSashConfig[] => {
  const next = normalizeSashes(openingType, []);
  const left = next.find((sash) => sash.id === 'single' || sash.id === 'left');
  const right = next.find((sash) => sash.id === 'right');

  if (left && position.leftSashMode) {
    left.mode = position.leftSashMode;
    left.handlePosition = getDefaultHandlePosition(position.leftSashMode, left.id);
    left.mosquitoScreenEnabled = position.mosquitoScreenEnabled ?? false;
  }

  if (right && position.rightSashMode) {
    right.mode = position.rightSashMode;
    right.handlePosition = getDefaultHandlePosition(position.rightSashMode, right.id);
  }

  return next;
};

const createDefaultDraft = (): DraftState => ({
  width: 1300,
  height: 1400,
  packageType: 'standard',
  openingType: 'double',
  profileId: 'grunder-60',
  drainage: defaultDrainage,
  sealColor: defaultSealColor,
  sashes: normalizeSashes('double', []),
  additionalOptions: [],
});

const createDefaultOptionForm = (): OptionFormState => ({
  type: 'sill',
  length: 1300,
  width: 300,
  sillColor: 'white',
  dripMaterial: 'aluminum',
});

const createDraftFromPosition = (position?: CalculatorPosition): DraftState => {
  const defaults = createDefaultDraft();

  if (!position) {
    return defaults;
  }

  const openingType = position.openingType ?? defaults.openingType;
  const sashes =
    position.sashes && position.sashes.length > 0
      ? normalizeSashes(openingType, position.sashes)
      : normalizeSashes(openingType, createLegacySashes(position, openingType));

  return {
    width: clampDimension(position.width ?? defaults.width),
    height: clampDimension(position.height ?? defaults.height),
    packageType: position.packageType ?? defaults.packageType,
    openingType,
    profileId: isProfileId(position.profileId) ? position.profileId : defaults.profileId,
    drainage: defaultDrainage,
    sealColor: defaultSealColor,
    sashes,
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

  const materialExtra = dripMaterialOptions.find((item) => item.id === option.dripMaterial)?.extra ?? 0;
  return Math.round(area * 6100 + materialExtra);
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
      'flex items-center justify-center gap-1 border px-3 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:hover:border-slate-200',
      active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-slate-50 hover:border-slate-300',
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
  const [activeSashId, setActiveSashId] = useState<SashId>('left');
  const [isOptionDialogOpen, setOptionDialogOpen] = useState(false);
  const [editingOptionId, setEditingOptionId] = useState<number | null>(null);
  const [optionForm, setOptionForm] = useState<OptionFormState>(() => createDefaultOptionForm());

  useEffect(() => {
    const storedPositions = state?.resetPositions ? [] : readCalculatorPositions();
    const nextPositionId =
      requestedPositionId ?? (storedPositions.length > 0 ? Math.max(...storedPositions.map((item) => item.id)) + 1 : 1);
    const currentPosition = storedPositions.find((item) => item.id === nextPositionId);
    const nextDraft = createDraftFromPosition(currentPosition);

    setPositions(storedPositions);
    setPositionId(nextPositionId);
    setDraft(nextDraft);
    setActiveSashId(openingSashMap[nextDraft.openingType][0]);
  }, [location.key, requestedPositionId, state?.resetPositions]);

  const currentProfile = profileCatalog.find((item) => item.id === draft.profileId) ?? profileCatalog[2];
  const currentPackage = packageOptions.find((item) => item.id === draft.packageType) ?? packageOptions[1];
  const currentOpening = openingTypes.find((item) => item.id === draft.openingType) ?? openingTypes[1];
  const previewSashIds = openingSashMap[draft.openingType];
  const sashIds = openingSashMap[draft.openingType];
  const activeSash = draft.sashes.find((sash) => sash.id === activeSashId) ?? draft.sashes[0];

  useEffect(() => {
    if (!sashIds.includes(activeSashId)) {
      setActiveSashId(sashIds[0]);
    }
  }, [activeSashId, sashIds]);

  const totalPrice = useMemo(() => {
    const area = (draft.width * draft.height) / 1_000_000;
    const sashPrice = draft.sashes.reduce((total, sash) => {
      const openingPrice = sash.mode ? getOpeningModePrice(sash.mode) : 0;
      const mosquitoPrice = sash.mosquitoScreenEnabled ? 900 : 0;
      return total + openingPrice + mosquitoPrice;
    }, 0);
    const sealExtra = sealColorOptions.find((item) => item.id === draft.sealColor)?.extra ?? 0;
    const drainageExtra = drainageOptions.find((item) => item.id === draft.drainage)?.extra ?? 0;
    const optionPrice = draft.additionalOptions.reduce((total, option) => total + getOptionPrice(option), 0);

    return Math.round((area * currentProfile.pricePerSquare * currentOpening.factor + sashPrice + sealExtra + drainageExtra + optionPrice) * currentPackage.factor);
  }, [currentOpening.factor, currentPackage.factor, currentProfile.pricePerSquare, draft]);

  const setOpeningType = (openingType: OpeningType): void => {
    setDraft((value) => ({
      ...value,
      openingType,
      sashes: normalizeSashes(openingType, value.sashes),
    }));
    setActiveSashId(openingSashMap[openingType][0]);
  };

  const setSashMode = (sashId: SashId, mode: OpeningMode): void => {
    setDraft((value) => ({
      ...value,
      sashes: value.sashes.map((sash) =>
        sash.id === sashId
          ? { ...sash, mode, handlePosition: getDefaultHandlePosition(mode, sashId) }
          : sash,
      ),
    }));
  };

  const setSashHandle = (sashId: SashId, handlePosition: HandlePosition): void => {
    setDraft((value) => ({
      ...value,
      sashes: value.sashes.map((sash) => (sash.id === sashId ? { ...sash, handlePosition } : sash)),
    }));
  };

  const toggleSashMosquito = (sashId: SashId): void => {
    setDraft((value) => ({
      ...value,
      sashes: value.sashes.map((sash) =>
        sash.id === sashId ? { ...sash, mosquitoScreenEnabled: !sash.mosquitoScreenEnabled } : sash,
      ),
    }));
  };

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
      dripMaterial: option.dripMaterial ?? 'aluminum',
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
      dripMaterial: optionForm.type === 'drip' ? optionForm.dripMaterial : undefined,
    };

    setDraft((value) => ({
      ...value,
      additionalOptions: [
        ...value.additionalOptions.filter((item) => item.id !== nextOption.id),
        nextOption,
      ].sort((first, second) => first.id - second.id),
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

  const save = (): void => {
    const leftSash = draft.sashes.find((sash) => sash.id === 'left' || sash.id === 'single');
    const rightSash = draft.sashes.find((sash) => sash.id === 'right');
    const nextPosition: CalculatorPosition = {
      id: positionId,
      width: draft.width,
      height: draft.height,
      price: totalPrice,
      packageType: draft.packageType,
      openingType: draft.openingType,
      profileId: draft.profileId,
      drainage: draft.drainage,
      sealColor: draft.sealColor,
      sashes: draft.sashes,
      additionalOptions: draft.additionalOptions,
      leftSashMode: leftSash?.mode,
      rightSashMode: rightSash?.mode,
      mosquitoScreenEnabled: draft.sashes.some((sash) => sash.mosquitoScreenEnabled),
    };
    const nextPositions = [...positions.filter((item) => item.id !== positionId), nextPosition].sort((a, b) => a.id - b.id);

    writeCalculatorPositions(nextPositions);
    navigate(returnTo, { state: { calculatorPositions: nextPositions } });
  };

  return (
    <div className="min-h-screen bg-page px-2 py-3">
      <main className="mx-auto w-full max-w-[576px] bg-surface shadow-panel">
        <header className="border-b border-slate-200 px-4 pb-4 pt-5">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => navigate(returnTo)}
              className="justify-self-start text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700 rounded-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Позиция {positionId}</p>
              <h1 className="text-base font-extrabold text-ink-800">Калькулятор</h1>
            </div>
            <button type="button" onClick={() => navigate(returnTo)} className="px-2 text-sm font-semibold text-slate-500 hover:text-ink-700">
              Отмена
            </button>
          </div>
        </header>

        <section className="space-y-5 px-4 pb-36 pt-4">
          <article className="border border-slate-200 bg-slate-50 px-4 py-4">
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
              <p className="text-[30px] mt-2 text-right font-extrabold leading-none text-ink-800">
                {formatCurrency(totalPrice, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
          </article>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">
              Тип конструкции
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {openingTypes.map((item) => (
                <ChoiceButton
                  key={item.id}
                  type="button"
                  active={draft.openingType === item.id}
                  onClick={() => setOpeningType(item.id)}
                  className="flex-col items-stretch justify-start"
                >
                  <span className="mb-3 flex h-14 items-center justify-center overflow-hidden rounded-lg px-2 py-1">
                    <img src={openingTypeImages[item.id]} alt={item.label} className="h-full w-full object-contain" />
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
                  className="inline-flex h-12 w-12 items-center justify-center border border-slate-300 bg-slate-50 text-slate-600"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <label className="flex h-12 flex-1 items-center justify-center gap-2 border border-brand-400 bg-slate-50 px-3">
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
                  className="inline-flex h-12 w-12 items-center justify-center border border-slate-300 bg-slate-50 text-slate-600"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setDraft((value) => ({ ...value, height: clampDimension(value.height - 50) }))}
                  className="inline-flex h-12 w-12 items-center justify-center border border-slate-300 bg-slate-50 text-slate-600"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <label className="flex h-12 flex-1 items-center justify-center gap-2 border border-slate-300 bg-slate-50 px-3">
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
                  className="inline-flex h-12 w-12 items-center justify-center border border-slate-300 bg-slate-50 text-slate-600"
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
                      active={defaultDrainage === item.id}
                      disabled
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
                      active={defaultSealColor === item.id}
                      disabled
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
              <h2 className="text-2xl font-bold">
                Профильная система
              </h2>
            <div className="grid grid-cols-1 gap-2">
              {packageOptions.map((item) => (
                (() => {
                  const Icon = packageIcons[item.id];

                  return (
                    <ChoiceButton
                      key={item.id}
                      type="button"
                      active={draft.packageType === item.id}
                      onClick={() => setDraft((value) => ({ ...value, packageType: item.id }))}
                      className="h-14 flex gap-2 text-sm font-semibold"
                    >
                      <Icon className="h-5 w-5" />
                      {item.label}
                    </ChoiceButton>
                  );
                })()
              ))}
            </div>

            <div className=" grid grid-cols-1 space-y-2 gap-1">
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
                    {/* <p className="text-lg font-extrabold">{formatCurrency(item.pricePerSquare)}/м²</p> */}
                    <span
                      className={cn(
                        'mt-2 inline-flex h-6 w-6 items-center justify-center border rounded-full',
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
              <h2 className="text-2xl font-bold">
              Конфигурация створок
            </h2>
          <section className="space-y-4  bg-slate-50 px-3 py-3">

            <div className="relative rounded-xl border border-slate-200 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="flex justify-between items-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Визуализация
                      <span className="inline-flex items-center border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-500">
                        {currentOpening.label}
                      </span>
                    </p>
                  <p className="text-sm text-slate-500">Нажмите на нужную створку прямо на схеме</p>
                </div>

              </div>

              <div>
                <div className={cn('flex h-64 overflow-x-auto gap-1', getGridColumnsClass(previewSashIds.length))}>
                  {previewSashIds.map((sashId) => {
                    const sash = draft.sashes.find((item) => item.id === sashId);
                    const mode = sash?.mode ?? 'fixed';
                    const handlePosition = sash?.handlePosition ?? getDefaultHandlePosition(mode, sashId);
                    const isActive = activeSashId === sashId;
                    const mosquitoEnabled = sash?.mosquitoScreenEnabled ?? false;
                    const isTwoItems = previewSashIds.length === 2;

                    return (
                      <button
                        key={`preview-${sashId}`}
                        type="button"
                        onClick={() => setActiveSashId(sashId)}
                        className={cn(
                          'relative rounded-0 text-left transition-all',
                          //  index !== 0 && 'ml-[-2px]'
                          isTwoItems ? 'w-[calc(50%-2px)]' : 'min-w-36',
                          isActive
                            ? 'z-40'
                            : 'opacity-20',
                        )}
                      >


                        <span className="absolute left-0 w-full top-2 flex items-center justify-between gap-2">
                          <span className={cn('text-[10px] font-semibold uppercase tracking-[0.18em]', isActive ? 'text-brand-600' : 'text-slate-500')}>
                            {sashLabels[sashId]}
                          </span>
                          {mosquitoEnabled ? (
                            <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-600">
                              Сетка
                            </span>
                          ) : null}
                        </span>

                        <span className="absolute inset-y-8 rounded-sm overflow-hidden border-2 border-white">
                          <img className="h-full w-full object-cover rounded-none opacity-50" src="/back.jpg" alt="" />
                            {mode === 'fixed' ? <span className="absolute h-full top-0 left-0 w-full rounded-[2px] bg-slate-100/80" /> : null}
                              {mosquitoEnabled ? <span className="absolute h-full w-full top-0 left-0 z-10 opacity-40" style={mosquitoPatternStyle} /> : null}
                        </span>




                        {(mode === 'turn' || mode === 'tilt_turn') ? (
                          <span
                            className={cn(
                              'absolute inset-y-8 w-5  border-brand-400/70',
                              handlePosition === 'left'
                                ? 'left-0 border-l-2 rounded-none'
                                : 'right-0 border-r-2 rounded-none',
                            )}
                          />
                        ) : null}

                        {mode === 'tilt_turn' ? (
                          <span className="absolute w-full top-8 h-1 rounded-t-[2px] border-x-2 border-t-2 border-brand-400/70" />
                        ) : null}

                        {mode === 'fanlight' ? (
                          <span className="absolute w-full top-8 h-1 rounded-t-[2px] border-x-2 border-t-2 border-brand-400/70" />
                        ) : null}

                        {handlePosition !== 'none' ? (
                          <span
                            className={cn(
                              'absolute rounded-full bg-brand-500',
                              handlePosition === 'left' ? 'left-0 top-1/2 h-8 w-[6px] -translate-y-1/2' : null,
                              handlePosition === 'right' ? 'right-0 mr-[-2px] top-1/2 h-8 w-[6px] -translate-y-1/2' : null,
                              handlePosition === 'top' ? 'left-1/2 top-8 mt-[-1px] h-[4px] w-8 -translate-x-1/2' : null,
                            )}
                          />
                        ) : null}

                        <span className="absolute l-0 bottom-2 rounded-lg  text-[11px] font-semibold text-slate-600 backdrop-blur-sm">
                          {getOpeningModeLabel(sash?.mode)}
                        </span>
                      </button>
                    );
                  })}
                </div>

              </div>
            </div>



            <div className="grid grid-cols-2 gap-2">
              {openingModes.map((item) => (
                <ChoiceButton
                  key={item.id}
                  type="button"
                  active={activeSash?.mode === item.id}
                  onClick={() => activeSash && setSashMode(activeSash.id, item.id)}
                >
                  <p className="text-sm font-extrabold">{item.label}</p>
                  <p className="mt-1 text-xs text-slate-500">+{formatCurrency(item.price)}</p>
                </ChoiceButton>
              ))}
            </div>

            {activeSash ? (
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Ручка</p>
                  <div className={cn('grid gap-2', getHandleOptions(activeSash.mode ?? 'fixed').length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
                    {getHandleOptions(activeSash.mode ?? 'fixed').map((item) => (
                      <ChoiceButton
                        key={item}
                        type="button"
                        active={activeSash.handlePosition === item}
                        onClick={() => setSashHandle(activeSash.id, item)}
                        className="h-10 px-2 text-center text-sm font-semibold"
                      >
                        {handleLabels[item]}
                      </ChoiceButton>
                    ))}
                  </div>
                </div>

                <div className="flex items-end">
                  <div className="w-full rounded-xl border px-3 py-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-ink-700">Москитная сетка</p>
                        <p className="text-xs text-slate-500">{sashLabels[activeSash.id]} створка</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={activeSash.mosquitoScreenEnabled ?? false}
                        aria-label="Toggle mosquito screen"
                        className="inline-flex"
                        onClick={() => toggleSashMosquito(activeSash.id)}
                      >
                        <Toggle checked={activeSash.mosquitoScreenEnabled ?? false} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          <section className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3">
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
                        <p className="text-sm text-slate-500">
                          {option.type === 'sill'
                            ? `Цвет: ${sillColorOptions.find((item) => item.id === option.sillColor)?.label ?? 'Белый'}`
                            : `Материал: ${dripMaterialOptions.find((item) => item.id === option.dripMaterial)?.label ?? 'Алюминий'}`}
                        </p>
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
              <div className="rounded-xl border border-dashed border-slate-300  px-4 py-6 text-center text-slate-500">
                Пока дополнительные опции не добавлены
              </div>
            )}
          </section>
        </section>

        <footer className="fixed z-50 bottom-0 left-1/2 z-10 w-[calc(100%-1rem)] max-w-[560px] -translate-x-1/2 border border-slate-200 bg-surface/95 px-4 pb-4 pt-3 shadow-panel backdrop-blur-sm">
          <div className="mb-3 flex items-end justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Стоимость</p>
              <p className="text-[38px] font-extrabold leading-none tracking-tight text-ink-800">
                {formatCurrency(totalPrice, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 border border-slate-300 bg-brand-50 px-2 py-1 text-[11px] font-semibold text-brand-600">
              {currentOpening.label}
            </span>
          </div>
          <Button className="h-12 text-base" onClick={save}>
            Сохранить позицию
            <ChevronRight className="h-4 w-4" />
          </Button>
        </footer>
      </main>

      {isOptionDialogOpen ? (
        <div className="fixed z-50 inset-0 z-20 flex items-end justify-center bg-slate-900/40 p-3 sm:items-center">
          <div className="w-full z-100 max-w-[540px] rounded-xl bg-surface p-4 shadow-panel">
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
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Материал отлива</p>
                  <div className="grid grid-cols-3 gap-2">
                    {dripMaterialOptions.map((item) => (
                      <ChoiceButton
                        key={item.id}
                        type="button"
                        active={optionForm.dripMaterial === item.id}
                        onClick={() => setOptionForm((value) => ({ ...value, dripMaterial: item.id }))}
                        className="h-10 px-2 text-center text-xs font-semibold"
                      >
                        {item.label}
                      </ChoiceButton>
                    ))}
                  </div>
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
