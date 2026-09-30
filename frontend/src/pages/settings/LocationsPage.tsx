import React from 'react';
import { MapPin } from 'lucide-react';
import { SettingsPlaceholderPage } from './SettingsPlaceholderPage';

export const LocationsPage: React.FC = () => (
  <SettingsPlaceholderPage
    icon={MapPin}
    title="Locations"
    titleAm="አድራሻዎች"
    description="Manage sites, buildings and rooms where assets are kept."
  />
);
