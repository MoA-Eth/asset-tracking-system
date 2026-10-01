import React from 'react';
import { Construction, LucideIcon } from 'lucide-react';

interface SettingsPlaceholderPageProps {
  icon: LucideIcon;
  title: string;
  titleAm: string;
  description: string;
}

// Shared layout for Settings sections whose CRUD screens are not built yet.
export const SettingsPlaceholderPage: React.FC<SettingsPlaceholderPageProps> = ({
  icon: Icon,
  title,
  titleAm,
  description,
}) => (
  <div className="space-y-5 animate-fadeIn pb-16">
    {/* Page Header */}
    <div className="border-b border-slate-200 pb-4">
      <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
        <Icon className="w-5 h-5 text-emerald-700" />
        {title} ({titleAm})
      </h2>
      <p className="text-xs text-slate-500 mt-0.5">{description}</p>
    </div>

    <div className="p-10 rounded-2xl bg-white border border-dashed border-slate-300 text-center space-y-2">
      <Construction className="w-8 h-8 text-amber-600 mx-auto" />
      <h3 className="text-sm font-bold text-slate-900">{title} management is coming soon</h3>
      <p className="text-xs text-slate-500 max-w-md mx-auto">
        Creating, viewing, editing and removing {title.toLowerCase()} will be available here in a future release.
      </p>
    </div>
  </div>
);
