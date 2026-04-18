'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import type { ApiCallLog } from '@/lib/types';
import Backdrop from './Backdrop';

// ── Provider config ────────────────────────────────────────────────────────────
const PROVIDER_COLORS: Record<string, { dot: string; label: string; badge: string; border: string }> = {
  gemini: { dot: '#34A853', label: '#34A853', badge: 'rgba(52,168,83,0.12)', border: 'rgba(52,168,83,0.35)' },
  mistral: { dot: '#EF6C00', label: '#F97316', badge: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.35)' },
  codestral: { dot: '#A78BFA', label: '#A78BFA', badge: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.35)' },
};

const PROVIDER_ICONS: Record<string, string> = {
  gemini: '✦',
  mistral: '𝐌',
  codestral: '⑆',
};

// ── Model lists ────────────────────────────────────────────────────────────────
const GEMINI_MODELS: { id: string; tag?: string }[] = [
  { id: 'gemini-3.1-flash-lite-preview', tag: 'DEFAULT' },
  { id: 'gemini-3-flash-preview', tag: 'NEW•STABLE' },
  { id: 'gemini-3.1-pro-preview', tag: 'NEW•PRO' },
  { id: 'gemini-2.5-flash-lite', tag: 'FAST' },
  { id: 'gemini-2.5-flash', tag: 'STABLE' },
  { id: 'gemini-2.5-pro', tag: 'PRO' },
  { id: 'gemma-4-31b-it', tag: 'OPEN•PRO' },
  { id: 'gemma-4-26b-a4b-it', tag: 'OPEN' },
];

const MISTRAL_MODELS: { id: string; tag?: string }[] = [
  { id: 'mistral-medium-latest', tag: 'DEFAULT' },
  { id: 'mistral-medium-2505', tag: 'STABLE' },
  { id: 'mistral-large-2411', tag: 'PRO' },
  { id: 'mistral-large-latest', tag: 'NEW•PRO' },
  { id: 'magistral-small-latest', tag: 'REASONING' },
  { id: 'devstral-latest', tag: 'NEW•CODE' },
  { id: 'devstral-2512', tag: 'CODE' },
];

// ── localStorage config ────────────────────────────────────────────────────────
export interface ApiConfig {
  primary: 'gemini' | 'mistral';
  geminiModel: string;
  mistralModel: string;
}

const CONFIG_KEY = 'redteam_api_config';

const DEFAULT_CONFIG: ApiConfig = {
  primary: 'gemini',
  geminiModel: 'gemini-3.1-flash-lite-preview',
  mistralModel: 'mistral-medium-latest',
};

function loadConfig(): ApiConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const stored = JSON.parse(raw) as Partial<ApiConfig>;
    // Migrate: reset any stored model that is no longer in the current model list
    const validGemini = new Set(GEMINI_MODELS.map((m) => m.id));
    const validMistral = new Set(MISTRAL_MODELS.map((m) => m.id));
    if (stored.geminiModel && !validGemini.has(stored.geminiModel)) stored.geminiModel = DEFAULT_CONFIG.geminiModel;
    if (stored.mistralModel && !validMistral.has(stored.mistralModel)) stored.mistralModel = DEFAULT_CONFIG.mistralModel;
    return { ...DEFAULT_CONFIG, ...stored };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function saveConfig(cfg: ApiConfig) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  } catch { /* silent */ }
}

// ── Hook: expose config globally so store can pick it up ──────────────────────
// We store it in a module-level ref so it can be accessed from outside React.
let _globalConfig: ApiConfig = DEFAULT_CONFIG;
export function getApiConfig(): ApiConfig { return _globalConfig; }

// ── Helpers ────────────────────────────────────────────────────────────────────
function timeStr(ts: number) {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function shortFramework(id: string) {
  if (id.includes(':')) {
    const [contPart, fPart] = id.split(':');
    const n = contPart.replace('cont', '');
    return `CONT${n}·${fPart.toUpperCase().slice(0, 8)}`;
  }
  return id.replace(/-/g, ' ').toUpperCase().slice(0, 14);
}

// ── Log Row ────────────────────────────────────────────────────────────────────
function LogRow({ entry }: { entry: ApiCallLog }) {
  const colors = PROVIDER_COLORS[entry.provider] || PROVIDER_COLORS.mistral;
  const icon = PROVIDER_ICONS[entry.provider] || '?';
  return (
    <div
      className="grid grid-cols-[12px_80px_1fr_90px_55px] items-center gap-x-5 px-4 py-1.5 border-b"
      style={{ borderColor: 'var(--color-stone)' }}
    >
      {/* 1. Status */}
      <div className="flex justify-center">
        <span style={{ color: colors.dot, fontSize: 8 }}>●</span>
      </div>

      {/* 2. Provider */}
      <div>
        <span
          className="font-mono text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm inline-flex items-center gap-1"
          style={{
            background: colors.badge,
            border: `0.5px solid ${colors.border}`,
            color: colors.label,
          }}
        >
          {icon} {entry.provider}
          {entry.fallback && <span className="opacity-70">↩</span>}
        </span>
      </div>

      {/* 3. Model */}
      <div className="min-w-0">
        <span className="font-mono text-[9px] text-ghost truncate block" title={entry.model}>
          {entry.model}
        </span>
      </div>

      {/* 4. Framework */}
      <div className="min-w-0">
        <span
          className="font-mono text-[9px] text-mist truncate block text-left opacity-80"
          title={entry.frameworkId}
        >
          {shortFramework(entry.frameworkId)}
        </span>
      </div>

      {/* 5. Time */}
      <div className="text-right">
        <span className="font-mono text-[9px] text-ghost opacity-40">
          {timeStr(entry.timestamp)}
        </span>
      </div>
    </div>
  );
}

// ── Model Dropdown ─────────────────────────────────────────────────────────────
const TAG_COLORS: Record<string, { bg: string; color: string }> = {
  DEFAULT: { bg: 'rgba(59,130,246,0.15)', color: '#60A5FA' },
  ALIAS: { bg: 'rgba(107,114,128,0.2)', color: '#9CA3AF' },
  PREV: { bg: 'rgba(107,114,128,0.15)', color: '#6B7280' },
  STABLE: { bg: 'rgba(16,185,129,0.12)', color: '#34D399' },
  'NEW•STABLE': { bg: 'rgba(16,185,129,0.12)', color: '#34D399' },
  FAST: { bg: 'rgba(16,185,129,0.12)', color: '#34D399' },
  PREVIEW: { bg: 'rgba(245,158,11,0.15)', color: '#FCD34D' },
  PRO: { bg: 'rgba(139,92,246,0.15)', color: '#A78BFA' },
  'NEW•PRO': { bg: 'rgba(139,92,246,0.15)', color: '#A78BFA' },
  POWERFUL: { bg: 'rgba(139,92,246,0.15)', color: '#A78BFA' },
  REASONING: { bg: 'rgba(236,72,153,0.15)', color: '#F472B6' },
  CODE: { bg: 'rgba(6,182,212,0.12)', color: '#22D3EE' },
  'NEW•CODE': { bg: 'rgba(6,182,212,0.12)', color: '#22D3EE' },
  OPEN: { bg: 'rgba(249,115,22,0.15)', color: '#FB923C' },
  'OPEN•PRO': { bg: 'rgba(249,115,22,0.15)', color: '#FB923C' },
};

function ModelDropdown({
  options,
  selected,
  onSelect,
  activeModeAccent,
}: {
  options: { id: string; tag?: string }[];
  selected: string;
  onSelect: (id: string) => void;
  activeModeAccent?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const current = options.find((o) => o.id === selected) || options[0];

  return (
    <div className="relative" ref={ref}>
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-2 py-1.5 w-full transition-all"
        style={{
          background: 'var(--color-void)',
          border: '0.5px solid var(--color-stone)',
          borderRadius: 2,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--color-ash)')}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--color-stone)')}
      >
        <span className="font-mono text-[10px] text-cloud flex-1 text-left">
          {current.id}
        </span>
        {current.tag && (() => {
          const tc = TAG_COLORS[current.tag] ?? TAG_COLORS.ALIAS;
          return (
            <span
              className="font-mono text-[8px] uppercase tracking-[0.1em] px-1 py-0.5 rounded-sm flex-shrink-0"
              style={{ background: tc.bg, color: tc.color }}
            >
              {current.tag}
            </span>
          );
        })()}
        <span className="font-mono text-[9px] text-ghost flex-shrink-0">▾</span>
      </button>

      {/* Dropdown list */}
      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-0.5 fade-in overflow-y-auto"
          style={{
            background: 'var(--color-ink)',
            border: '0.5px solid var(--color-stone)',
            borderRadius: 2,
            minWidth: 280,
            maxHeight: 240,
          }}
        >
          {options.map((opt) => {
            const isSelected = opt.id === selected;
            const tc = opt.tag ? (TAG_COLORS[opt.tag] ?? TAG_COLORS.ALIAS) : null;
            const accent = activeModeAccent || '#3B82F6';
            
            return (
              <button
                key={opt.id}
                onClick={() => { onSelect(opt.id); setOpen(false); }}
                className="w-full flex items-center justify-between px-3 py-2 transition-colors group"
                style={{
                  borderLeft: isSelected ? `0.5px solid ${accent}` : '0.5px solid transparent',
                  background: isSelected ? `linear-gradient(90deg, color-mix(in srgb, ${accent} 10%, transparent), transparent)` : 'transparent',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = `linear-gradient(90deg, color-mix(in srgb, ${accent} 10%, transparent), transparent)`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isSelected ? `linear-gradient(90deg, color-mix(in srgb, ${accent} 10%, transparent), transparent)` : 'transparent';
                }}
              >
                <div className="flex items-center">
                  <span
                    className="font-mono text-left"
                    style={{ fontSize: 10, color: isSelected ? accent : 'var(--color-cloud)' }}
                  >
                    {opt.id}
                  </span>
                  {tc && (
                    <span
                      className="font-mono text-[8px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-sm flex-shrink-0 ml-3"
                      style={{ background: tc.bg, color: tc.color }}
                    >
                      {opt.tag}
                    </span>
                  )}
                </div>
                
                {/* Mode dot replacement for blue line */}
                <span
                  className="flex-shrink-0 ml-3"
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: accent,
                    opacity: isSelected ? 1 : 0.4,
                    transition: 'opacity 150ms ease',
                  }}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Models Tab ─────────────────────────────────────────────────────────────────
function ModelsTab({
  config,
  onChange,
  activeModeAccent,
}: {
  config: ApiConfig;
  onChange: (cfg: ApiConfig) => void;
  activeModeAccent?: string;
}) {
  const secondary = config.primary === 'gemini' ? 'mistral' : 'gemini';
  const primColors = PROVIDER_COLORS[config.primary];
  const secColors = PROVIDER_COLORS[secondary];

  const handleSwap = () => {
    onChange({ ...config, primary: secondary });
  };

  return (
    <div className="overflow-y-auto flex-1 flex flex-col" style={{ fontSize: 11 }}>
      {/* Section 1 — Provider Priority */}
      <div className="px-3 py-3">
        <div className="flex items-center justify-between">
          {/* Primary */}
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-ghost">Primary</span>
            <span
              className="font-mono text-[9px] px-1.5 py-0.5 rounded-sm inline-flex items-center gap-1"
              style={{
                background: primColors.badge,
                border: `0.5px solid ${primColors.border}`,
                color: primColors.label,
              }}
            >
              <span>●</span> {PROVIDER_ICONS[config.primary]} {config.primary.charAt(0).toUpperCase() + config.primary.slice(1)}
            </span>
          </div>

          {/* Swap button */}
          <button
            onClick={handleSwap}
            title="Swap primary and fallback"
            className="swap-btn flex items-center justify-center transition-all duration-300"
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: '0.5px solid var(--color-stone)',
              background: 'var(--color-void)',
              color: 'var(--color-ghost)',
              fontSize: 14,
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-ash)';
              e.currentTarget.style.transform = 'rotate(180deg)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-stone)';
              e.currentTarget.style.transform = 'rotate(0deg)';
            }}
          >
            ⇄
          </button>

          {/* Fallback */}
          <div className="flex flex-col gap-1 items-end">
            <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-ghost">Fallback</span>
            <span
              className="font-mono text-[9px] px-1.5 py-0.5 rounded-sm inline-flex items-center gap-1"
              style={{
                background: secColors.badge,
                border: `0.5px solid ${secColors.border}`,
                color: secColors.label,
              }}
            >
              <span>●</span> {PROVIDER_ICONS[secondary]} {secondary.charAt(0).toUpperCase() + secondary.slice(1)}
            </span>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ borderTop: '0.5px solid var(--color-stone)' }} />

      {/* Section 2 — Per-Provider Model Selection */}
      <div className="px-3 py-3 flex flex-col gap-3">
        {/* Gemini row */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[11px] text-cloud">Gemini</span>
            <span
              className="font-mono text-[8px] uppercase tracking-wider"
              style={{ color: config.primary === 'gemini' ? '#34A853' : '#F97316' }}
            >
              {config.primary === 'gemini' ? 'Primary' : 'Fallback'}
            </span>
          </div>
          <ModelDropdown
            options={GEMINI_MODELS}
            selected={config.geminiModel}
            onSelect={(id) => onChange({ ...config, geminiModel: id })}
            activeModeAccent={activeModeAccent}
          />
        </div>

        {/* Mistral row */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[11px] text-cloud">Mistral</span>
            <span
              className="font-mono text-[8px] uppercase tracking-wider"
              style={{ color: config.primary === 'mistral' ? '#34A853' : '#F97316' }}
            >
              {config.primary === 'mistral' ? 'Primary' : 'Fallback'}
            </span>
          </div>
          <ModelDropdown
            options={MISTRAL_MODELS}
            selected={config.mistralModel}
            onSelect={(id) => onChange({ ...config, mistralModel: id })}
            activeModeAccent={activeModeAccent}
          />
        </div>
      </div>

      {/* Divider */}
      <div style={{ borderTop: '0.5px solid var(--color-stone)' }} />

      {/* Footer note */}
      <div className="px-3 py-2">
        <span className="text-[10px] text-mist">Changes apply to the next API call.</span>
      </div>
    </div>
  );
}

// ── Main Panel ─────────────────────────────────────────────────────────────────
export default function ApiLogPanel() {
  const { state, dispatch } = useApp();
  const { apiLog } = state;
  const { theme } = useTheme();

  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'LOG' | 'MODELS'>('MODELS');
  const [hasNew, setHasNew] = useState(false);
  const [config, setConfig] = useState<ApiConfig>(DEFAULT_CONFIG);
  const prevLen = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // (outside-click handled by Backdrop)

  // Load config & API logs on mount
  useEffect(() => {
    // 1. Config
    const cfg = loadConfig();
    setConfig(cfg);
    _globalConfig = cfg;

    // 2. API Logs
    try {
      const storedLogs = localStorage.getItem('redteam-api-logs');
      if (storedLogs) {
        const parsed = JSON.parse(storedLogs);
        const now = Date.now();
        // keep only past 24h
        const validLogs: ApiCallLog[] = parsed.filter((l: any) => now - l.timestamp < 24 * 60 * 60 * 1000);
        dispatch({ type: 'LOAD_API_LOGS', logs: validLogs });
      }
    } catch { /* silent */ }
  }, [dispatch]);

  // Flash indicator when new entries arrive
  useEffect(() => {
    if (apiLog.length > prevLen.current) {
      setHasNew(true);
      const t = setTimeout(() => setHasNew(false), 2000);
      prevLen.current = apiLog.length;
      return () => clearTimeout(t);
    }
  }, [apiLog.length]);

  const handleConfigChange = useCallback((cfg: ApiConfig) => {
    setConfig(cfg);
    saveConfig(cfg);
    _globalConfig = cfg;
  }, []);

  const geminiCount = apiLog.filter(e => e.provider === 'gemini').length;
  const mistralCount = apiLog.filter(e => e.provider === 'mistral').length;
  const codestralCount = apiLog.filter(e => e.provider === 'codestral').length;
  const fallbackCount = apiLog.filter(e => e.fallback).length;

  // Tab bar underline colour
  const TAB_ACTIVE_BORDER = '#3B82F6';

  return (
    <div
      ref={panelRef}
      className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-1"
      style={{ fontFamily: 'var(--font-geist-mono)' }}
    >
      {/* Expanded panel — Backdrop sits below it to swallow outside clicks */}
      {open && (
        <>
          <Backdrop onClose={() => setOpen(false)} zIndex={49} />
          <div
            className="flex flex-col rounded overflow-hidden z-50"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 480,
              maxHeight: 340,
              background: 'var(--color-ink)',
              border: '0.5px solid var(--color-stone)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}
          >
          {/* Header */}
          <div
            className="flex items-center justify-between px-3 py-2 flex-shrink-0"
            style={{ borderBottom: '0.5px solid var(--color-stone)' }}
          >
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ghost">API</span>
              <div className="flex items-center gap-2">
                {geminiCount > 0 && (
                  <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-sm"
                    style={{ background: PROVIDER_COLORS.gemini.badge, border: `0.5px solid ${PROVIDER_COLORS.gemini.border}`, color: PROVIDER_COLORS.gemini.label }}>
                    {PROVIDER_ICONS.gemini} Gemini ×{geminiCount}
                  </span>
                )}
                {mistralCount > 0 && (
                  <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-sm"
                    style={{ background: PROVIDER_COLORS.mistral.badge, border: `0.5px solid ${PROVIDER_COLORS.mistral.border}`, color: PROVIDER_COLORS.mistral.label }}>
                    {PROVIDER_ICONS.mistral} Mistral ×{mistralCount}
                    {fallbackCount > 0 && <span className="opacity-70"> ({fallbackCount} fallback)</span>}
                  </span>
                )}
                {codestralCount > 0 && (
                  <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-sm"
                    style={{ background: PROVIDER_COLORS.codestral.badge, border: `0.5px solid ${PROVIDER_COLORS.codestral.border}`, color: PROVIDER_COLORS.codestral.label }}>
                    {PROVIDER_ICONS.codestral} Codestral ×{codestralCount}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-ghost hover:text-fog transition-colors"
              style={{ fontSize: 12 }}
            >
              ✕
            </button>
          </div>

          {/* Tab bar */}
          <div
            className="flex flex-shrink-0"
            style={{ borderBottom: `0.5px solid var(--color-stone)` }}
          >
            {(['MODELS', 'LOG'] as const).map((tab) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="px-4 py-1.5 transition-colors"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    borderBottom: isActive ? `1px solid ${TAB_ACTIVE_BORDER}` : '1px solid transparent',
                    color: isActive ? 'var(--color-cloud)' : 'var(--color-ghost)',
                    fontFamily: 'inherit',
                    fontSize: 9,
                    fontWeight: 400,
                    textTransform: 'uppercase',
                    letterSpacing: '0.15em',
                    cursor: 'pointer',
                    marginBottom: -1,   // flush with the container border-bottom
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = 'var(--color-mist)'; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = 'var(--color-ghost)'; }}
                >
                  {tab}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          {activeTab === 'LOG' ? (
            <>
              {/* Legend row */}
              <div
                className="grid grid-cols-[12px_80px_1fr_90px_55px] items-center gap-x-5 px-4 py-1.5 flex-shrink-0 text-ghost opacity-40 border-b"
                style={{ borderColor: 'var(--color-stone)', background: 'rgba(0,0,0,0.2)' }}
              >
                <div />
                <span className="font-mono text-[8px] uppercase tracking-widest">Provider</span>
                <span className="font-mono text-[8px] uppercase tracking-widest">Model</span>
                <span className="font-mono text-[8px] uppercase tracking-widest">Framework</span>
                <span className="font-mono text-[8px] uppercase tracking-widest text-right">Time</span>
              </div>

              {/* Log entries */}
              <div ref={listRef} className="flex-1 overflow-y-auto">
                {apiLog.length === 0 ? (
                  <p className="font-mono text-[10px] text-ghost px-3 py-4 text-center opacity-50">
                    No API calls yet this session
                  </p>
                ) : (
                  apiLog.map(entry => <LogRow key={entry.id} entry={entry} />)
                )}
              </div>

              {/* Footer */}
              {apiLog.length > 0 && (
                <div
                  className="flex items-center justify-between px-3 py-1.5 flex-shrink-0"
                  style={{ borderTop: '0.5px solid var(--color-stone)', background: 'rgba(0,0,0,0.15)' }}
                >
                  <span className="font-mono text-[9px] text-ghost opacity-50">
                    {apiLog.length} call{apiLog.length !== 1 ? 's' : ''} logged · past 24 hours
                  </span>
                </div>
              )}
            </>
          ) : state.username === 'user001' ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center opacity-70">
              <span className="text-xl mb-3">🔒</span>
              <p className="font-mono text-[10px] text-mist uppercase tracking-[0.1em] mb-2">Access Restricted</p>
              <p className="text-[10px] text-ghost leading-relaxed max-w-[200px]">
                Your account is restricted to evaluating Mistral Medium Latest and Codestral models. Model configuration cannot be changed.
              </p>
            </div>
          ) : (
            <ModelsTab config={config} onChange={handleConfigChange} activeModeAccent={state.selectedMode?.accent} />
          )}
        </div>
        </>
      )}

      {/* Toggle button — label is now just "API" */}
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded transition-all duration-150"
        style={{
          background: 'var(--color-ink)',
          border: `0.5px solid ${hasNew ? 'var(--color-signal)' : 'var(--color-stone)'}`,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          transition: 'border-color 0.3s, box-shadow 0.3s',
        }}
      >
        {/* Provider dots */}
        <div className="flex items-center gap-1">
          {geminiCount > 0 && (
            <span style={{ color: PROVIDER_COLORS.gemini.dot, fontSize: 8 }}>●</span>
          )}
          {mistralCount > 0 && (
            <span style={{ color: PROVIDER_COLORS.mistral.dot, fontSize: 8 }}>●</span>
          )}
          {codestralCount > 0 && (
            <span style={{ color: PROVIDER_COLORS.codestral.dot, fontSize: 8 }}>●</span>
          )}
          {apiLog.length === 0 && (
            <span style={{ color: 'var(--color-ghost)', fontSize: 8 }}>○</span>
          )}
        </div>

        <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-ghost">
          API
        </span>



        <span className="text-ghost text-[9px]" style={{ opacity: 0.6 }}>
          {open ? '▾' : '▴'}
        </span>
      </button>
    </div>
  );
}
