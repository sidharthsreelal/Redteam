'use client';

import { AppProvider, useApp } from '@/lib/store';
import AuthScreen from '@/components/AuthScreen';
import Workspace from '@/components/Workspace';

function AppContent() {
  const { state } = useApp();

  if (!state.authenticated) {
    return <AuthScreen />;
  }

  return <Workspace />;
}

export default function Home() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
