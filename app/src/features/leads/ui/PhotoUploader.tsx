import { useRef, useState } from 'react';
import { Camera, ImagePlus, Trash2, UploadCloud } from 'lucide-react';
import type { WorkPhotoInput } from '@/features/leads/model/leads.types';
import { formatFileSize } from '@/features/leads/ui/leads-format';

interface PhotoUploaderProps {
  value: WorkPhotoInput[];
  onChange: (value: WorkPhotoInput[]) => void;
  disabled?: boolean;
  error?: string;
}

const MAX_PHOTO_SIZE = 10 * 1024 * 1024;
const MAX_PHOTO_COUNT = 10;
const MAX_OPTIMIZED_PHOTO_SIZE = 1024 * 1024;
const MAX_TOTAL_PHOTO_SIZE = 4 * 1024 * 1024;
const SUPPORTED_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const readBlobAsDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Не удалось подготовить фотографию.'));
    reader.readAsDataURL(blob);
  });

const canvasToJpeg = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Браузер не смог обработать фотографию.'))),
      'image/jpeg',
      quality,
    );
  });

const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Не удалось открыть изображение «${file.name}».`));
    };
    image.src = url;
  });

const renderOptimizedPhoto = async (
  image: HTMLImageElement,
  maxDimension: number,
  quality: number,
): Promise<Blob> => {
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Браузер не поддерживает подготовку фотографий.');
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvasToJpeg(canvas, quality);
};

const optimizePhoto = async (file: File): Promise<WorkPhotoInput> => {
  const image = await loadImage(file);
  let blob = await renderOptimizedPhoto(image, 1600, 0.8);

  if (blob.size > MAX_OPTIMIZED_PHOTO_SIZE) {
    blob = await renderOptimizedPhoto(image, 1280, 0.68);
  }

  if (blob.size > MAX_OPTIMIZED_PHOTO_SIZE) {
    throw new Error(`Не удалось уменьшить «${file.name}» до 1 МБ. Выберите другое фото.`);
  }

  return {
    name: file.name.replace(/\.[^.]+$/, '') + '.jpg',
    mimeType: 'image/jpeg',
    size: blob.size,
    dataUrl: await readBlobAsDataUrl(blob),
  };
};

export const PhotoUploader = ({ value, onChange, disabled = false, error }: PhotoUploaderProps) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [localError, setLocalError] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const addFiles = async (files: FileList | File[]): Promise<void> => {
    setLocalError('');
    const selected = Array.from(files);
    if (value.length + selected.length > MAX_PHOTO_COUNT) {
      setLocalError(`Можно добавить не больше ${MAX_PHOTO_COUNT} фотографий.`);
      return;
    }

    const unsupported = selected.find((file) => !SUPPORTED_PHOTO_TYPES.has(file.type.toLowerCase()));
    if (unsupported) {
      setLocalError('Поддерживаются только фотографии JPEG, PNG и WebP. HEIC перед загрузкой нужно сохранить как JPEG.');
      return;
    }

    const tooLarge = selected.find((file) => file.size > MAX_PHOTO_SIZE);
    if (tooLarge) {
      setLocalError(`Файл «${tooLarge.name}» больше 10 МБ.`);
      return;
    }

    try {
      const nextPhotos: WorkPhotoInput[] = [];
      for (const file of selected) {
        nextPhotos.push(await optimizePhoto(file));
      }

      const totalSize = [...value, ...nextPhotos].reduce((sum, photo) => sum + photo.size, 0);
      if (totalSize > MAX_TOTAL_PHOTO_SIZE) {
        setLocalError('Общий размер фотоотчёта после оптимизации не должен превышать 4 МБ.');
        return;
      }

      onChange([...value, ...nextPhotos]);
    } catch (caughtError) {
      setLocalError(caughtError instanceof Error ? caughtError.message : 'Не удалось добавить фото.');
    }
  };

  const message = error || localError;

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="sr-only"
        disabled={disabled || value.length >= MAX_PHOTO_COUNT}
        onChange={(event) => {
          if (event.target.files) {
            void addFiles(event.target.files);
          }
          event.target.value = '';
        }}
        aria-label="Загрузить фотографии выполненной работы"
      />

      <button
        type="button"
        disabled={disabled || value.length >= MAX_PHOTO_COUNT}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          void addFiles(event.dataTransfer.files);
        }}
        className={`flex min-h-28 w-full flex-col items-center justify-center rounded-sm border-2 border-dashed px-4 py-4 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          isDragging ? 'border-brand-500 bg-brand-100' : 'border-slate-300 bg-slate-100 hover:border-slate-400'
        }`}
      >
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface text-ink-700">
          <Camera className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="mt-2 text-sm font-semibold text-ink-700">Нажмите, чтобы добавить фото</span>
        <span className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500">
          <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" />
          JPEG, PNG или WebP · до 10 фото
        </span>
      </button>

      {message ? <p className="mt-2 text-xs font-semibold text-error" role="alert">{message}</p> : null}

      {value.length > 0 ? (
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Добавленные фото">
          {value.map((photo, index) => (
            <li key={`${photo.name}-${photo.size}-${index}`} className="relative overflow-hidden rounded-xl border border-slate-300 bg-slate-100">
              {photo.dataUrl ? (
                <img src={photo.dataUrl} alt={`Фото ${index + 1}: ${photo.name}`} className="aspect-square w-full object-cover" />
              ) : (
                <span className="flex aspect-square items-center justify-center text-slate-400">
                  <ImagePlus className="h-7 w-7" aria-hidden="true" />
                </span>
              )}
              <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                <span className="min-w-0 truncate text-[10px] text-slate-500" title={photo.name}>
                  {formatFileSize(photo.size)}
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(value.filter((_, photoIndex) => photoIndex !== index))}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-error hover:bg-error/10"
                  aria-label={`Удалить фото ${photo.name}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};
