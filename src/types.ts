export type NodeCategory = 'loaders' | 'conditioning' | 'sampling' | 'latent' | 'image' | 'latent_ops' | 'database' | 'scripts' | 'documents' | 'custom' | 'utils';

export type Language = 'en' | 'ru' | 'de';

export interface AIProviderConfig {
  provider: 'gemini' | 'openai_compatible';
  endpoint: string;
  apiKey: string;
  llmModel: string;
}

export interface NodeWidget {
  name: string;
  type: 'STRING' | 'INT' | 'FLOAT' | 'COMBO' | 'BOOLEAN' | 'FILE';
  value: any;
  options?: string[]; // For COMBO or File formats
  min?: number;
  max?: number;
  step?: number;
}

export interface NodePort {
  name: string;
  type: string; // e.g. MODEL, CONDITIONING, LATENT, IMAGE, SQL, SCRIPT, DATA
  linkId?: string | null;
}

export interface ComfyNodeData {
  id: string;
  type: string;
  title: string;
  category: NodeCategory;
  style: 'classic' | 'neon' | 'opensource' | 'compiled';
  position: { x: number; y: number };
  size: { width: number; height: number };
  inputs: NodePort[];
  outputs: NodePort[];
  widgets: NodeWidget[];
  customCode?: string;
}

export interface ComfyLink {
  id: string;
  fromNode: string;
  fromOutput: string;
  toNode: string;
  toInput: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  nodes: ComfyNodeData[];
  links: ComfyLink[];
  created: string;
  updated: string;
}

/** Table returned by /api/sql/schema for the schema graph. */
export interface DbTable {
  name: string;
  ddl: string;
  columns: { name: string; type: string; pk: boolean }[];
}

export type ActiveView = 'canvas' | 'library' | 'code' | 'templates' | 'history';
