import React from 'react';
import { X, Download, ExternalLink } from 'lucide-react';

export default function SharedMediaModal({ media, onClose }) {
  if (!media) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative max-w-4xl max-h-[90vh] w-full flex flex-col items-center">
        {/* Controls */}
        <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
          <a
            href={media.url}
            target="_blank"
            rel="noopener noreferrer"
            download
            className="p-2 rounded-full bg-slate-900/70 hover:bg-slate-900 text-white transition-smooth"
            title="Mở tab mới / Tải về"
          >
            <ExternalLink className="w-5 h-5" />
          </a>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-slate-900/70 hover:bg-slate-900 text-white transition-smooth"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Media Preview */}
        <img
          src={media.url}
          alt="Ảnh chia sẻ"
          className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
        />

        {media.sender && (
          <div className="mt-3 px-4 py-1.5 rounded-full bg-slate-900/80 text-white text-xs font-medium">
            Gửi bởi: {media.sender} · {media.time}
          </div>
        )}
      </div>
    </div>
  );
}
