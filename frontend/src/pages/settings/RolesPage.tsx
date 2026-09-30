import React from 'react';
import { Shield } from 'lucide-react';
import { SettingsPlaceholderPage } from './SettingsPlaceholderPage';

export const RolesPage: React.FC = () => (
  <SettingsPlaceholderPage
    icon={Shield}
    title="Roles"
    titleAm="ሚናዎች"
    description="Define authorization roles and the permissions each role grants."
  />
);
