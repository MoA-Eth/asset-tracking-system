import type { RenderOptions } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuthUser, UserRole } from '../types/asset-management';

export interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  initialUser?: AuthUser | null;
  initialRole?: UserRole;
  initialTab?: string;
}

export type WrapperProps = Readonly<{
  children: ReactNode;
}>;
