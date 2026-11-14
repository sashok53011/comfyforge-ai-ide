import React, { useState, useRef, useEffect } from 'react';
import { ComfyNodeData, ComfyLink, AIProviderConfig } from '../types';
import { Plus, Trash2, LayoutGrid, Grid, HelpCircle, CheckCircle2, Wand2, Loader2, Sparkles } from 'lucide-react';
import { askCopilot, stripCodeFences } from '../api';
import { useT } from '../i18n';

interface CanvasProps {
  nodes: ComfyNodeData[];
  links: ComfyLink[];
  setNodes: React.Dispatch<React.SetStateAction<ComfyNodeData[]>>;
  setLinks: React.Dispatch<React.SetStateAction<ComfyLink[]>>;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  onAddNodeModal: () => void;
  onOpenAIConstructor: () => void;
  aiConfig: AIProviderConfig;
}

export const Canvas: React.FC<CanvasProps> = ({
  nodes,
  links,
  setNodes,
  setLinks,
  selectedNodeId,
  setSelectedNodeId,
  onAddNodeModal,
  onOpenAIConstructor,
  aiConfig,
}) => {
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isPanningCanvas, setIsPanningCanvas] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [connecting, setConnecting] = useState<{ nodeId: string; outputName: string } | null>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [linkNotice, setLinkNotice] = useState<string | null>(null);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [aiMessage, setAiMessage] = useState<{ nodeId: string; text: string } | null>(null);
  const [aiBusyNodeId, setAiBusyNodeId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const GRID_SIZE = 30;
  const tr = useT();

  // Escape aborts a pending connection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setConnecting(null);
        setLinkNotice(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // A phone screen fits roughly one node at a time — start zoomed out.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      setZoom(0.65);
    }
  }, []);

  // Touch + mouse: pointer events cover both input types.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);

  const trackPointer = (e: React.PointerEvent) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };

  /** Two fingers take over: zoom instead of dragging/panning. */
  const startPinch = () => {
    const [a, b] = [...pointersRef.current.values()];
    pinchRef.current = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom };
    setDraggingNodeId(null);
    setIsPanningCanvas(false);
  };

  const handlePointerDownNode = (e: React.PointerEvent, node: ComfyNodeData) => {
    e.stopPropagation();
    trackPointer(e);
    // Touch pointers get implicit capture from the browser, so a drag keeps
    // reporting moves even when the finger leaves the node — no manual capture
    // (which would break taps on the node's own buttons).

    if (pointersRef.current.size >= 2) {
      startPinch();
      return;
    }

    setSelectedNodeId(node.id);
    setDraggingNodeId(node.id);
    setDragOffset({
      x: (e.clientX - pan.x) / zoom - node.position.x,
      y: (e.clientY - pan.y) / zoom - node.position.y,
    });
  };

  const handlePointerDownCanvas = (e: React.PointerEvent) => {
    trackPointer(e);

    if (pointersRef.current.size >= 2) {
      startPinch();
      return;
    }

    if (e.target === canvasRef.current || (e.target as HTMLElement).tagName === 'svg') {
      setIsPanningCanvas(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      setSelectedNodeId(null);
      setConnecting(null); // clicking empty space aborts a pending connection
      setLinkNotice(null);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (pointersRef.current.has(e.pointerId)) trackPointer(e);

    // Pinch zoom wins while two fingers are down.
    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const [a, b] = [...pointersRef.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const ratio = distance / pinchRef.current.distance;
      setZoom(Math.min(2, Math.max(0.4, pinchRef.current.zoom * ratio)));
      return;
    }

    if (connecting) {
      setPointer({ x: (e.clientX - pan.x) / zoom, y: (e.clientY - pan.y) / zoom });
    }
    if (draggingNodeId) {
      let newX = (e.clientX - pan.x) / zoom - dragOffset.x;
      let newY = (e.clientY - pan.y) / zoom - dragOffset.y;

      if (snapToGrid) {
        newX = Math.round(newX / GRID_SIZE) * GRID_SIZE;
        newY = Math.round(newY / GRID_SIZE) * GRID_SIZE;
      }

      setNodes((prev) =>
        prev.map((n) => (n.id === draggingNodeId ? { ...n, position: { x: Math.max(0, newX), y: Math.max(0, newY) } } : n))
      );
    } else if (isPanningCanvas) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    setDraggingNodeId(null);
    setIsPanningCanvas(false);
    // `connecting` survives pointer-up: it is resolved by tapping an input port
    // or cancelled by tapping empty canvas / pressing Escape.
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    const newZoom = e.deltaY < 0 ? Math.min(zoom * zoomFactor, 2.0) : Math.max(zoom / zoomFactor, 0.4);
    setZoom(newZoom);
  };

  const deleteNode = (id: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setLinks((prev) => prev.filter((l) => l.fromNode !== id && l.toNode !== id));
    if (selectedNodeId === id) setSelectedNodeId(null);
  };

  /** Second half of a connection: user clicked an input port while `connecting`. */
  const completeConnection = (e: React.MouseEvent, targetNode: ComfyNodeData, inputName: string) => {
    e.stopPropagation();
    if (!connecting) return;

    const source = nodes.find((n) => n.id === connecting.nodeId);
    const pendingOutput = connecting.outputName;
    setConnecting(null);

    if (!source) {
      setLinkNotice(tr('sourceGone'));
      return;
    }
    if (source.id === targetNode.id) {
      setLinkNotice(tr('connectionCancelled'));
      return;
    }

    const out = source.outputs.find((o) => o.name === pendingOutput);
    const inp = targetNode.inputs.find((i) => i.name === inputName);
    if (!out || !inp) {
      setLinkNotice(tr('portNotFound'));
      return;
    }
    if (out.type !== inp.type && out.type !== 'UNKNOWN' && inp.type !== 'UNKNOWN') {
      setLinkNotice(tr('typeMismatch', { out: out.name, outType: out.type, in: inputName, inType: inp.type }));
      return;
    }
    if (links.some((l) => l.fromNode === source.id && l.fromOutput === out.name && l.toNode === targetNode.id && l.toInput === inputName)) {
      setLinkNotice(tr('alreadyConnected'));
      return;
    }

    const newLink: ComfyLink = {
      id: `link_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      fromNode: source.id,
      fromOutput: out.name,
      toNode: targetNode.id,
      toInput: inputName,
    };
    // Inputs hold at most one link (ComfyUI semantics): replace any existing one.
    setLinks((prev) => [...prev.filter((l) => !(l.toNode === targetNode.id && l.toInput === inputName)), newLink]);
    setLinkNotice(null);
  };

  const handleAutoArrange = () => {
    const columns: Record<string, ComfyNodeData[]> = {
      loaders: [],
      database: [],
      conditioning: [],
      latent: [],
      sampling: [],
      latent_ops: [],
      scripts: [],
      documents: [],
      image: [],
      other: []
    };

    nodes.forEach((node) => {
      const cat = columns[node.category] ? node.category : 'other';
      columns[cat].push(node);
    });

    let colIndex = 0;
    const updatedNodes = [...nodes];

    Object.entries(columns).forEach(([_cat, catNodes]) => {
      if (catNodes.length === 0) return;
      let rowIndex = 0;
      catNodes.forEach((node) => {
        const x = 80 + colIndex * 360;
        const y = 80 + rowIndex * 240;
        const target = updatedNodes.find((n) => n.id === node.id);
        if (target) {
          target.position = { x, y };
        }
        rowIndex++;
      });
      colIndex++;
    });

    setNodes(updatedNodes);
  };

  // AI Node Actions — every action goes through the real copilot endpoint.
  const describeNode = (node: ComfyNodeData) =>
    JSON.stringify({
      type: node.type,
      title: node.title,
      category: node.category,
      inputs: node.inputs.map((i) => `${i.name}:${i.type}`),
      outputs: node.outputs.map((o) => `${o.name}:${o.type}`),
      widgets: node.widgets.map((w) => ({ name: w.name, type: w.type, value: w.value })),
      receivesFrom: links.filter((l) => l.toNode === node.id).map((l) => l.fromNode),
      feedsInto: links.filter((l) => l.fromNode === node.id).map((l) => l.toNode),
    });

  const handleAiAction = async (e: React.MouseEvent, node: ComfyNodeData, action: 'clarify' | 'fix' | 'generate') => {
    e.stopPropagation();
    if (aiBusyNodeId) return;

    let userPrompt: string | null = null;
    if (action === 'generate') {
      userPrompt = window.prompt('Describe how this node should behave or how its parameters should change:');
      if (!userPrompt) return;
    }

    setAiBusyNodeId(node.id);
    setAiMessage({
      nodeId: node.id,
      text: action === 'generate' ? tr('aiGenerating') : tr('aiAnalysing'),
    });

    try {
      const workflowContext = { nodes, links };

      if (action === 'clarify') {
        const reply = await askCopilot({
          message:
            `Explain this node in at most 3 short sentences: what it does, what its inputs expect, what its outputs produce. Plain text, no markdown.\n\nNode: ${describeNode(node)}`,
          workflowContext,
          aiConfig,
        });
        setAiMessage({ nodeId: node.id, text: reply });
        return;
      }

      if (action === 'fix') {
        const reply = await askCopilot({
          message:
            `Review this node for concrete configuration problems: empty widget values, obviously wrong ranges, type mismatches with connected nodes. One issue per line starting with "- ", or answer exactly "No issues found" if it is sane.\n\nNode: ${describeNode(node)}`,
          workflowContext,
          aiConfig,
        });
        setAiMessage({ nodeId: node.id, text: reply });
        return;
      }

      const reply = await askCopilot({
        message:
          `Update this ComfyUI node's parameters for the user request. Reply with JSON only, no commentary:\n` +
          `{"title": string, "widgets": [{"name": string, "value": string|number}]}\n` +
          `Include only widgets you want to change and use their exact existing names.\n\n` +
          `Node: ${describeNode(node)}\nUser request: ${userPrompt}`,
        workflowContext,
        aiConfig,
      });

      let parsed: { title?: string; widgets?: { name: string; value: unknown }[] };
      try {
        parsed = JSON.parse(stripCodeFences(reply));
      } catch {
        // The model answered in prose instead of JSON — show it rather than fail silently.
        setAiMessage({ nodeId: node.id, text: reply });
        return;
      }

      const updates = new Map<string, unknown>(
        (Array.isArray(parsed.widgets) ? parsed.widgets : []).map((w) => [String(w?.name), w?.value])
      );
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== node.id) return n;
          const title = typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim().slice(0, 60) : n.title;
          return {
            ...n,
            title,
            widgets: n.widgets.map((w) => (updates.has(w.name) ? { ...w, value: updates.get(w.name) } : w)),
          };
        })
      );
      setAiMessage({ nodeId: node.id, text: tr('aiApplied', { n: updates.size, title: node.title }) });
    } catch (err: any) {
      setAiMessage({ nodeId: node.id, text: `${tr('aiError')}: ${err?.message || 'no response'}` });
    } finally {
      setAiBusyNodeId(null);
    }
  };

  const getNodeColor = (style: string) => {
    switch (style) {
      case 'neon':
        return 'border-indigo-500/80 shadow-indigo-500/20 bg-slate-900/95';
      case 'opensource':
        return 'border-emerald-500/80 shadow-emerald-500/20 bg-slate-900/95';
      case 'compiled':
        return 'border-amber-500/80 shadow-amber-500/20 bg-slate-900/95';
      default:
        return 'border-slate-700 shadow-slate-900/50 bg-slate-900/95';
    }
  };

  const getHeaderColor = (style: string) => {
    switch (style) {
      case 'neon':
        return 'bg-gradient-to-r from-indigo-900/80 to-violet-900/80 text-indigo-200 border-indigo-700/50';
      case 'opensource':
        return 'bg-gradient-to-r from-emerald-900/80 to-teal-900/80 text-emerald-200 border-emerald-700/50';
      case 'compiled':
        return 'bg-gradient-to-r from-amber-900/80 to-orange-900/80 text-amber-200 border-amber-700/50';
      default:
        return 'bg-slate-800 text-slate-200 border-slate-700';
    }
  };

  return (
    <div
      ref={canvasRef}
      className="canvas-surface relative w-full h-[calc(100vh-7.5rem)] lg:h-[calc(100vh-4rem)] overflow-hidden bg-slate-950 select-none cursor-grab active:cursor-grabbing"
      onPointerDown={handlePointerDownCanvas}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
    >
      {/* Grid Pattern Background */}
      <div
        className="absolute inset-0 pointer-events-none opacity-25"
        style={{
          backgroundImage: `radial-gradient(circle, #6366f1 1px, transparent 1px)`,
          backgroundSize: `${GRID_SIZE * zoom}px ${GRID_SIZE * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      />

      {/* Floating Canvas Toolbar */}
      <div className="absolute top-4 left-4 z-20 flex flex-wrap items-center gap-1.5 sm:gap-2 max-w-[calc(100%-2rem)] bg-slate-900/95 border border-slate-800 p-2 rounded-xl shadow-xl backdrop-blur-md">
        <button
          onClick={onAddNodeModal}
          title={tr('addNode')}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition-all"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">{tr('addNode')}</span>
        </button>

        <button
          onClick={onOpenAIConstructor}
          title={tr('aiConstructor')}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-md transition-all"
        >
          <Sparkles className="w-3.5 h-3.5 animate-pulse" />
          <span className="hidden sm:inline">{tr('aiConstructor')}</span>
        </button>

        <button
          onClick={handleAutoArrange}
          title={tr('autoArrange')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all border border-slate-700"
        >
          <LayoutGrid className="w-3.5 h-3.5 text-indigo-400" />
          <span className="hidden sm:inline">{tr('autoArrange')}</span>
        </button>

        <button
          onClick={() => setSnapToGrid(!snapToGrid)}
          title={tr('snapTitle')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
            snapToGrid
              ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300'
              : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Grid className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{snapToGrid ? tr('snapOn') : tr('snapOff')}</span>
        </button>

        <div className="h-4 w-[1px] bg-slate-800" />
        <button
          onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
          title={tr('resetView')}
          className="px-2.5 py-1 text-xs text-slate-400 hover:text-white rounded transition-colors"
        >
          <span className="hidden sm:inline">{tr('resetView')} </span>({Math.round(zoom * 100)}%)
        </button>
      </div>

      {/* Connection feedback */}
      {(linkNotice || connecting) && (
        <div className="absolute top-20 left-4 z-30 max-w-[calc(100%-2rem)] sm:max-w-md px-3 py-2 rounded-lg border border-cyan-500/40 bg-slate-950/95 shadow-xl backdrop-blur-md text-[11px] font-mono text-cyan-200">
          {linkNotice ??
            tr('connectingTo', {
              port: connecting?.outputName || '',
              title: nodes.find((n) => n.id === connecting?.nodeId)?.title || '',
            })}
        </div>
      )}

      {/* Transformable Graph Container */}
      <div
        className="absolute inset-0 pointer-events-none origin-top-left transition-transform duration-75"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
      >
        {/* SVG Links Layer */}
        <svg className="absolute inset-0 w-[5000px] h-[5000px] pointer-events-none z-0 overflow-visible">
          {links.map((link) => {
            const fromNode = nodes.find((n) => n.id === link.fromNode);
            const toNode = nodes.find((n) => n.id === link.toNode);
            if (!fromNode || !toNode) return null;

            const fromX = fromNode.position.x + fromNode.size.width;
            const fromY = fromNode.position.y + 60;
            const toX = toNode.position.x;
            const toY = toNode.position.y + 80;

            const dx = Math.abs(toX - fromX) * 0.5;

            return (
              <g key={link.id}>
                <path
                  d={`M ${fromX} ${fromY} C ${fromX + dx} ${fromY}, ${toX - dx} ${toY}, ${toX} ${toY}`}
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth="3"
                  strokeOpacity="0.8"
                  className="transition-all hover:stroke-indigo-400"
                />
              </g>
            );
          })}

          {/* Live preview of the connection being dragged out */}
          {connecting && (() => {
            const src = nodes.find((n) => n.id === connecting.nodeId);
            if (!src) return null;
            const fromX = src.position.x + src.size.width;
            const fromY = src.position.y + 60;
            const dx = Math.abs(pointer.x - fromX) * 0.5;
            return (
              <path
                d={`M ${fromX} ${fromY} C ${fromX + dx} ${fromY}, ${pointer.x - dx} ${pointer.y}, ${pointer.x} ${pointer.y}`}
                fill="none"
                stroke="#22d3ee"
                strokeWidth="3"
                strokeDasharray="8 6"
                className="animate-pulse"
              />
            );
          })()}
        </svg>

        {/* Nodes Layer */}
        {nodes.map((node) => {
          const isSelected = selectedNodeId === node.id;
          const nodeAiMsg = aiMessage?.nodeId === node.id ? aiMessage.text : null;

          return (
            <div
              key={node.id}
              onPointerDown={(e) => handlePointerDownNode(e, node)}
              className={`absolute pointer-events-auto rounded-xl border shadow-2xl transition-shadow ${getNodeColor(
                node.style
              )} ${isSelected ? 'ring-2 ring-indigo-500 shadow-indigo-500/30' : ''}`}
              style={{
                left: `${node.position.x}px`,
                top: `${node.position.y}px`,
                width: `${node.size.width}px`,
              }}
            >
              {/* Node Header */}
              <div
                className={`flex items-center justify-between px-3 py-2 rounded-t-xl border-b ${getHeaderColor(
                  node.style
                )}`}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                  <span className="text-xs font-bold tracking-wide truncate">{node.title}</span>
                </div>
                <div className="flex items-center gap-1">
                  {/* AI Action Buttons on each node */}
                  <button
                    onClick={(e) => handleAiAction(e, node, 'clarify')}
                    title={tr('clarifyNode')}
                    disabled={aiBusyNodeId !== null}
                    className="p-1.5 sm:p-1 text-indigo-300 hover:text-white hover:bg-indigo-600/30 rounded transition-colors disabled:opacity-40"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => handleAiAction(e, node, 'fix')}
                    title={tr('reviewNode')}
                    disabled={aiBusyNodeId !== null}
                    className="p-1.5 sm:p-1 text-emerald-300 hover:text-white hover:bg-emerald-600/30 rounded transition-colors disabled:opacity-40"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => handleAiAction(e, node, 'generate')}
                    title={tr('generateParams')}
                    disabled={aiBusyNodeId !== null}
                    className="p-1.5 sm:p-1 text-amber-300 hover:text-white hover:bg-amber-600/30 rounded transition-colors disabled:opacity-40"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteNode(node.id); }}
                    title={tr('deleteNodeTitle')}
                    className="p-1.5 sm:p-1 text-slate-400 hover:text-red-400 rounded transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* AI Popup Message banner if active */}
              {nodeAiMsg && (
                <div className="p-2 bg-indigo-950/90 border-b border-indigo-800 text-[10px] text-indigo-200 font-mono flex items-center justify-between">
                  <span className="flex items-center gap-1.5 min-w-0">
                    {aiBusyNodeId === node.id && <Loader2 className="w-3 h-3 shrink-0 animate-spin" />}
                    <span className="break-words">{nodeAiMsg}</span>
                  </span>
                  <button onClick={() => setAiMessage(null)} className="text-indigo-400 hover:text-white ml-2 shrink-0">×</button>
                </div>
              )}

              {/* Node Body & Widgets */}
              <div className="p-3 space-y-3">
                <div className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">{node.type}</div>

                {node.widgets.map((widget, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-[11px] text-slate-300 font-medium">
                      <span>{widget.name}</span>
                      {widget.type !== 'STRING' && <span className="font-mono text-indigo-400">{widget.value}</span>}
                    </div>

                    {widget.type === 'COMBO' ? (
                      <select
                        value={widget.value}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNodes((prev) =>
                            prev.map((n) =>
                              n.id === node.id
                                ? {
                                    ...n,
                                    widgets: n.widgets.map((w, i) => (i === idx ? { ...w, value: val } : w)),
                                  }
                                : n
                            )
                          );
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                      >
                        {widget.options?.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : widget.type === 'STRING' ? (
                      <textarea
                        rows={2}
                        value={widget.value}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNodes((prev) =>
                            prev.map((n) =>
                              n.id === node.id
                                ? {
                                    ...n,
                                    widgets: n.widgets.map((w, i) => (i === idx ? { ...w, value: val } : w)),
                                  }
                                : n
                            )
                          );
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 resize-none font-mono"
                      />
                    ) : widget.min !== undefined && widget.max !== undefined ? (
                      <input
                        type="range"
                        min={widget.min}
                        max={widget.max}
                        step={widget.step || 1}
                        value={widget.value}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setNodes((prev) =>
                            prev.map((n) =>
                              n.id === node.id
                                ? {
                                    ...n,
                                    widgets: n.widgets.map((w, i) => (i === idx ? { ...w, value: val } : w)),
                                  }
                                : n
                            )
                          );
                        }}
                        className="w-full accent-indigo-500 cursor-pointer"
                      />
                    ) : (
                      <input
                        type="number"
                        step={widget.step || 'any'}
                        value={widget.value}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setNodes((prev) =>
                            prev.map((n) =>
                              n.id === node.id
                                ? {
                                    ...n,
                                    widgets: n.widgets.map((w, i) => (i === idx ? { ...w, value: Number.isNaN(val) ? w.value : val } : w)),
                                  }
                                : n
                            )
                          );
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                      />
                    )}
                  </div>
                ))}

                {/* Ports Section */}
                <div className="pt-2 border-t border-slate-800/60 flex justify-between text-[10px] font-mono text-slate-400">
                  <div className="space-y-1">
                    {node.inputs.map((inp, i) => {
                      const isTaken = links.some((l) => l.toNode === node.id && l.toInput === inp.name);
                      return (
                        <div
                          key={i}
                          onClick={(e) => completeConnection(e, node, inp.name)}
                          title={
                            connecting
                              ? isTaken
                                ? `Already connected → ${inp.name} (${inp.type})`
                                : `Connect → ${inp.name} (${inp.type})`
                              : `${inp.name}: ${inp.type}${isTaken ? ' (connected)' : ''}`
                          }
                          className={`flex items-center gap-1.5 ${
                            connecting && !isTaken ? 'cursor-pointer hover:text-white' : ''
                          }`}
                        >
                          <div
                            className={`w-3.5 h-3.5 sm:w-2.5 sm:h-2.5 rounded-full border transition-all ${
                              connecting && !isTaken
                                ? 'border-indigo-400 bg-slate-950 animate-pulse ring-2 ring-cyan-400/70'
                                : isTaken
                                  ? 'border-emerald-400 bg-emerald-950'
                                  : 'border-indigo-400 bg-slate-950'
                            }`}
                          />
                          <span className={isTaken ? 'text-slate-300' : ''}>{inp.name}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="space-y-1 text-right">
                    {node.outputs.map((out, i) => (
                      <div key={i} className="flex items-center justify-end gap-1.5">
                        <span>{out.name}</span>
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            setLinkNotice(null);
                            setConnecting((prev) =>
                              prev && prev.nodeId === node.id && prev.outputName === out.name
                                ? null
                                : { nodeId: node.id, outputName: out.name }
                            );
                          }}
                          title={`${out.name}: ${out.type} — click to start a connection`}
                          className={`w-3.5 h-3.5 sm:w-2.5 sm:h-2.5 rounded-full border cursor-pointer transition-colors ${
                            connecting?.nodeId === node.id && connecting?.outputName === out.name
                              ? 'border-cyan-300 bg-cyan-400 animate-pulse'
                              : 'border-emerald-400 bg-emerald-950 hover:bg-emerald-400'
                          }`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
