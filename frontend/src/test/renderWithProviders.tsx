import React, { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { ToastProvider } from '../context/ToastContext';
import { AuthProvider } from '../context/AuthContext';
import { UserRole } from '../types/asset-management';
import type { RenderWithProvidersOptions, WrapperProps } from './types';

export function renderWithProviders(
  ui: ReactElement,
  {
    initialUser = null,
    initialRole = UserRole.DATA_ENCODER,
    initialTab,
    ...renderOptions
  }: RenderWithProvidersOptions = {}
) {
  if (initialUser) {
    localStorage.setItem('moa_user', JSON.stringify({ ...initialUser, role: initialUser.role || initialRole }));
    localStorage.setItem('moa_token', 'mock-jwt-test-token');
  }
  if (initialTab) {
    localStorage.setItem('moa_active_tab', initialTab);
  }

  function Wrapper({ children }: WrapperProps) {
    return (
      <ToastProvider>
        <AuthProvider>
          {children}
        </AuthProvider>
      </ToastProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}
