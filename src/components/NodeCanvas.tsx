'use client';

import { useMemo, useCallback, useEffect } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  type Node,
  type Edge,
  type NodeTypes,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useApp } from '@/lib/store';
import InputNode from './nodes/InputNode';
import FrameworkNode from './nodes/FrameworkNode';
import SynthesisNode from './nodes/SynthesisNode';

const nodeTypes: NodeTypes = {
  inputNode: InputNode,
  frameworkNode: FrameworkNode,
  synthesisNode: SynthesisNode,
};

function buildGraph(activeSession: NonNullable<ReturnType<typeof useApp>['state']['activeSession']>, selectedMode: NonNullable<ReturnType<typeof useApp>['state']['selectedMode']>, selectedNodeId: string | null) {
  const frameworks = selectedMode.frameworks;
  const fw = frameworks.length;
  const hSpacing = 250;
  const totalWidth = (fw - 1) * hSpacing;
  const startX = -totalWidth / 2;

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // ── Input node ──
  nodes.push({
    id: 'input',
    type: 'inputNode',
    position: { x: -150, y: 0 },
    data: { input: activeSession.input, selected: selectedNodeId === 'input' },
    selected: selectedNodeId === 'input',
  });

  const allFrameworksDone = activeSession.frameworkOutputs.every(
    (fo) => fo.status === 'complete' || fo.status === 'error'
  );
  const synth = activeSession.synthesisOutput;

  // ── Framework nodes + edges ──
  frameworks.forEach((f, i) => {
    const output = activeSession.frameworkOutputs.find((fo) => fo.frameworkId === f.id);
    const isComplete = output?.status === 'complete';
    const isStreaming = output?.status === 'streaming';

    nodes.push({
      id: f.id,
      type: 'frameworkNode',
      position: { x: startX + i * hSpacing - 110, y: 200 },
      data: {
        label: f.label,
        title: f.title,
        accent: f.accent,
        status: output?.status || 'idle',
        content: output?.content || '',
        error: output?.error,
        startTime: output?.startTime,
        endTime: output?.endTime,
        selected: selectedNodeId === f.id,
      },
      selected: selectedNodeId === f.id,
    });

    // Edge: input → framework
    edges.push({
      id: `input-${f.id}`,
      source: 'input',
      target: f.id,
      animated: isStreaming || (!isComplete && !allFrameworksDone),
      style: {
        stroke: isComplete ? 'var(--color-ash)' : isStreaming ? f.accent : 'var(--color-stone)',
        strokeWidth: 0.5,
        strokeDasharray: isComplete ? 'none' : '4 4',
        opacity: isComplete ? 0.6 : 1,
      },
    });
  });

  // ── Synthesis node ──
  nodes.push({
    id: 'synthesis',
    type: 'synthesisNode',
    position: { x: -160, y: 430 },
    data: {
      status: synth.status,
      content: synth.content,
      error: synth.error,
      startTime: synth.startTime,
      endTime: synth.endTime,
      selected: selectedNodeId === 'synthesis',
    },
    selected: selectedNodeId === 'synthesis',
  });

  // ── Synthesis edges (draw when all frameworks done) ──
  if (allFrameworksDone) {
    frameworks.forEach((f) => {
      const output = activeSession.frameworkOutputs.find((fo) => fo.frameworkId === f.id);
      const isComplete = output?.status === 'complete';
      edges.push({
        id: `${f.id}-synthesis`,
        source: f.id,
        target: 'synthesis',
        animated: synth.status === 'streaming' || synth.status === 'idle',
        style: {
          stroke: synth.status === 'complete' ? 'var(--color-ash)' : 'var(--color-signal)',
          strokeWidth: 0.5,
          strokeDasharray: synth.status === 'complete' ? 'none' : '4 4',
          opacity: isComplete ? 0.7 : 0.3,
        },
      });
    });
  }

  return { nodes, edges };
}

export default function NodeCanvas() {
  const { state, dispatch } = useApp();
  const { activeSession, selectedMode, detailPanelNodeId } = state;

  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    if (!activeSession || !selectedMode) return { nodes: [], edges: [] };
    return buildGraph(activeSession, selectedMode, detailPanelNodeId);
  }, [activeSession, selectedMode, detailPanelNodeId]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      dispatch({ type: 'OPEN_DETAIL', nodeId: node.id });
    },
    [dispatch]
  );

  const onPaneClick = useCallback(() => {
    dispatch({ type: 'CLOSE_DETAIL' });
  }, [dispatch]);

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25, duration: 300 }}
        minZoom={0.2}
        maxZoom={1.8}
        proOptions={{ hideAttribution: true }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="#1A1E2B"
        />
        <MiniMap
          nodeColor={() => '#252A38'}
          maskColor="rgba(8, 9, 12, 0.85)"
          style={{ background: '#0D0F14', border: '0.5px solid #1A1E2B', borderRadius: 4 }}
          zoomable
          pannable
        />
        <Controls
          showInteractive={false}
          style={{ background: '#0D0F14', border: '0.5px solid #1A1E2B', borderRadius: 4 }}
        />
      </ReactFlow>
    </div>
  );
}
