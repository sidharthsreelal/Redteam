'use client';

import { useMemo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  MiniMap,
  Controls,
  ControlButton,
  Background,
  type Node,
  type Edge,
  type NodeTypes,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { getEdgeStyle } from '@/lib/edgeStyles';

import { useApp } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { MODES } from '@/lib/modes';
import type { Mode, ContinuationGeneration, FrameworkOutput } from '@/lib/types';
import type { NodeReference } from '@/lib/references';
import InputNode from './nodes/InputNode';
import FrameworkNode from './nodes/FrameworkNode';
import SynthesisNode from './nodes/SynthesisNode';
import ContinuationInputNode from './nodes/ContinuationInputNode';

const nodeTypes: NodeTypes = {
  inputNode: InputNode,
  frameworkNode: FrameworkNode,
  synthesisNode: SynthesisNode,
  continuationInputNode: ContinuationInputNode,
};

// ── Layout constants ─────────────────────────────────────────────────────────
// These are the ONLY source of truth for spatial dimensions.
// Change them here and the whole tree respects the change automatically.
const NODE_W       = 320;  // width of input / synthesis / cont-input node card
const FW_CARD_W    = 220;  // actual rendered pixel width of each FrameworkNode card
const CHAT_CARD_W  = 360;  // actual rendered pixel width of a chat FrameworkNode card
const NODE_H_FW    = 190;  // vertical gap: input → frameworks row
const FW_Y         = 200;  // root: Y of first framework row
const SYNTH_OFFSET = 240;  // gap from frameworks row bottom to synthesis top
const CONT_OFFSET  = 230;  // gap from synthesis bottom to child input top
const CHAT_CONT_OFFSET = 290; // gap from chat output bottom to child input top
const FW_SPACING   = 250;  // horizontal gap between sibling frameworks in a row
const SIBLING_GAP  = 80;   // minimum horizontal gap between sibling subtrees

// ── Subtree width measurement (Pass 1 — bottom-up) ────────────────────────
// Returns the natural pixel width this subtree needs so ALL its descendants
// can be laid out without overlap.
function measureSubtreeWidth(
  contIndex: number | null,
  childrenOf: Map<number | null, ContinuationGeneration[]>,
  modeFor: (c: ContinuationGeneration) => Mode
): number {
  const children = childrenOf.get(contIndex) ?? [];

  if (children.length === 0) {
    // Leaf: just needs enough room for its own frameworks
    return NODE_W + FW_SPACING; // minimum slot for any node
  }

  // Sum of all child subtree widths + gaps between them
  const childWidths = children.map((c) => measureSubtreeWidth(c.index, childrenOf, modeFor));
  return childWidths.reduce((sum, w) => sum + w, 0) + (children.length - 1) * SIBLING_GAP;
}

// Better version: leaf width depends on the number of frameworks in the mode
function measureLeafWidth(mode: Mode): number {
  const fw = mode.frameworks.length;
  if (fw <= 1) return NODE_W + 60; // chat / single
  return (fw - 1) * FW_SPACING + NODE_W; // space for all fw nodes
}

function measureNodeWidth(
  contIndex: number | null,
  childrenOf: Map<number | null, ContinuationGeneration[]>,
  modeOf: Map<number, Mode>,
  rootMode: Mode
): number {
  const children = childrenOf.get(contIndex) ?? [];

  if (children.length === 0) {
    // Leaf: natural width = width of its own framework row
    const m = contIndex === null ? rootMode : (modeOf.get(contIndex) ?? rootMode);
    return measureLeafWidth(m);
  }

  // Sum of child widths + gaps
  const childWidths = children.map((c) =>
    measureNodeWidth(c.index, childrenOf, modeOf, rootMode)
  );
  const childrenTotalW = childWidths.reduce((s, w) => s + w, 0) + (children.length - 1) * SIBLING_GAP;

  // Own width: the max of (my own framework row) and (subtree below me)
  const m = contIndex === null ? rootMode : (modeOf.get(contIndex) ?? rootMode);
  const ownWidth = measureLeafWidth(m);
  return Math.max(ownWidth, childrenTotalW);
}

// ── Graph builder (stateless pure function) ───────────────────────────────
function buildGraph(
  input: string,
  frameworkOutputs: FrameworkOutput[],
  synthesisOutput: FrameworkOutput,
  mode: Mode,
  selectedNodeId: string | null,
  onContinue: (() => void) | undefined,
  continuations: ContinuationGeneration[],
  onContinuationSubmit: (index: number, input: string, mode: Mode, references: NodeReference[], webSearchEnabled: boolean) => void,
  onContinue2: ((index: number) => void) | undefined,
  onContinuationDelete: (index: number) => void,
  _colX: number,                  // kept for signature compat — ignored, layout is self-determined
  branchOffsets: Record<number, { dx: number; dy: number }>,
  theme: 'dark' | 'light',
  rootOffset: { dx: number; dy: number }
) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // ── Pre-computation ──────────────────────────────────────────────────────
  const isChat = mode.id === 'chat';
  const fw = mode.frameworks.length;

  // Build parent→children index for O(1) lookup
  const childrenOf = new Map<number | null, ContinuationGeneration[]>();
  childrenOf.set(null, []);
  continuations.forEach((cont) => {
    const key = cont.parentIndex ?? null;
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key)!.push(cont);
  });

  // Build index: contIndex → Mode
  const modeOf = new Map<number, Mode>();
  continuations.forEach((cont) => {
    const m = MODES.find((m) => m.id === cont.modeId) ?? mode;
    modeOf.set(cont.index, m);
  });

  // ── Root node geometry ───────────────────────────────────────────────────
  // The root branch is always centered at X = 0.
  // We measure the full tree width below root so children can be
  // centered correctly under the root synthesis.
  const rootCenterX = 0;
  const ROOT_INPUT_Y = 0;
  const ROOT_FW_Y = ROOT_INPUT_Y + NODE_H_FW;
  const ROOT_SYNTH_Y = ROOT_FW_Y + SYNTH_OFFSET;

  const rootInputX = rootCenterX - NODE_W / 2;

  nodes.push({
    id: 'input',
    type: 'inputNode',
    position: { x: rootInputX, y: ROOT_INPUT_Y },
    data: { input, selected: selectedNodeId === 'input' },
    selected: selectedNodeId === 'input',
    zIndex: 10,
  });

  const allDone = frameworkOutputs.every(
    (fo) => fo.status === 'complete' || fo.status === 'error'
  );

  // ── Root: Framework nodes ─────────────────────────────────────────────────
  // fwStartX is the left edge of the first framework card, computed so the
  // entire row (all cards + gaps) is geometrically centered at rootCenterX.
  const fwRowW   = (fw - 1) * FW_SPACING + FW_CARD_W; // total row pixel width
  const fwStartX = rootCenterX - fwRowW / 2;
  mode.frameworks.forEach((f, i) => {
    const output = frameworkOutputs.find((fo) => fo.frameworkId === f.id);
    const isComplete = output?.status === 'complete';
    const isStreaming = output?.status === 'streaming';
    const xPos = isChat
      ? rootCenterX - CHAT_CARD_W / 2   // center the single chat card
      : fwStartX + i * FW_SPACING;       // left edge of card i

    nodes.push({
      id: f.id,
      type: 'frameworkNode',
      position: { x: xPos, y: ROOT_FW_Y },
      data: {
        frameworkId: f.id,
        label: isChat ? 'DIRECT RESPONSE' : f.label,
        title: isChat ? 'AI Response' : f.title,
        accent: f.accent,
        status: output?.status || 'idle',
        content: output?.content || '',
        error: output?.error,
        startTime: output?.startTime,
        endTime: output?.endTime,
        selected: selectedNodeId === f.id,
        isChat,
      },
      selected: selectedNodeId === f.id,
      zIndex: 10,
      draggable: false,
    });

    edges.push({
      id: `input-${f.id}`,
      source: 'input',
      target: f.id,
      animated: isStreaming,
      style: getEdgeStyle('intra', theme, isComplete, isStreaming ? f.accent : undefined),
    });
  });

  // ── Root: Synthesis (or chat handle) ─────────────────────────────────────
  const rootSynthId = isChat ? 'chat-response' : 'synthesis';

  if (!isChat) {
    const synthComplete = synthesisOutput.status === 'complete';
    nodes.push({
      id: 'synthesis',
      type: 'synthesisNode',
      position: { x: rootCenterX - NODE_W / 2, y: ROOT_SYNTH_Y },
      data: {
        busId: 'synthesis',
        status: synthesisOutput.status,
        content: synthesisOutput.content,
        error: synthesisOutput.error,
        startTime: synthesisOutput.startTime,
        endTime: synthesisOutput.endTime,
        selected: selectedNodeId === 'synthesis',
        onContinue: synthComplete ? onContinue : undefined,
      },
      selected: selectedNodeId === 'synthesis',
      zIndex: 10,
    });

    if (allDone) {
      mode.frameworks.forEach((f) => {
        const synthStreaming = synthesisOutput.status === 'streaming';
        edges.push({
          id: `${f.id}-synthesis`,
          source: f.id,
          target: 'synthesis',
          animated: synthesisOutput.status === 'streaming',
          style: getEdgeStyle('intra', theme, synthesisOutput.status === 'complete', synthStreaming ? f.accent : undefined),
        });
      });
    }
  } else {
    // Chat: optionally attach onContinue to the chat framework node
    const chatOutput = frameworkOutputs.find((fo) => fo.frameworkId === 'chat-response');
    if (chatOutput?.status === 'complete' && onContinue) {
      const chatNode = nodes.find((n) => n.id === 'chat-response');
      if (chatNode) {
        (chatNode.data as Record<string, unknown>).onContinue = onContinue;
      }
    }
  }

  // ── Pass 1: Compute natural width for every node in the subtree ──────────
  // This is done ONCE before placing any continuation nodes.
  // `widthOf(idx)` = how wide the subtree rooted at `idx` needs to be.
  const widthOf = new Map<number | null, number>();
  // We compute width bottom-up using a post-order traversal.
  // Sort continuations by depth (deepest first) so parents are calculated after children.
  const sorted = [...continuations].sort((a, b) => {
    // Assign a depth to each continuation
    const depth = (c: ContinuationGeneration): number => {
      if (c.parentIndex === null) return 1;
      const parent = continuations.find((p) => p.index === c.parentIndex);
      return parent ? depth(parent) + 1 : 1;
    };
    return depth(b) - depth(a); // deepest first
  });

  sorted.forEach((cont) => {
    widthOf.set(
      cont.index,
      measureNodeWidth(cont.index, childrenOf, modeOf, mode)
    );
  });
  // Also compute root's children total for centering purposes
  widthOf.set(null, measureNodeWidth(null, childrenOf, modeOf, mode));

  // ── Pass 2: Place continuation subtrees (top-down) ───────────────────────
  // We use a recursive top-down placer. Each call receives the CENTER X where
  // THIS node's input/synthesis should be placed, and the TOP Y of this node.
  function placeContSubtree(
    cont: ContinuationGeneration,
    parentSynthId: string,
    centerX: number,  // horizontal center of THIS subtree
    topY: number,     // Y of the cont-input node
  ) {
    const contMode = modeOf.get(cont.index) ?? mode;
    const contIsChat = contMode.id === 'chat';
    const contFw = contMode.frameworks.length;
    const contInputY   = topY;
    const contFwY      = topY + NODE_H_FW;
    const contSynthY   = contFwY + SYNTH_OFFSET;

    // Apply user drag offset for THIS node's branch (purely cosmetic, doesn't affect children positions)
    const off = branchOffsets[cont.index] ?? { dx: 0, dy: 0 };

    // ── Continuation input node ──
    const contInputId = `cont-input-${cont.index}`;
    const isFrozen = cont.status === 'executing' || cont.status === 'complete';
    const contChildren = childrenOf.get(cont.index) ?? [];

    nodes.push({
      id: contInputId,
      type: 'continuationInputNode',
      position: { x: centerX - NODE_W / 2 + off.dx, y: contInputY + off.dy },
      data: {
        continuationIndex: cont.index,
        defaultMode: contMode,
        frozen: isFrozen,
        frozenInput: cont.input,
        frozenModeName: cont.modeName,
        hasChildren: contChildren.length > 0,
        onSubmit: (inp: string, m: Mode, refs: NodeReference[], webSearch: boolean) =>
          onContinuationSubmit(cont.index, inp, m, refs, webSearch),
        onDelete: () => onContinuationDelete(cont.index),
      },
    });

    // ── Inter-gen edge: parent synthesis → this input ──
    edges.push({
      id: `${parentSynthId}-to-cont-${cont.index}`,
      source: parentSynthId,
      sourceHandle:
        parentSynthId === 'synthesis' || parentSynthId.startsWith('synthesis-cont-node-')
          ? 'right'
          : undefined,
      target: contInputId,
      animated: true,
      style: getEdgeStyle('inter', theme, true),
    });

    // Nothing more to place until the continuation has been submitted
    if (cont.status !== 'executing' && cont.status !== 'complete') return;

    const contAllDone = cont.frameworkOutputs.every(
      (fo) => fo.status === 'complete' || fo.status === 'error'
    );

    // ── Framework nodes ──
    // fwStartX for this subtree: left edge of first card, row centered at centerX.
    const contFwRowW   = (contFw - 1) * FW_SPACING + FW_CARD_W;
    const contFwStartX = centerX - contFwRowW / 2;
    contMode.frameworks.forEach((f, fi) => {
      const output = cont.frameworkOutputs.find((fo) => fo.frameworkId === f.id);
      const isComplete = output?.status === 'complete';
      const isStreaming = output?.status === 'streaming';
      const nodeId = `${f.id}-cont-${cont.index}`;
      const xPos = contIsChat
        ? centerX - CHAT_CARD_W / 2
        : contFwStartX + fi * FW_SPACING;

      nodes.push({
        id: nodeId,
        type: 'frameworkNode',
        position: { x: xPos + off.dx, y: contFwY + off.dy },
        data: {
          frameworkId: `${f.id}-cont-${cont.index}`,
          label: contIsChat ? 'DIRECT RESPONSE' : f.label,
          title: contIsChat ? 'AI Response' : f.title,
          accent: f.accent,
          status: output?.status || 'idle',
          content: output?.content || '',
          error: output?.error,
          startTime: output?.startTime,
          endTime: output?.endTime,
          isChat: contIsChat,
        },
        draggable: false,
      });

      edges.push({
        id: `cont-${cont.index}-input-to-${f.id}`,
        source: contInputId,
        target: nodeId,
        animated: isStreaming,
        style: getEdgeStyle('intra', theme, isComplete, isStreaming ? f.accent : undefined),
      });
    });

    // ── Synthesis node (skip for chat) ──
    const contSynthId = `synthesis-cont-node-${cont.index}`;

    if (!contIsChat) {
      const contSynthComplete = cont.synthesisOutput.status === 'complete';
      const canAddMore = contChildren.length < 10;

      nodes.push({
        id: contSynthId,
        type: 'synthesisNode',
        position: { x: centerX - NODE_W / 2 + off.dx, y: contSynthY + off.dy },
        data: {
          busId: `synthesis-cont-${cont.index}`,
          status: cont.synthesisOutput.status,
          content: cont.synthesisOutput.content,
          error: cont.synthesisOutput.error,
          startTime: cont.synthesisOutput.startTime,
          endTime: cont.synthesisOutput.endTime,
          onContinue:
            contSynthComplete && canAddMore && onContinue2
              ? () => onContinue2(cont.index)
              : undefined,
        },
      });

      if (contAllDone) {
        const contSynthStreaming = cont.synthesisOutput.status === 'streaming';
        contMode.frameworks.forEach((f) => {
          edges.push({
            id: `${f.id}-cont-${cont.index}-to-synth`,
            source: `${f.id}-cont-${cont.index}`,
            target: contSynthId,
            animated: contSynthStreaming,
            style: getEdgeStyle(
              'intra',
              theme,
              contSynthComplete,
              contSynthStreaming ? f.accent : undefined
            ),
          });
        });
      }

      // ── Recurse into children (Pass 2 top-down placement) ──
      if (contChildren.length > 0) {
        // total width consumed by children group (using pre-measured widths)
        const childWidths = contChildren.map(
          (c) => widthOf.get(c.index) ?? measureLeafWidth(modeOf.get(c.index) ?? mode)
        );
        const childrenTotalW =
          childWidths.reduce((s, w) => s + w, 0) + (contChildren.length - 1) * SIBLING_GAP;

        // Start x = left edge of the group, centered under THIS node's centerX (with drag offset)
        let cursorX = (centerX + off.dx) - childrenTotalW / 2;
        const childBaseY = contSynthY + off.dy + 230 + 60; // top of synthesis + height + gap

        contChildren.forEach((child, ci) => {
          const cw = childWidths[ci];
          const childCenter = cursorX + cw / 2;
          placeContSubtree(child, contSynthId, childCenter, childBaseY);
          cursorX += cw + SIBLING_GAP;
        });
      }
    } else {
      // Chat continuation: attach handle + recurse
      const contChatOutput = cont.frameworkOutputs.find(
        (fo) => fo.frameworkId === 'chat-response'
      );
      if (contChatOutput?.status === 'complete' && onContinue2) {
        const chatNodeId = `chat-response-cont-${cont.index}`;
        const chatNodeInGraph = nodes.find((n) => n.id === chatNodeId);
        if (chatNodeInGraph) {
          (chatNodeInGraph.data as Record<string, unknown>).onContinue = () =>
            onContinue2(cont.index);
        }
      }

      if (contChildren.length > 0) {
        const childWidths = contChildren.map(
          (c) => widthOf.get(c.index) ?? measureLeafWidth(modeOf.get(c.index) ?? mode)
        );
        const childrenTotalW =
          childWidths.reduce((s, w) => s + w, 0) + (contChildren.length - 1) * SIBLING_GAP;

        let cursorX = (centerX + off.dx) - childrenTotalW / 2;
        const childBaseY = contFwY + off.dy + 230 + 60;

        contChildren.forEach((child, ci) => {
          const cw = childWidths[ci];
          const childCenter = cursorX + cw / 2;
          placeContSubtree(child, `chat-response-cont-${cont.index}`, childCenter, childBaseY);
          cursorX += cw + SIBLING_GAP;
        });
      }
    }
  }

  // ── Kick off: root-level children (secondary nodes) ──────────────────────
  // They go BELOW the root synthesis, centered under it.
  const rootChildren = childrenOf.get(null) ?? [];

  if (rootChildren.length > 0) {
    const childWidths = rootChildren.map(
      (c) => widthOf.get(c.index) ?? measureLeafWidth(modeOf.get(c.index) ?? mode)
    );
    const childrenTotalW =
      childWidths.reduce((s, w) => s + w, 0) + (rootChildren.length - 1) * SIBLING_GAP;

    // Center child group under the root synthesis center (rootCenterX)
    let cursorX = rootCenterX - childrenTotalW / 2;

    // Y of the first child input = bottom of root synthesis + CONT_OFFSET
    const childBaseY = isChat
      ? ROOT_FW_Y + CHAT_CONT_OFFSET
      : ROOT_SYNTH_Y + CONT_OFFSET;

    rootChildren.forEach((child, ci) => {
      const cw = childWidths[ci];
      const childCenter = cursorX + cw / 2;
      placeContSubtree(child, rootSynthId, childCenter, childBaseY);
      cursorX += cw + SIBLING_GAP;
    });
  }

  // ── Apply root drag offset to ALL nodes ──────────────────────────────────
  const finalNodes = nodes.map((n) => ({
    ...n,
    position: {
      x: n.position.x + rootOffset.dx,
      y: n.position.y + rootOffset.dy,
    },
  }));

  return { nodes: finalNodes, edges };
}


// ── Inner canvas ──
function CanvasInner() {
  const { state, dispatch, executeContinuation } = useApp();
  const { activeSession, selectedMode, detailPanelNodeId, detailPanelOpen } = state;
  const { fitView } = useReactFlow();
  const { theme } = useTheme();
  const hasFit = useRef(false);

  // ── Minimap: show only while moving canvas ──
  const [showMinimap, setShowMinimap] = useState(false);
  const minimapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleMoveStart = useCallback(() => {
    if (minimapTimer.current) clearTimeout(minimapTimer.current);
    setShowMinimap(true);
  }, []);
  const handleMoveEnd = useCallback(() => {
    minimapTimer.current = setTimeout(() => setShowMinimap(false), 1200);
  }, []);

  const handleContinue = useCallback(() => {
    if (!activeSession || !selectedMode) return;
    const existing = activeSession.continuations || [];
    const newIndex = existing.length + 1;
    const prevSynthContent = selectedMode.id === 'chat'
      ? (activeSession.frameworkOutputs.find((fo) => fo.frameworkId === 'chat-response')?.content || '')
      : activeSession.synthesisOutput.content;

    dispatch({
      type: 'ADD_CONTINUATION',
      continuation: {
        index: newIndex,
        parentIndex: null,   // child of root session
        modeId: selectedMode.id,
        modeName: selectedMode.name,
        input: '',
        synthesisPrefixContent: prevSynthContent,
        frameworkOutputs: selectedMode.frameworks.map((f) => ({
          frameworkId: f.id,
          status: 'idle',
          content: '',
        })),
        synthesisOutput: { frameworkId: 'synthesis', status: 'idle', content: '' },
        status: 'input',
      },
    });

    // Zoom to show root synthesis + new input side by side — not all nodes
    setTimeout(() => {
      fitView({
        nodes: [
          { id: selectedMode.id === 'chat' ? 'chat-response' : 'synthesis' },
          { id: `cont-input-${newIndex}` },
        ],
        padding: 0.35,
        duration: 700,
      });
    }, 200);
  }, [activeSession, selectedMode, dispatch, fitView]);

  const handleContinuationSubmit = useCallback(
    (contIndex: number, inp: string, mode: Mode, references: NodeReference[], webSearchEnabled = false) => {
      if (!activeSession) return;
      const cont = activeSession.continuations?.find((c) => c.index === contIndex);
      if (!cont) return;
      executeContinuation(contIndex, inp, mode, cont.synthesisPrefixContent, references, webSearchEnabled);
    },
    [activeSession, executeContinuation]
  );

  const handleContinue2 = useCallback(
    (fromIndex: number) => {
      if (!activeSession || !selectedMode) return;
      const fromCont = activeSession.continuations?.find((c) => c.index === fromIndex);
      if (!fromCont) return;

      const existing = activeSession.continuations || [];
      const newIndex = existing.length + 1;
      const contMode = MODES.find((m) => m.id === fromCont.modeId) || selectedMode;
      const prevContent = contMode.id === 'chat'
        ? (fromCont.frameworkOutputs.find((fo) => fo.frameworkId === 'chat-response')?.content || '')
        : fromCont.synthesisOutput.content;

      dispatch({
        type: 'ADD_CONTINUATION',
        continuation: {
          index: newIndex,
          parentIndex: fromIndex,   // ← child of THIS continuation, not root
          modeId: contMode.id,
          modeName: contMode.name,
          input: '',
          synthesisPrefixContent: prevContent,
          frameworkOutputs: contMode.frameworks.map((f) => ({
            frameworkId: f.id,
            status: 'idle',
            content: '',
          })),
          synthesisOutput: { frameworkId: 'synthesis', status: 'idle', content: '' },
          status: 'input',
        },
      });

      // Zoom to show only: the parent synthesis + the new child input node
      setTimeout(() => {
        fitView({
          nodes: [
            { id: `synthesis-cont-node-${fromIndex}` },
            { id: `cont-input-${newIndex}` },
          ],
          padding: 0.4,
          duration: 700,
        });
      }, 200);
    },
    [activeSession, selectedMode, dispatch, fitView]
  );

  // ── Branch and Root drag: accumulated offsets (persist across rebuilds) ──
  const [branchOffsets, setBranchOffsets] = useState<Record<number, { dx: number; dy: number }>>({});
  const [rootOffset, setRootOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const dragRef = useRef<{ contIndex: number; prevX: number; prevY: number; totalDx: number; totalDy: number } | null>(null);

  const handleContinuationDelete = useCallback(
    (index: number) => {
      dispatch({ type: 'DELETE_CONTINUATION', index });
      // Clean up drag offset for this branch (and any children — their indices will be gone too)
      setBranchOffsets((prev) => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
    },
    [dispatch]
  );

  const { nodes: builtNodes, edges: builtEdges } = useMemo(() => {
    if (!activeSession || !selectedMode) return { nodes: [], edges: [] };

    const isChat = selectedMode.id === 'chat';
    const rootChildren = (activeSession.continuations || []).filter(
      (c) => (c.parentIndex ?? null) === null
    );
    const canAddRootChild = rootChildren.length < 10;
    const lastFrameworkComplete = isChat
      ? activeSession.frameworkOutputs.find((fo) => fo.frameworkId === 'chat-response')?.status === 'complete'
      : activeSession.synthesisOutput.status === 'complete';

    return buildGraph(
      activeSession.input,
      activeSession.frameworkOutputs,
      activeSession.synthesisOutput,
      selectedMode,
      detailPanelNodeId,
      lastFrameworkComplete && canAddRootChild ? handleContinue : undefined,
      activeSession.continuations || [],
      handleContinuationSubmit,
      lastFrameworkComplete ? handleContinue2 : undefined,
      handleContinuationDelete,
      0,
      branchOffsets,
      theme,
      rootOffset
    );
  }, [activeSession, selectedMode, detailPanelNodeId, handleContinue, handleContinuationSubmit, handleContinue2, handleContinuationDelete, branchOffsets, theme, rootOffset]);

  // useNodesState MUST be declared before the drag callbacks that use setNodes
  const [nodes, setNodes, onNodesChange] = useNodesState(builtNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(builtEdges);

  useEffect(() => {
    setNodes(builtNodes);
    setEdges(builtEdges);
  }, [builtNodes, builtEdges, setNodes, setEdges]);

  const onNodeDragStart = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.id === 'input') {
      dragRef.current = { contIndex: -1, prevX: node.position.x, prevY: node.position.y, totalDx: 0, totalDy: 0 };
    } else if (node.id.startsWith('cont-input-')) {
      const contIndex = parseInt(node.id.split('-').pop()!);
      dragRef.current = { contIndex, prevX: node.position.x, prevY: node.position.y, totalDx: 0, totalDy: 0 };
    }
  }, []);

  const onNodeDrag = useCallback((_: React.MouseEvent, node: Node) => {
    if (!dragRef.current) return;
    if (node.id === 'input' || node.id.startsWith('cont-input-')) {
      const dx = node.position.x - dragRef.current.prevX;
      const dy = node.position.y - dragRef.current.prevY;
      dragRef.current.prevX = node.position.x;
      dragRef.current.prevY = node.position.y;
      dragRef.current.totalDx += dx;
      dragRef.current.totalDy += dy;
      
      const isRoot = node.id === 'input';
      const idx = isRoot ? '' : dragRef.current.contIndex.toString();
      
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id === node.id) return n;
          
          if (isRoot) {
            return { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } };
          } else {
            if (n.id.endsWith(`-cont-${idx}`) || n.id === `synthesis-cont-node-${idx}`) {
              return { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } };
            }
          }
          return n;
        })
      );
    }
  }, [setNodes]);

  const onNodeDragStop = useCallback((_: React.MouseEvent, node: Node) => {
    if (!dragRef.current || (node.id !== 'input' && !node.id.startsWith('cont-input-'))) { 
      dragRef.current = null; 
      return; 
    }
    const { contIndex, totalDx, totalDy } = dragRef.current;
    dragRef.current = null;
    
    if (node.id === 'input') {
      setRootOffset((prev) => ({
        dx: prev.dx + totalDx,
        dy: prev.dy + totalDy,
      }));
    } else {
      setBranchOffsets((prev) => ({
        ...prev,
        [contIndex]: { dx: (prev[contIndex]?.dx ?? 0) + totalDx, dy: (prev[contIndex]?.dy ?? 0) + totalDy },
      }));
    }
  }, [setBranchOffsets, setRootOffset]);


  useEffect(() => {
    if (builtNodes.length > 0 && !hasFit.current) {
      hasFit.current = true;
      setTimeout(() => fitView({ padding: 0.25, duration: 400 }), 100);
    }
  }, [builtNodes.length, fitView]);

  // Global hotkey: Ctrl+I for New Node (Continuation)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ctrl+I or cmd+I
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        
        // If a specific continuation node is selected in the detail panel, append to THAT one
        if (detailPanelNodeId?.startsWith('synthesis-cont-node-')) {
          const idxStr = detailPanelNodeId.replace('synthesis-cont-node-', '');
          const idx = parseInt(idxStr, 10);
          if (!isNaN(idx)) {
            handleContinue2(idx);
            return;
          }
        }
        
        // Chat mode handles "synthesis" as "chat-response" internally in root
        const lastFrameworkComplete = selectedMode?.id === 'chat'
          ? activeSession?.frameworkOutputs.find((fo) => fo.frameworkId === 'chat-response')?.status === 'complete'
          : activeSession?.synthesisOutput.status === 'complete';
          
        if (lastFrameworkComplete) {
          handleContinue();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeSession, selectedMode, detailPanelNodeId, handleContinue, handleContinue2]);

  // ── Reset layout: wipe all drag offsets and re-fit view ──
  const handleResetLayout = useCallback(() => {
    setBranchOffsets({});
    setRootOffset({ dx: 0, dy: 0 });
    // Give React one tick to re-render with zeroed offsets, then fit
    setTimeout(() => fitView({ padding: 0.25, duration: 500 }), 50);
  }, [fitView]);

  // ── Toggle detail panel on node click (form nodes excluded) ──
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      // Continuation input nodes are interactive forms — don't open detail panel for them
      if (node.id.startsWith('cont-input-')) return;

      if (detailPanelOpen && detailPanelNodeId === node.id) {
        dispatch({ type: 'CLOSE_DETAIL' });
      } else {
        dispatch({ type: 'OPEN_DETAIL', nodeId: node.id });
      }
    },
    [dispatch, detailPanelOpen, detailPanelNodeId]
  );

  const onPaneClick = useCallback(() => {
    dispatch({ type: 'CLOSE_DETAIL' });
  }, [dispatch]);

  // theme-aware dot color — subtle grid dots
  const dotColor = theme === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)';

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={onNodeClick}
      onPaneClick={onPaneClick}
      onMoveStart={handleMoveStart}
      onMoveEnd={handleMoveEnd}
      onNodeDragStart={onNodeDragStart}
      onNodeDrag={onNodeDrag}
      onNodeDragStop={onNodeDragStop}
      nodeTypes={nodeTypes}
      minZoom={0.1}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      nodesDraggable
      nodesConnectable={false}
      elementsSelectable
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={2.5} color={dotColor} />

      {/* Minimap — only visible when moving */}
      <div style={{
        transition: 'opacity 300ms ease',
        opacity: showMinimap ? 1 : 0,
        pointerEvents: showMinimap ? 'auto' : 'none',
      }}>
        <MiniMap
          nodeColor={() => 'var(--color-ash)'}
          maskColor="rgba(0,0,0,0.5)"
          style={{
            background: 'var(--color-ink)',
            border: '0.5px solid var(--color-stone)',
            borderRadius: 4,
          }}
          zoomable
          pannable
        />
      </div>

      <Controls
        showInteractive={false}
        style={{
          background: 'var(--color-ink)',
          border: '0.5px solid var(--color-stone)',
          borderRadius: 4,
        }}
      >
        <ControlButton
          onClick={handleResetLayout}
          title="Reset layout — snap all nodes back to auto-aligned positions"
          style={{ color: 'var(--color-ghost)', fontSize: 12 }}
        >
          {/* Reset / grid icon using an SVG that looks like the concept */}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 .49-4.96" />
          </svg>
        </ControlButton>
      </Controls>
    </ReactFlow>
  );
}

export default function NodeCanvas() {
  return (
    <div className="w-full h-full">
      <ReactFlowProvider>
        <CanvasInner />
      </ReactFlowProvider>
    </div>
  );
}
