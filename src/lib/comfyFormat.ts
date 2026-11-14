import { ComfyLink, ComfyNodeData, NodeCategory, NodeWidget, Workflow } from '../types';

/**
 * Conversion between this app's internal workflow format and the two formats
 * ComfyUI actually uses:
 *
 *  - "Save" (UI graph) format: { nodes: [...], links: [[id, from, fromSlot, to, toSlot, type]], ... }
 *    — what the ComfyUI canvas loads from a dropped .json file.
 *  - API (prompt) format: { "3": { class_type, inputs } } — what POST /prompt accepts.
 *
 * The internal snapshot is stashed under `extra.comfyforge` (and per-node in
 * `properties`) so exporting → re-importing loses nothing on our side, while a
 * file that travelled through real ComfyUI still imports via the converters.
 */

export interface ComfyUiInput {
  name: string;
  type: string;
  link: number | null;
  slot_index?: number;
}

export interface ComfyUiOutput {
  name: string;
  type: string;
  links: number[] | null;
  slot_index?: number;
}

export interface ComfyUiNode {
  id: number;
  type: string;
  pos: [number, number];
  size: [number, number];
  flags?: Record<string, unknown>;
  order?: number;
  mode?: number;
  inputs?: ComfyUiInput[];
  outputs?: ComfyUiOutput[];
  properties?: Record<string, unknown>;
  widgets_values?: unknown[];
  color?: string;
  bgcolor?: string;
}

/** [linkId, originNodeId, originSlot, targetNodeId, targetSlot, dataType] */
export type ComfyUiLink = [number, number, number, number, number, string];

export interface ComfyUiGraph {
  last_node_id?: number;
  last_link_id?: number;
  nodes: ComfyUiNode[];
  links: ComfyUiLink[];
  groups?: unknown[];
  config?: Record<string, unknown>;
  extra?: Record<string, unknown> & { comfyforge?: Workflow };
  version?: number;
}

/** Widget names ComfyUI uses for the common node types (unknown types fall back to value_N). */
const KNOWN_WIDGET_NAMES: Record<string, string[]> = {
  CheckpointLoaderSimple: ['ckpt_name'],
  LoraLoader: ['lora_name', 'strength_model', 'strength_clip'],
  CLIPTextEncode: ['text'],
  CLIPTextEncodeSDXL: ['width', 'height', 'crop_w', 'crop_h', 'target_width', 'target_height', 'text_g', 'text_l'],
  CLIPSetLastLayer: ['stop_at_clip_layer'],
  KSampler: ['seed', 'control_after_generate', 'steps', 'cfg', 'sampler_name', 'scheduler', 'denoise'],
  KSamplerAdvanced: [
    'add_noise', 'noise_seed', 'control_after_generate', 'steps', 'cfg', 'sampler_name', 'scheduler',
    'start_at_step', 'end_at_step', 'return_with_leftover_noise',
  ],
  SamplerCustom: ['add_noise', 'noise_seed', 'steps', 'cfg', 'sampler_name', 'scheduler', 'denoise'],
  EmptyLatentImage: ['width', 'height', 'batch_size'],
  EmptyLatentImageMasked: ['width', 'height', 'batch_size'],
  LoadImage: ['image'],
  LoadImageMask: ['image', 'channel'],
  SaveImage: ['filename_prefix'],
  ImageScale: ['upscale_method', 'width', 'height'],
  ImageScaleBy: ['upscale_method', 'scale_by'],
  LatentUpscale: ['upscale_method', 'width', 'height'],
  VAEDecodeTiled: ['tile_size', 'overlap'],
  FreeU: ['b1', 'b2', 's1', 's2'],
  UnetLoaderGGUF: ['unet_name'],
};

/** Guesses a widget value type from its name and the value we found. */
function guessWidgetType(name: string, value: unknown): NodeWidget['type'] {
  if (typeof value === 'boolean') return 'BOOLEAN';
  if (Array.isArray(value)) return 'COMBO';
  if (typeof value === 'number') {
    const floaty = /cfg|denoise|strength|temp|scale|ratio|weight|guidance|sigma|eta|fluence/i.test(name);
    return floaty || !Number.isInteger(value) ? 'FLOAT' : 'INT';
  }
  if (typeof value === 'string') {
    const combo = /sampler|scheduler|ckpt|checkpoint|lora|model|unet|vae|clip|image|file|method|channel|prefix|upscal/i.test(name);
    return combo ? 'COMBO' : 'STRING';
  }
  return 'STRING';
}

function guessCategory(type: string): NodeCategory {
  const t = type.toLowerCase();
  if (/sql|database|dml|ddl|dcl|tcl|query|sqlite|loadernode/.test(t) && !/imageload|loadimage/.test(t)) return 'database';
  if (/script|python|shell|bash|powershell|\.bat|\.sh|\.ps1/.test(t)) return 'scripts';
  if (/document|markdown|csv|jsonparse|textfile|parse/.test(t)) return 'documents';
  if (/checkpoint|loader|unet|lora|vaeencode|clipload|embed/.test(t)) return 'loaders';
  if (/textencode|conditioning|clip|prompt/.test(t)) return 'conditioning';
  if (/sampler|sample|ksampler/.test(t)) return 'sampling';
  if (/latent/.test(t)) return 'latent';
  if (/image|vaedecode|saveimage|preview|upscale/.test(t)) return 'image';
  return 'utils';
}

function guessTitle(node: ComfyUiNode | { type?: string }): string {
  return node.type || 'Node';
}

export interface ComfyApiEntry {
  class_type?: string;
  inputs?: Record<string, unknown>;
  _meta?: { title?: string };
}

/** ComfyUI API (prompt) format: { "<nodeId>": { class_type, inputs, _meta } } */
export type ComfyApiPrompt = Record<string, ComfyApiEntry>;

/* ------------------------------------------------------------------ export */

/**
 * Serialises the workflow as the API (prompt) format that POST /prompt accepts.
 * Widget values become scalar inputs, wired inputs become ["<nodeId>", slot].
 */
export function exportToComfyApiPrompt(workflow: Workflow): ComfyApiPrompt {
  const idMap = new Map<string, string>();
  workflow.nodes.forEach((node, i) => idMap.set(node.id, String(i + 1)));

  const prompt: ComfyApiPrompt = {};

  workflow.nodes.forEach((node) => {
    const nodeId = idMap.get(node.id)!;
    const inputs: Record<string, unknown> = {};

    node.widgets.forEach((w) => {
      inputs[w.name] = w.value;
    });

    node.inputs.forEach((port) => {
      const link = workflow.links.find((l) => l.toNode === node.id && l.toInput === port.name);
      if (!link) return;
      const fromId = idMap.get(link.fromNode);
      const fromNode = workflow.nodes.find((n) => n.id === link.fromNode);
      const slot = fromNode?.outputs.findIndex((o) => o.name === link.fromOutput) ?? -1;
      if (fromId === undefined || slot < 0) return;
      inputs[port.name] = [fromId, slot];
    });

    prompt[nodeId] = { class_type: node.type, inputs, _meta: { title: node.title } };
  });

  return prompt;
}

/** Serialises the internal workflow as a ComfyUI UI-graph JSON. */
export function exportToComfyUi(workflow: Workflow): ComfyUiGraph {
  const idMap = new Map<string, number>();
  workflow.nodes.forEach((node, i) => idMap.set(node.id, i + 1));

  const links: ComfyUiLink[] = [];
  const linkIdMap = new Map<string, number>();

  workflow.links.forEach((link) => {
    if (!idMap.has(link.fromNode) || !idMap.has(link.toNode)) return;
    const fromNode = workflow.nodes.find((n) => n.id === link.fromNode);
    const toNode = workflow.nodes.find((n) => n.id === link.toNode);
    if (!fromNode || !toNode) return;
    const fromSlot = fromNode.outputs.findIndex((o) => o.name === link.fromOutput);
    const toSlot = toNode.inputs.findIndex((i) => i.name === link.toInput);
    if (fromSlot < 0 || toSlot < 0) return;
    const numericId = links.length + 1;
    linkIdMap.set(link.id, numericId);
    links.push([numericId, idMap.get(link.fromNode)!, fromSlot, idMap.get(link.toNode)!, toSlot, fromNode.outputs[fromSlot].type]);
  });

  const nodes: ComfyUiNode[] = workflow.nodes.map((node, index) => {
    const numericId = idMap.get(node.id)!;
    const outputs: ComfyUiOutput[] = node.outputs.map((out, slot) => ({
      name: out.name,
      type: out.type,
      slot_index: slot,
      links: links.filter((l) => l[1] === numericId && l[2] === slot).map((l) => l[0]),
    }));
    const inputs: ComfyUiInput[] = node.inputs.map((inp, slot) => {
      const link = workflow.links.find((l) => l.toNode === node.id && l.toInput === inp.name);
      return {
        name: inp.name,
        type: inp.type,
        slot_index: slot,
        link: link && linkIdMap.has(link.id) ? linkIdMap.get(link.id)! : null,
      };
    });

    return {
      id: numericId,
      type: node.type,
      pos: [node.position.x, node.position.y],
      size: [node.size.width, node.size.height],
      flags: {},
      order: index,
      mode: 0,
      ...(inputs.length ? { inputs } : {}),
      ...(outputs.length ? { outputs } : {}),
      properties: {
        'Node name for S&R': node.title,
        comfyforge_category: node.category,
        comfyforge_style: node.style,
        ...(node.customCode ? { comfyforge_custom_code: node.customCode } : {}),
      },
      widgets_values: node.widgets.map((w) => w.value),
    };
  });

  return {
    last_node_id: workflow.nodes.length,
    last_link_id: links.length,
    nodes,
    links,
    groups: [],
    config: {},
    extra: { comfyforge: workflow },
    version: 0.4,
  };
}

/* ------------------------------------------------------------------ import */

export function isComfyUiGraph(value: unknown): value is ComfyUiGraph {
  const graph = value as ComfyUiGraph | null;
  return !!graph && Array.isArray(graph.nodes) && graph.nodes.length > 0 &&
    typeof graph.nodes[0] === 'object' && graph.nodes[0] !== null && Array.isArray((graph.nodes[0] as ComfyUiNode).pos);
}

export function isComfyApiPrompt(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.values(value as Record<string, ComfyApiEntry>);
  return entries.length > 0 && entries.every((e) => e && typeof e === 'object' && typeof e.class_type === 'string');
}

function isInternalWorkflow(value: unknown): value is Workflow {
  const wf = value as Workflow | null;
  return !!wf && Array.isArray(wf.nodes) && Array.isArray(wf.links) && !!wf.nodes[0] &&
    typeof wf.nodes[0].position === 'object';
}

/** Accepts internal, ComfyUI UI-graph and ComfyUI API (prompt) JSON. */
export function importFromComfy(value: unknown, fallbackName: string): Workflow | null {
  if (isInternalWorkflow(value)) return value;
  if (isComfyUiGraph(value)) return fromComfyUiGraph(value, fallbackName);
  if (isComfyApiPrompt(value)) return fromComfyApiPrompt(value as Record<string, ComfyApiEntry>, fallbackName);
  return null;
}

function fromComfyUiGraph(graph: ComfyUiGraph, fallbackName: string): Workflow {
  // Lossless round-trip: our own export carries the full internal snapshot.
  const embedded = graph.extra?.comfyforge;
  if (embedded && isInternalWorkflow(embedded)) return embedded;

  const linkById = new Map<number, ComfyUiLink>();
  (graph.links || []).forEach((l) => linkById.set(l[0], l));

  const nodeId = (numeric: number) => `node_${numeric}`;
  const outputNameAt = (numericNode: number, slot: number) => {
    const owner = graph.nodes.find((n) => n.id === numericNode);
    return owner?.outputs?.[slot]?.name || `out_${slot}`;
  };
  const inputNameAt = (numericNode: number, slot: number) => {
    const owner = graph.nodes.find((n) => n.id === numericNode);
    return owner?.inputs?.[slot]?.name || `in_${slot}`;
  };

  const links: ComfyLink[] = (graph.links || []).map((l) => ({
    id: `link_${l[0]}`,
    fromNode: nodeId(l[1]),
    fromOutput: outputNameAt(l[1], l[2]),
    toNode: nodeId(l[3]),
    toInput: inputNameAt(l[3], l[4]),
  }));

  const nodes: ComfyNodeData[] = graph.nodes.map((raw) => {
    const props = raw.properties || {};
    const customCode = typeof props.comfyforge_custom_code === 'string' ? props.comfyforge_custom_code : undefined;
    const widgetNames = KNOWN_WIDGET_NAMES[raw.type] || [];
    const rawValues = raw.widgets_values || [];

    const widgets: NodeWidget[] = rawValues.map((value, i) => {
      const name = widgetNames[i] || `value_${i + 1}`;
      const type = guessWidgetType(name, value);
      const resolvedValue = type === 'COMBO' && !Array.isArray(value) ? String(value) : value;
      return { name, type, value: resolvedValue, ...(type === 'COMBO' ? { options: [String(resolvedValue)] } : {}) };
    });

    const title =
      (typeof props.comfyforge_title === 'string' && props.comfyforge_title) ||
      (typeof props['Node name for S&R'] === 'string' && props['Node name for S&R']) ||
      guessTitle(raw);

    return {
      id: nodeId(raw.id),
      type: raw.type,
      title,
      category: typeof props.comfyforge_category === 'string' ? (props.comfyforge_category as NodeCategory) : guessCategory(raw.type),
      style: typeof props.comfyforge_style === 'string' ? (props.comfyforge_style as ComfyNodeData['style']) : 'classic',
      position: { x: raw.pos?.[0] ?? 80, y: raw.pos?.[1] ?? 80 },
      size: { width: raw.size?.[0] ?? 280, height: raw.size?.[1] ?? 180 },
      inputs: (raw.inputs || []).map((inp) => ({ name: inp.name, type: inp.type || 'UNKNOWN', ...(inp.link != null ? { linkId: `link_${inp.link}` } : {}) })),
      outputs: (raw.outputs || []).map((out) => ({ name: out.name, type: out.type || 'UNKNOWN' })),
      widgets,
      ...(customCode ? { customCode } : {}),
    };
  });

  return {
    id: `wf_${Date.now().toString(36)}`,
    name: fallbackName,
    description: 'Imported from a ComfyUI workflow JSON.',
    nodes,
    links,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };
}

function fromComfyApiPrompt(entries: Record<string, ComfyApiEntry>, fallbackName: string): Workflow {
  const keys = Object.keys(entries);
  const nodes: ComfyNodeData[] = [];
  const links: ComfyLink[] = [];

  keys.forEach((key, index) => {
    const entry = entries[key];
    const inputs: ComfyNodeData['inputs'] = [];
    const widgets: NodeWidget[] = [];

    Object.entries(entry.inputs || {}).forEach(([name, value]) => {
      if (Array.isArray(value) && value.length === 2 && (typeof value[0] === 'string' || typeof value[0] === 'number')) {
        inputs.push({ name, type: 'UNKNOWN' });
        links.push({
          id: `link_${key}_${name}`,
          fromNode: `node_${value[0]}`,
          fromOutput: `out_${value[1]}`,
          toNode: `node_${key}`,
          toInput: name,
        });
      } else {
        const type = guessWidgetType(name, value);
        widgets.push({ name, type, value: type === 'COMBO' ? String(value) : value, ...(type === 'COMBO' ? { options: [String(value)] } : {}) });
      }
    });

    const col = index % 3;
    const row = Math.floor(index / 3);
    nodes.push({
      id: `node_${key}`,
      type: entry.class_type || 'UnknownNode',
      title: entry._meta?.title || entry.class_type || `node ${key}`,
      category: guessCategory(entry.class_type || ''),
      style: 'classic',
      position: { x: 80 + col * 360, y: 80 + row * 280 },
      size: { width: 300, height: 200 },
      inputs,
      // API format does not declare outputs; slots are implied by references.
      outputs: [],
      widgets,
    });
  });

  // Outputs are referenced by slot index, so synthesise them where links point at a node.
  links.forEach((link) => {
    const source = nodes.find((n) => n.id === link.fromNode);
    if (!source) return;
    const slot = Number(link.fromOutput.replace(/^out_/, ''));
    const count = Math.max(0, Number.isInteger(slot) ? slot + 1 : 1);
    while (source.outputs.length < count) {
      source.outputs.push({ name: `out_${source.outputs.length}`, type: 'UNKNOWN' });
    }
  });

  return {
    id: `wf_${Date.now().toString(36)}`,
    name: fallbackName,
    description: 'Imported from a ComfyUI API (prompt) JSON.',
    nodes,
    links,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };
}
