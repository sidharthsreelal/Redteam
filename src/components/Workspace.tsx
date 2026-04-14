'use client';

import { useState } from 'react';
import { useApp } from '@/lib/store';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import InputScreen from './InputScreen';
import NodeCanvas from './NodeCanvas';
import DetailPanel from './DetailPanel';

export default function Workspace() {
  const { state } = useApp();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen w-screen bg-void overflow-hidden">

      {/* ── Desktop sidebar ───────────────────────── */}
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      {/* ── Mobile sidebar overlay ────────────────── */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-void/80"
            onClick={() => setSidebarOpen(false)}
          />
          {/* Drawer */}
          <div className="relative z-10 w-[280px]">
            <Sidebar onNavigate={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* ── Main column ───────────────────────────── */}
      <div className="flex flex-1 h-full overflow-hidden min-w-0">
        <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">

          {/* Mobile top strip with hamburger */}
          <div
            className="lg:hidden flex items-center px-4 h-10 flex-shrink-0"
            style={{ borderBottom: '0.5px solid var(--color-stone)', background: 'var(--color-ink)' }}
          >
            <button
              onClick={() => setSidebarOpen(true)}
              className="font-mono text-[10px] text-ghost uppercase tracking-[0.15em] mr-4 hover:text-fog transition-colors"
              aria-label="Open sidebar"
            >
              ☰
            </button>
            <span className="font-mono text-[10px] text-ghost uppercase tracking-[0.15em]">
              RED TEAM
            </span>
          </div>

          {/* Top bar (active session only) */}
          {state.canvasState === 'active' && <TopBar />}

          {/* Canvas content */}
          <div className="flex-1 overflow-hidden">
            {(state.canvasState === 'empty' || state.canvasState === 'input') && (
              <InputScreen />
            )}
            {state.canvasState === 'active' && <NodeCanvas />}
          </div>
        </div>

        {/* Detail panel — desktop side, mobile bottom drawer */}
        {state.detailPanelOpen && <DetailPanel />}
      </div>
    </div>
  );
}
