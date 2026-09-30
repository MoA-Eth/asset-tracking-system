import React from 'react';
import { UserCheck } from 'lucide-react';
import { SettingsPlaceholderPage } from './SettingsPlaceholderPage';

export const EmployeesPage: React.FC = () => (
  <SettingsPlaceholderPage
    icon={UserCheck}
    title="Employees"
    titleAm="ሰራተኞች"
    description="Maintain the civil servant registry used for custody and approvals."
  />
);
