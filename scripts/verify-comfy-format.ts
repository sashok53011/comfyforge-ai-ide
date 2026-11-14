/**
 * Self-check for the ComfyUI format converter.
 * Run: npx tsx scripts/verify-comfy-format.ts
 */
import { DEFAULT_WORKFLOWS } from '../src/data/templates';
import { exportToComfyApiPrompt, exportToComfyUi, importFromComfy, isComfyApiPrompt, isComfyUiGraph } from '../src/lib/comfyFormat';

let failures = 0;
function check(name: string, condition: unknown, detail?: unknown) {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${name}`, detail ?? '');
  }
}

/* 1. Round-trip of an internal workflow must be lossless. */
console.log('round-trip (internal -> ComfyUI -> internal)');
const original = DEFAULT_WORKFLOWS[0];
const exported = exportToComfyUi(original);
const back = importFromComfy(JSON.parse(JSON.stringify(exported)), 'x');
check('graph is detected as ComfyUI format', isComfyUiGraph(exported));
check('node count preserved', back?.nodes.length === original.nodes.length, back?.nodes.length);
check('link count preserved', back?.links.length === original.links.length, `${back?.links.length} vs ${original.links.length}`);
check('snapshot is identical', JSON.stringify(back) === JSON.stringify(original));

/* 2. Exported file must look like a real ComfyUI Save file. */
console.log('export shape');
check('links are [id, from, fromSlot, to, toSlot, type]', exported.links.every((l) => l.length === 6 && typeof l[5] === 'string'));
check('every node has numeric id/pos/size', exported.nodes.every((n) => typeof n.id === 'number' && n.pos.length === 2 && n.size.length === 2));
check('inputs carry link ids', exported.nodes.some((n) => (n.inputs ?? []).some((i) => typeof i.link === 'number')));
check('widgets_values present', exported.nodes.every((n) => Array.isArray(n.widgets_values)));

/* 3. Import a hand-written real-world ComfyUI Save file (file dropped on canvas). */
console.log('import (ComfyUI Save format)');
const realSave = {
  last_node_id: 9,
  last_link_id: 4,
  nodes: [
    {
      id: 4,
      type: 'CheckpointLoaderSimple',
      pos: [40, 40],
      size: [310, 98],
      mode: 0,
      outputs: [
        { name: 'MODEL', type: 'MODEL', links: [1], slot_index: 0 },
        { name: 'CLIP', type: 'CLIP', links: [2], slot_index: 1 },
        { name: 'VAE', type: 'VAE', links: [], slot_index: 2 },
      ],
      properties: { 'Node name for S&R': 'Load Checkpoint' },
      widgets_values: ['sd_xl_base_1.0.safetensors'],
    },
    {
      id: 5,
      type: 'CLIPTextEncode',
      pos: [400, 40],
      size: [400, 180],
      mode: 0,
      inputs: [{ name: 'clip', type: 'CLIP', link: 2, slot_index: 0 }],
      outputs: [{ name: 'CONDITIONING', type: 'CONDITIONING', links: [], slot_index: 0 }],
      properties: {},
      widgets_values: ['a cinematic photo'],
    },
  ],
  links: [
    [1, 4, 0, 9, 0, 'MODEL'],
    [2, 4, 1, 5, 0, 'CLIP'],
  ],
  groups: [],
  config: {},
  extra: {},
  version: 0.4,
};

const imported = importFromComfy(realSave, 'sd_xl_graph');
check('detected as ComfyUI graph', isComfyUiGraph(realSave));
check('2 nodes imported', imported?.nodes.length === 2, imported?.nodes.length);
const loader = imported?.nodes.find((n) => n.type === 'CheckpointLoaderSimple');
const clip = imported?.nodes.find((n) => n.type === 'CLIPTextEncode');
check('widget name taken from ComfyUI schema', loader?.widgets[0]?.name === 'ckpt_name', loader?.widgets[0]?.name);
check('title taken from "Node name for S&R"', loader?.title === 'Load Checkpoint', loader?.title);
check('position imported', loader?.position.x === 40 && loader?.position.y === 40);
check('input port keeps its name', clip?.inputs[0]?.name === 'clip');
check('text widget imported', clip?.widgets[0]?.name === 'text' && clip?.widgets[0]?.value === 'a cinematic photo');
check('link points at the right ports',
  imported?.links.some((l) => l.fromNode === 'node_4' && l.fromOutput === 'CLIP' && l.toNode === 'node_5' && l.toInput === 'clip'),
  imported?.links);

/* 4. Import a ComfyUI API (prompt) format file. */
console.log('import (ComfyUI API format)');
const apiFormat = {
  '3': { class_type: 'KSampler', inputs: { seed: 42, steps: 20, cfg: 7, sampler_name: 'euler', denoise: 1, model: ['4', 0], positive: ['6', 0] } },
  '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'sd_xl_base_1.0.safetensors' } },
  '6': { class_type: 'CLIPTextEncode', inputs: { text: 'hello', clip: ['4', 1] } },
};
const fromApi = importFromComfy(apiFormat, 'api_import');
check('detected as API format', isComfyApiPrompt(apiFormat));
check('3 nodes imported', fromApi?.nodes.length === 3, fromApi?.nodes.length);
const sampler = fromApi?.nodes.find((n) => n.type === 'KSampler');
check('scalar inputs became widgets', sampler?.widgets.some((w) => w.name === 'seed' && w.value === 42));
check('float widget guessed as FLOAT', sampler?.widgets.find((w) => w.name === 'cfg')?.type === 'FLOAT');
check('combo widget guessed as COMBO', sampler?.widgets.find((w) => w.name === 'sampler_name')?.type === 'COMBO');
check('link inputs became connections', fromApi?.links.some((l) => l.toNode === 'node_3' && l.toInput === 'model' && l.fromNode === 'node_4'));
check('source node got synthesised outputs', (fromApi?.nodes.find((n) => n.id === 'node_4')?.outputs.length ?? 0) >= 2);

/* 5. API (prompt) export used by /api/workflow/execute. */
console.log('export (ComfyUI API prompt)');
const apiPrompt = exportToComfyApiPrompt(original);
const apiKeys = Object.keys(apiPrompt);
check('one entry per node', apiKeys.length === original.nodes.length, apiKeys.length);
check('entries keyed by "1".."N"', apiKeys.join(',') === original.nodes.map((_, i) => i + 1).join(','));
check('every entry has class_type', Object.values(apiPrompt).every((e) => typeof e.class_type === 'string'));
const kSamplerEntry = Object.values(apiPrompt).find((e) => e.class_type === 'KSampler');
const clipEntry = Object.values(apiPrompt).find((e) => e.class_type === 'CLIPTextEncode');
check('widget values become scalars', typeof clipEntry?.inputs?.text === 'string');
check('wired inputs become [nodeId, slot]', Array.isArray(kSamplerEntry?.inputs?.model) && (kSamplerEntry.inputs.model as unknown[])[0] === '1');
check('slot index matches output order', (kSamplerEntry?.inputs?.model as unknown[] | undefined)?.[1] === 0);

/* 6. Unsupported JSON is rejected instead of crashing. */
console.log('rejections');
check('random object rejected', importFromComfy({ foo: 'bar' }, 'x') === null);
check('array rejected', importFromComfy([1, 2, 3], 'x') === null);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll ComfyUI format checks passed.');
