import { Workflow } from "../types";

export const DEFAULT_WORKFLOWS: Workflow[] = [
  {
    id: "wf_sdxl_base",
    name: "SDXL High-Res Text-to-Image",
    description: "Standard ComfyUI SDXL pipeline with LoadCheckpoint, Dual CLIPTextEncode, KSampler, and VAE Decode.",
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    nodes: [
      {
        id: "node_1",
        type: "LoadCheckpoint",
        title: "Load SDXL Checkpoint",
        category: "loaders",
        style: "classic",
        position: { x: 80, y: 120 },
        size: { width: 280, height: 180 },
        inputs: [],
        outputs: [
          { name: "MODEL", type: "MODEL" },
          { name: "CLIP", type: "CLIP" },
          { name: "VAE", type: "VAE" }
        ],
        widgets: [
          { name: "ckpt_name", type: "COMBO", value: "sdxl_base_v1.0.safetensors", options: ["sdxl_base_v1.0.safetensors", "flux1_schnell.safetensors", "v1-5-pruned-emaonly.safetensors"] }
        ]
      },
      {
        id: "node_2",
        type: "CLIPTextEncode",
        title: "CLIP Text Encode (Prompt)",
        category: "conditioning",
        style: "neon",
        position: { x: 400, y: 100 },
        size: { width: 300, height: 160 },
        inputs: [{ name: "clip", type: "CLIP" }],
        outputs: [{ name: "CONDITIONING", type: "CONDITIONING" }],
        widgets: [
          { name: "text", type: "STRING", value: "masterpiece, best quality, cinematic cyberpunk city at night, neon reflections, 8k resolution" }
        ]
      },
      {
        id: "node_3",
        type: "CLIPTextEncode",
        title: "CLIP Text Encode (Negative)",
        category: "conditioning",
        style: "neon",
        position: { x: 400, y: 300 },
        size: { width: 300, height: 160 },
        inputs: [{ name: "clip", type: "CLIP" }],
        outputs: [{ name: "CONDITIONING", type: "CONDITIONING" }],
        widgets: [
          { name: "text", type: "STRING", value: "ugly, blurry, low quality, distorted, bad anatomy" }
        ]
      },
      {
        id: "node_4",
        type: "EmptyLatentImage",
        title: "Empty Latent Image",
        category: "latent",
        style: "classic",
        position: { x: 380, y: 500 },
        size: { width: 260, height: 170 },
        inputs: [],
        outputs: [{ name: "LATENT", type: "LATENT" }],
        widgets: [
          { name: "width", type: "INT", value: 1024, min: 256, max: 4096, step: 64 },
          { name: "height", type: "INT", value: 1024, min: 256, max: 4096, step: 64 },
          { name: "batch_size", type: "INT", value: 1, min: 1, max: 16, step: 1 }
        ]
      },
      {
        id: "node_5",
        type: "KSampler",
        title: "KSampler (SDXL Engine)",
        category: "sampling",
        style: "compiled",
        position: { x: 740, y: 160 },
        size: { width: 320, height: 280 },
        inputs: [
          { name: "model", type: "MODEL" },
          { name: "positive", type: "CONDITIONING" },
          { name: "negative", type: "CONDITIONING" },
          { name: "latent_image", type: "LATENT" }
        ],
        outputs: [{ name: "LATENT", type: "LATENT" }],
        widgets: [
          { name: "seed", type: "INT", value: 4289123 },
          { name: "steps", type: "INT", value: 25, min: 1, max: 150 },
          { name: "cfg", type: "FLOAT", value: 7.0, min: 0.0, max: 30.0, step: 0.1 },
          { name: "sampler_name", type: "COMBO", value: "euler_ancestral", options: ["euler", "euler_ancestral", "dpmpp_2m", "ddim"] },
          { name: "scheduler", type: "COMBO", value: "karras", options: ["normal", "karras", "exponential"] },
          { name: "denoise", type: "FLOAT", value: 1.0, min: 0.0, max: 1.0, step: 0.05 }
        ]
      },
      {
        id: "node_6",
        type: "VAEDecode",
        title: "VAE Decode",
        category: "latent_ops",
        style: "opensource",
        position: { x: 1100, y: 220 },
        size: { width: 240, height: 150 },
        inputs: [
          { name: "samples", type: "LATENT" },
          { name: "vae", type: "VAE" }
        ],
        outputs: [{ name: "IMAGE", type: "IMAGE" }],
        widgets: []
      },
      {
        id: "node_7",
        type: "SaveImage",
        title: "Save Image / Preview",
        category: "image",
        style: "classic",
        position: { x: 1380, y: 200 },
        size: { width: 280, height: 220 },
        inputs: [{ name: "images", type: "IMAGE" }],
        outputs: [],
        widgets: [
          { name: "filename_prefix", type: "STRING", value: "ComfyForge_SDXL" }
        ]
      }
    ],
    links: [
      { id: "l1", fromNode: "node_1", fromOutput: "MODEL", toNode: "node_5", toInput: "model" },
      { id: "l2", fromNode: "node_1", fromOutput: "CLIP", toNode: "node_2", toInput: "clip" },
      { id: "l3", fromNode: "node_1", fromOutput: "CLIP", toNode: "node_3", toInput: "clip" },
      { id: "l4", fromNode: "node_1", fromOutput: "VAE", toNode: "node_6", toInput: "vae" },
      { id: "l5", fromNode: "node_2", fromOutput: "CONDITIONING", toNode: "node_5", toInput: "positive" },
      { id: "l6", fromNode: "node_3", fromOutput: "CONDITIONING", toNode: "node_5", toInput: "negative" },
      { id: "l7", fromNode: "node_4", fromOutput: "LATENT", toNode: "node_5", toInput: "latent_image" },
      { id: "l8", fromNode: "node_5", fromOutput: "LATENT", toNode: "node_6", toInput: "samples" },
      { id: "l9", fromNode: "node_6", fromOutput: "IMAGE", toNode: "node_7", toInput: "images" }
    ]
  },
  {
    id: "wf_multiformat_pipeline",
    name: "Multi-Format Database & Script Pipeline",
    description: "Pipeline featuring multi-format database loaders (sql, .mdf/.ndf/.ldf, sqlite, db, dbm) and script runners (.py, .bat, .sh, .ps1, .cmd, .json, .csv, .md, .text).",
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    nodes: [
      {
        id: "mf_1",
        type: "DatabaseLoaderNode",
        title: "Multi-Format DB Loader (SQL/MDF/SQLite)",
        category: "database",
        style: "neon",
        position: { x: 80, y: 150 },
        size: { width: 320, height: 220 },
        inputs: [],
        outputs: [{ name: "SQL_DATA", type: "SQL" }],
        widgets: [
          { name: "db_format", type: "COMBO", value: "sqlite", options: ["sql", ".mdf", ".ndf", ".ldf", "sqlite", "db", "dbm"] },
          { name: "connection_string", type: "STRING", value: "sqlite:///database.db; attach=data.mdf" }
        ]
      },
      {
        id: "mf_2",
        type: "ScriptRunnerNode",
        title: "Multi-Format Script Runner (.py/.bat/.sh/.ps1/.cmd)",
        category: "scripts",
        style: "compiled",
        position: { x: 440, y: 150 },
        size: { width: 320, height: 220 },
        inputs: [{ name: "input_data", type: "SQL" }],
        outputs: [{ name: "SCRIPT_OUT", type: "DATA" }],
        widgets: [
          { name: "script_format", type: "COMBO", value: "py", options: ["py", "bat", "sh", "ps1", "cmd"] },
          { name: "script_path", type: "STRING", value: "pipeline_transform.py" }
        ]
      },
      {
        id: "mf_3",
        type: "DataDocumentNode",
        title: "Data & Document Parser (.json/.csv/.md/.text)",
        category: "documents",
        style: "opensource",
        position: { x: 800, y: 150 },
        size: { width: 320, height: 200 },
        inputs: [{ name: "data_in", type: "DATA" }],
        outputs: [{ name: "IMAGE", type: "IMAGE" }],
        widgets: [
          { name: "doc_format", type: "COMBO", value: "json", options: ["json", "csv", "md", "text"] },
          { name: "file_path", type: "STRING", value: "dataset_config.json" }
        ]
      }
    ],
    links: [
      { id: "mfl1", fromNode: "mf_1", fromOutput: "SQL_DATA", toNode: "mf_2", toInput: "input_data" },
      { id: "mfl2", fromNode: "mf_2", fromOutput: "SCRIPT_OUT", toNode: "mf_3", toInput: "data_in" }
    ]
  }
];
