import React from 'react';
import { Warehouse } from 'lucide-react';
import { SettingsPlaceholderPage } from './SettingsPlaceholderPage';

export const StoresPage: React.FC = () => (
  <SettingsPlaceholderPage
    icon={Warehouse}
    title="Stores"
    titleAm="መጋዘኖች"
    description="Manage central and regional stores that receive and issue stock."
  />
);
