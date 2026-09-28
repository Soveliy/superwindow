import { Download, FileText, Image as ImageIcon, Paperclip } from 'lucide-react';
import type { LeadAttachment } from '@/features/leads/model/leads.types';
import { DetailSection } from '@/features/leads/ui/LeadDetailsSection';
import { formatFileSize } from '@/features/leads/ui/leads-format';

interface AttachmentsPanelProps {
  attachments: LeadAttachment[];
}

export const AttachmentsPanel = ({ attachments }: AttachmentsPanelProps) => (
  <DetailSection title="Прикреплённые файлы" icon={Paperclip}>
    {attachments.length > 0 ? (
      <ul className="grid grid-cols-2 gap-4">
        {attachments.map((attachment) => (
          <li key={attachment.id}>
            <a
              href={attachment.url}
              target="_blank"
              rel="noreferrer"
              className="group flex h-full min-w-0 flex-col text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              aria-label={`Открыть файл ${attachment.name}`}
            >
              {attachment.kind === 'image' && (attachment.thumbnailUrl || attachment.url) ? (
                <img
                  src={attachment.thumbnailUrl || attachment.url}
                  alt=""
                  className="aspect-[4/3] w-full rounded-sm border border-slate-300 object-cover"
                  loading="lazy"
                />
              ) : (
                <span className="flex aspect-[4/3] w-full items-center justify-center rounded-sm border border-slate-300 bg-slate-50 text-ink-800">
                  {attachment.kind === 'image' ? (
                    <ImageIcon className="h-7 w-7" aria-hidden="true" />
                  ) : (
                    <span className="flex flex-col items-center gap-1"><FileText className="h-8 w-8" aria-hidden="true" />{attachment.name.toLowerCase().endsWith('.pdf') ? <span className="text-[10px] font-extrabold">PDF</span> : null}</span>
                  )}
                </span>
              )}
              <span className="flex min-w-0 flex-1 flex-col py-2">
                <span className="line-clamp-2 break-all text-xs text-slate-600">{attachment.name}</span>
                {attachment.size ? <span className="mt-1 text-xs text-slate-500">{formatFileSize(attachment.size)}</span> : null}
                <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-ink-700 group-hover:underline">
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  Открыть
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-sm text-slate-500">Файлы к лиду не прикреплены.</p>
    )}
  </DetailSection>
);
