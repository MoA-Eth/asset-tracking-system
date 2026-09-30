import React from 'react';
import { Building2 } from 'lucide-react';
import { SettingsPlaceholderPage } from './SettingsPlaceholderPage';

export const DepartmentsPage: React.FC = () => (
  <SettingsPlaceholderPage
    icon={Building2}
    title="Departments"
    titleAm="ዳይሬክቶሬቶች"
    description="Manage directorates and departments that receive and hold assets."
  />
);
