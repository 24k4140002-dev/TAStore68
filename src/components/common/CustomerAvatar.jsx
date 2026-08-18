import React, { useState } from 'react';
import { getInitials, getAvatarColor } from '../../services/facebookApi';

export default function CustomerAvatar({
  url,
  name,
  size = 'w-10 h-10',
  textClass = 'text-xs font-bold',
  className = ''
}) {
  const [hasError, setHasError] = useState(false);
  const initials = getInitials(name);
  const bgColor = getAvatarColor(name);

  if (!url || hasError) {
    return (
      <div
        className={`${size} rounded-full flex items-center justify-center text-white ${textClass} select-none shadow-xs flex-shrink-0 ${className}`}
        style={{ background: bgColor }}
      >
        {initials}
      </div>
    );
  }

  return (
    <div className={`${size} rounded-full overflow-hidden flex-shrink-0 bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 relative shadow-xs ${className}`}>
      <img
        src={url}
        alt={name || 'Avatar'}
        onError={() => setHasError(true)}
        className="w-full h-full object-cover"
        loading="lazy"
      />
    </div>
  );
}
