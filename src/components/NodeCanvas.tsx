'use client';

import { useMemo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  MiniMap,
  Controls,
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

// ── Layout constants ──
const FW_SPACING  = 250;
const FW_Y        = 200;
const SYNTH_Y     = 440;

// ── Graph builder ──
function buildGraph(
  input: string,
  frameworkOutputs: FrameworkOutput[],
  synthesisOutput: FrameworkOutput,
  mode: Mode,
  selectedNodeId: string | null,
  onContinue: (() => void) | undefined,
  continuations: ContinuationGeneration[],
  onContinuationSubmit: (index: number, input: string, mode: Mode, references: NodeReference[]) => void,
  onContinue2: ((index: number) => void) | undefined,
  onContinuationDelete: (index: number) => void,
  colX: number,
  branchOffsets: Record<number, { dx: number; dy: number }>,
  theme: 'dark' | 'light',
  rootOffset: { dx: number; dy: number }
) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const isChat = mode.id === 'chat';
  const fw = mode.frameworks.length;
  const totalWidth = (fw - 1) * FW_SPACING;
  const startX = colX - totalWidth / 2;
  const inputX = colX - 150;

  // Input node
  nodes.push({
    id: 'input',
    type: 'inputNode',
    position: { x: inputX, y: 0 },
    data: { input, selected: selectedNodeId === 'input' },
    selected: selectedNodeId === 'input',
    zIndex: 10,
  });

  const allDone = frameworkOutputs.every(
    (fo) => fo.status === 'complete' || fo.status === 'error'
  );

  // Framework nodes — for chat, render wide and centered
  mode.frameworks.forEach((f, i) => {
    const output = frameworkOutputs.find((fo) => fo.frameworkId === f.id);
    const isComplete = output?.status === 'complete';
    const isStreaming = output?.status === 'streaming';

    const xPos = isChat
      ? inputX                                        // chat: same x as input, vertically stacked
      : startX + i * FW_SPACING - 110;

    nodes.push({
      id: f.id,
      type: 'frameworkNode',
      position: { x: xPos, y: FW_Y },
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
      animated: isStreaming || (!isComplete && !allDone),
      style: getEdgeStyle('intra', theme, isComplete, isStreaming ? f.accent : undefined),
    });
  });

  // Synthesis node — skip for chat
  if (!isChat) {
    const synthComplete = synthesisOutput.status === 'complete';
    nodes.push({
      id: 'synthesis',
      type: 'synthesisNode',
      position: { x: colX - 160, y: SYNTH_Y },
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
          animated: synthesisOutput.status === 'streaming' || synthesisOutput.status === 'idle',
          style: getEdgeStyle('intra', theme, synthComplete, synthStreaming ? f.accent : undefined),
        });
      });
    }
  } else {
    // Chat: continuation handle on framework node if complete
    // (handled via the onContinue prop passed to FrameworkNode via data — not implemented yet,
    //  for now use the first complete framework output as the "synthesis" trigger)
    const chatOutput = frameworkOutputs.find((fo) => fo.frameworkId === 'chat-response');
    if (chatOutput?.status === 'complete' && onContinue) {
      // Patch: add onContinue to the framework node data
      const chatNode = nodes.find((n) => n.id === 'chat-response');
      if (chatNode) {
        (chatNode.data as Record<string, unknown>).onContinue = onContinue;
      }
    }
  }

  // ── Layout helpers ───────────────────────────────────────────
  // Returns estimated horizontal "slot" width each branch needs for its framework row.
  // Used to space siblings side-by-side without overlap.
  const SIBLING_GAP = 80;   // gap between two sibling branches
  const SYNTH_H     = 230;  // estimated synthesis node height (card content varies)
  const DEPTH_GAP   = 60;   // gap below synthesis card bottom before child input

  function getSlotWidth(m: Mode): number {
    const fw = m.frameworks.length;
    if (fw <= 1) return 440;                        // chat / single-fw
    return (fw - 1) * FW_SPACING + 220 + 80;        // fw nodes + node-width + padding
    // Stress(6): 5·250+300 = 1550   OODA(4): 3·250+300 = 1050
  }

  // Spread a sibling group horizontally starting at groupStartX, all at the same baseY.
  // Returns the right-edge X so callers can chain groups.
  function placeSiblingGroup(
    sibs: ContinuationGeneration[],
    parentSynthId: string,
    groupStartX: number,
    baseY: number,
  ) {
    let x = groupStartX;
    sibs.forEach((cont) => {
      const cm = MODES.find((m) => m.id === cont.modeId) || mode;
      const slotW = getSlotWidth(cm);
      const centerX = x + slotW / 2;
      buildContSubtree(cont, parentSynthId, centerX, baseY);
      x += slotW + SIBLING_GAP;
    });
  }

  // Build parent→children map  (null key = children of root session)
  const childrenOf = new Map<number | null, ContinuationGeneration[]>();
  continuations.forEach((cont) => {
    const key = cont.parentIndex ?? null;
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key)!.push(cont);
  });

  // Core node builder ──────────────────────────────────────────
  function buildContSubtree(
    cont: ContinuationGeneration,
    parentSynthId: string,
    baseX: number,    // horizontal centre of this branch
    baseY: number,    // Y of the cont-input node (top of this branch)
  ) {
    const contMode = MODES.find((m) => m.id === cont.modeId) || mode;
    const contIsChat = contMode.id === 'chat';
    const contFw = contMode.frameworks.length;
    const contTotalW = (contFw - 1) * FW_SPACING;
    const contStartX = baseX - contTotalW / 2;

    // Y positions within this branch
    const inputY    = baseY;
    const frameworkY = baseY + 190;
    const synthY    = baseY + 430;

    // User-drag offset for this branch
    const off = branchOffsets[cont.index] ?? { dx: 0, dy: 0 };

    // ── Continuation input node ──
    const contInputId = `cont-input-${cont.index}`;
    const isFrozen = cont.status === 'executing' || cont.status === 'complete';
    const contChildren = childrenOf.get(cont.index) ?? [];
    nodes.push({
      id: contInputId,
      type: 'continuationInputNode',
      position: { x: baseX - 160 + off.dx, y: inputY + off.dy },
      data: {
        continuationIndex: cont.index,
        defaultMode: contMode,
        frozen: isFrozen,
        frozenInput: cont.input,
        frozenModeName: cont.modeName,
        hasChildren: contChildren.length > 0,
        onSubmit: (inp: string, m: Mode, refs: NodeReference[]) => onContinuationSubmit(cont.index, inp, m, refs),
        onDelete: () => onContinuationDelete(cont.index),
      },
    });

    // ── Edge: parent synthesis → this input (inter-generation) ──
    edges.push({
      id: `${parentSynthId}-cont-${cont.index}`,
      source: parentSynthId,
      sourceHandle: (parentSynthId === 'synthesis' || parentSynthId.startsWith('synthesis-cont-node-'))
        ? 'right'
        : undefined,
      target: contInputId,
      animated: true,
      style: getEdgeStyle('inter', theme, true),
    });

    if (cont.status === 'executing' || cont.status === 'complete') {
      const contAllDone = cont.frameworkOutputs.every(
        (fo) => fo.status === 'complete' || fo.status === 'error'
      );

      // ── Framework nodes ──
      contMode.frameworks.forEach((f, fi) => {
        const output = cont.frameworkOutputs.find((fo) => fo.frameworkId === f.id);
        const isComplete = output?.status === 'complete';
        const isStreaming = output?.status === 'streaming';
        const nodeId = `${f.id}-cont-${cont.index}`;
        const xPos = contIsChat ? baseX - 160 : contStartX + fi * FW_SPACING - 110;

        nodes.push({
          id: nodeId,
          type: 'frameworkNode',
          position: { x: xPos + off.dx, y: frameworkY + off.dy },
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
          id: `cont-input-${cont.index}-${f.id}`,
          source: contInputId,
          target: nodeId,
          animated: isStreaming || (!isComplete && !contAllDone),
          style: getEdgeStyle('intra', theme, isComplete, isStreaming ? f.accent : undefined),
        });
      });

      // ── Synthesis node (skip for chat) ──
      const contSynthId = `synthesis-cont-node-${cont.index}`;

      if (!contIsChat) {
        const contSynthComplete = cont.synthesisOutput.status === 'complete';
        const thisChildren = childrenOf.get(cont.index) || [];
        const canAddMore = thisChildren.length < 10;

        nodes.push({
          id: contSynthId,
          type: 'synthesisNode',
          position: { x: baseX - 160 + off.dx, y: synthY + off.dy },
          data: {
            busId: `synthesis-cont-${cont.index}`,
            status: cont.synthesisOutput.status,
            content: cont.synthesisOutput.content,
            error: cont.synthesisOutput.error,
            startTime: cont.synthesisOutput.startTime,
            endTime: cont.synthesisOutput.endTime,
            onContinue: (contSynthComplete && canAddMore && onContinue2)
              ? () => onContinue2(cont.index)
              : undefined,
          },
        });

        if (contAllDone) {
          const contSynthStreaming = cont.synthesisOutput.status === 'streaming';
          contMode.frameworks.forEach((f) => {
            edges.push({
              id: `${f.id}-cont-${cont.index}-synth`,
              source: `${f.id}-cont-${cont.index}`,
              target: contSynthId,
              animated: !contSynthComplete,
              style: getEdgeStyle('intra', theme, contSynthComplete, contSynthStreaming ? f.accent : undefined),
            });
          });
        }

        // ── Recurse: children go BELOW this synthesis, spread HORIZONTALLY ──
        const children = childrenOf.get(cont.index) ?? [];
        if (children.length > 0) {
          const childSlots = children.map((c) => {
            const cm = MODES.find((m) => m.id === c.modeId) || mode;
            return getSlotWidth(cm);
          });
          const totalW = childSlots.reduce((a, b) => a + b, 0) + (children.length - 1) * SIBLING_GAP;
          // Center the child group under this synthesis
          const groupStartX = (baseX + off.dx) - totalW / 2;
          // childBaseY = top of synthesis + synthesis height + gap
          const childBaseY  = synthY + off.dy + SYNTH_H + DEPTH_GAP;
          placeSiblingGroup(children, contSynthId, groupStartX, childBaseY);
        }

      } else {
        // Chat mode: attach continuation handle when complete
        const contChatOutput = cont.frameworkOutputs.find((fo) => fo.frameworkId === 'chat-response');
        if (contChatOutput?.status === 'complete' && onContinue2) {
          const chatNodeId = `chat-response-cont-${cont.index}`;
          const chatNodeInGraph = nodes.find((n) => n.id === chatNodeId);
          if (chatNodeInGraph) {
            (chatNodeInGraph.data as Record<string, unknown>).onContinue = () => onContinue2(cont.index);
          }
        }

        // Chat children also go below, horizontally spread
        const children = childrenOf.get(cont.index) ?? [];
        if (children.length > 0) {
          const childSlots = children.map((c) => {
            const cm = MODES.find((m) => m.id === c.modeId) || mode;
            return getSlotWidth(cm);
          });
          const totalW = childSlots.reduce((a, b) => a + b, 0) + (children.length - 1) * SIBLING_GAP;
          const groupStartX = (baseX + off.dx) - totalW / 2;
          const childBaseY  = frameworkY + off.dy + SYNTH_H + DEPTH_GAP;
          placeSiblingGroup(children, `chat-response-cont-${cont.index}`, groupStartX, childBaseY);
        }
      }
    }
  }

  // ── Kick off: root-level children (secondary nodes) ─────────
  // Place them HORIZONTALLY to the right of the primary nodes, at the same Y as primary synthesis.
  const rootChildren = childrenOf.get(null) ?? [];
  const rootSynthId = isChat ? 'chat-response' : 'synthesis';

  if (rootChildren.length > 0) {
    // Right edge of the primary framework row
    const primaryRightEdge = isChat
      ? inputX + 220 + 80
      : startX + (fw - 1) * FW_SPACING - 110 + 220 + 80;

    const rootChildSlots = rootChildren.map((c) => {
      const cm = MODES.find((m) => m.id === c.modeId) || mode;
      return getSlotWidth(cm);
    });
    const totalRootW = rootChildSlots.reduce((a, b) => a + b, 0) + (rootChildren.length - 1) * SIBLING_GAP;

    // Start so the group begins just to the right of primary area.
    // For a single child, align roughly with primary synthesis Y.
    const groupStartX = primaryRightEdge + SIBLING_GAP;
    const rootBaseY   = isChat ? FW_Y : SYNTH_Y;

    placeSiblingGroup(rootChildren, rootSynthId, groupStartX, rootBaseY);
  }

  const finalNodes = nodes.map(n => ({
    ...n,
    position: {
      x: n.position.x + rootOffset.dx,
      y: n.position.y + rootOffset.dy
    }
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
    (contIndex: number, inp: string, mode: Mode, references: NodeReference[]) => {
      if (!activeSession) return;
      const cont = activeSession.continuations?.find((c) => c.index === contIndex);
      if (!cont) return;
      executeContinuation(contIndex, inp, mode, cont.synthesisPrefixContent, references);
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

  // theme-aware dot color — much more visible than CSS-variable
  const dotColor = theme === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.45)';

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
      />
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
