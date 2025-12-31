import { useContext } from 'react';
import { AppAlertContext } from '@/components/AppAlertProvider';

export function useAppAlert() {
  const ctx = useContext(AppAlertContext);
  if (!ctx) {
    throw new Error('useAppAlert must be used within <AppAlertProvider />');
  }
  return ctx;
}


