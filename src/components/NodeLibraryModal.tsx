import React, { useState } from 'react';
import { ComfyNodeData } from '../types';
import { Cpu, Search, Plus, X } from 'lucide-react';
import { useT } from '../i18n';

interface NodeLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddNode: (node: ComfyNodeData) => void;
}

const AVAILABLE_NODES: Omit<ComfyNodeData, 'id' | 'position'>[] = [
  {
    type: 'LoadCheckpoint',
    title: 'Load Checkpoint (SDXL/Flux)',
    category: 'loaders',
    style: 'classic',
    size: { width: 280, height: 180 },
    inputs: [],
    outputs: [
      { name: 'MODEL', type: 'MODEL' },
      { name: 'CLIP', type: 'CLIP' },
      { name: 'VAE', type: 'VAE' },
    ],
    widgets: [{ name: 'ckpt_name', type: 'COMBO', value: 'sdxl_base_v1.0.safetensors', options: ['sdxl_base_v1.0.safetensors', 'flux1_schnell.safetensors', 'v1-5-pruned.safetensors'] }],
  },
  {
    type: 'DatabaseLoaderNode',
    title: 'Database Loader (SQL, MDF, NDF, LDF, SQLite, DB, DBM)',
    category: 'database',
    style: 'neon',
    size: { width: 320, height: 220 },
    inputs: [],
    outputs: [{ name: 'SQL_DATA', type: 'SQL' }],
    widgets: [
      { name: 'format', type: 'COMBO', value: 'sqlite', options: ['sql', '.mdf', '.ndf', '.ldf', 'sqlite', 'db', 'dbm'] },
      { name: 'connection_string', type: 'STRING', value: 'Server=localhost;Database=ai_db;AttachDBFileName=data.mdf' }
    ],
  },
  // 1. DDL Node
  {
    type: 'DDLNode',
    title: 'DDL: Data Definition (CREATE, DROP, ALTER, TRUNCATE)',
    category: 'database',
    style: 'compiled',
    size: { width: 320, height: 220 },
    inputs: [{ name: 'db_in', type: 'SQL' }],
    outputs: [{ name: 'db_out', type: 'SQL' }],
    widgets: [
      { name: 'ddl_command', type: 'COMBO', value: 'CREATE TABLE', options: ['CREATE TABLE', 'DROP TABLE', 'ALTER TABLE', 'TRUNCATE TABLE', 'COMMENT ON', 'RENAME TABLE'] },
      { name: 'schema_query', type: 'STRING', value: 'CREATE TABLE employees (employee_id INT PRIMARY KEY, first_name VARCHAR(50), last_name VARCHAR(50), hire_date DATE);' }
    ],
  },
  // 2. DQL Node
  {
    type: 'DQLNode',
    title: 'DQL: Data Query (SELECT, WHERE, GROUP BY, HAVING, LIMIT)',
    category: 'database',
    style: 'neon',
    size: { width: 320, height: 220 },
    inputs: [{ name: 'db_in', type: 'SQL' }],
    outputs: [{ name: 'query_result', type: 'DATA' }],
    widgets: [
      { name: 'clause_filter', type: 'COMBO', value: 'SELECT * FROM ... WHERE', options: ['SELECT * FROM ... WHERE', 'SELECT DISTINCT', 'GROUP BY & HAVING', 'ORDER BY & LIMIT'] },
      { name: 'query_statement', type: 'STRING', value: "SELECT first_name, last_name, hire_date FROM employees WHERE department = 'Sales' ORDER BY hire_date DESC LIMIT 100;" }
    ],
  },
  // 3. DML Node
  {
    type: 'DMLNode',
    title: 'DML: Data Manipulation (INSERT, UPDATE, DELETE)',
    category: 'database',
    style: 'opensource',
    size: { width: 320, height: 220 },
    inputs: [{ name: 'db_in', type: 'SQL' }],
    outputs: [{ name: 'db_out', type: 'SQL' }],
    widgets: [
      { name: 'dml_command', type: 'COMBO', value: 'INSERT INTO', options: ['INSERT INTO', 'UPDATE ... SET', 'DELETE FROM'] },
      { name: 'dml_statement', type: 'STRING', value: "INSERT INTO employees (first_name, last_name, department) VALUES ('Jane', 'Smith', 'HR');" }
    ],
  },
  // 4. DCL Node
  {
    type: 'DCLNode',
    title: 'DCL: Data Control (GRANT, REVOKE)',
    category: 'database',
    style: 'classic',
    size: { width: 320, height: 200 },
    inputs: [{ name: 'db_in', type: 'SQL' }],
    outputs: [{ name: 'db_out', type: 'SQL' }],
    widgets: [
      { name: 'dcl_command', type: 'COMBO', value: 'GRANT', options: ['GRANT', 'REVOKE'] },
      { name: 'privileges', type: 'STRING', value: "GRANT SELECT, UPDATE ON employees TO user_name;" }
    ],
  },
  // 5. TCL Node
  {
    type: 'TCLNode',
    title: 'TCL: Transaction Control (BEGIN, COMMIT, ROLLBACK, SAVEPOINT)',
    category: 'database',
    style: 'compiled',
    size: { width: 320, height: 220 },
    inputs: [{ name: 'db_in', type: 'SQL' }],
    outputs: [{ name: 'db_out', type: 'SQL' }],
    widgets: [
      { name: 'tcl_command', type: 'COMBO', value: 'BEGIN TRANSACTION', options: ['BEGIN TRANSACTION', 'COMMIT', 'ROLLBACK', 'SAVEPOINT'] },
      { name: 'transaction_block', type: 'STRING', value: "BEGIN TRANSACTION; UPDATE employees SET department = 'Marketing'; SAVEPOINT before_update; COMMIT;" }
    ],
  },
  {
    type: 'ScriptRunnerNode',
    title: 'Script & Shell Runner (PY, BAT, SH, PS1, CMD)',
    category: 'scripts',
    style: 'compiled',
    size: { width: 320, height: 220 },
    inputs: [{ name: 'input_data', type: 'SQL' }],
    outputs: [{ name: 'SCRIPT_OUT', type: 'DATA' }],
    widgets: [
      { name: 'script_format', type: 'COMBO', value: 'py', options: ['py', 'bat', 'sh', 'ps1', 'cmd'] },
      { name: 'script_path', type: 'STRING', value: 'automation_script.py' }
    ],
  },
  {
    type: 'DataDocumentNode',
    title: 'Data & Document Parser (JSON, CSV, MD, TEXT)',
    category: 'documents',
    style: 'opensource',
    size: { width: 320, height: 200 },
    inputs: [{ name: 'data_in', type: 'DATA' }],
    outputs: [{ name: 'IMAGE', type: 'IMAGE' }],
    widgets: [
      { name: 'doc_format', type: 'COMBO', value: 'json', options: ['json', 'csv', 'md', 'text'] },
      { name: 'file_path', type: 'STRING', value: 'config_data.json' }
    ],
  },
  {
    type: 'KSampler',
    title: 'KSampler (Diffusion Engine)',
    category: 'sampling',
    style: 'compiled',
    size: { width: 320, height: 280 },
    inputs: [
      { name: 'model', type: 'MODEL' },
      { name: 'positive', type: 'CONDITIONING' },
      { name: 'negative', type: 'CONDITIONING' },
      { name: 'latent_image', type: 'LATENT' },
    ],
    outputs: [{ name: 'LATENT', type: 'LATENT' }],
    widgets: [
      { name: 'seed', type: 'INT', value: 12345678 },
      { name: 'steps', type: 'INT', value: 20, min: 1, max: 100 },
      { name: 'cfg', type: 'FLOAT', value: 8.0, min: 0, max: 30 },
      { name: 'sampler_name', type: 'COMBO', value: 'euler', options: ['euler', 'euler_ancestral', 'dpmpp_2m', 'ddim'] },
      { name: 'scheduler', type: 'COMBO', value: 'karras', options: ['normal', 'karras'] },
      { name: 'denoise', type: 'FLOAT', value: 1.0, min: 0, max: 1 },
    ],
  },
  {
    type: 'EmptyImage',
    title: 'Empty Image (solid color)',
    category: 'image',
    style: 'classic',
    size: { width: 280, height: 180 },
    inputs: [],
    outputs: [{ name: 'IMAGE', type: 'IMAGE' }],
    widgets: [
      { name: 'width', type: 'INT', value: 512 },
      { name: 'height', type: 'INT', value: 512 },
      { name: 'batch_size', type: 'INT', value: 1 },
      { name: 'color', type: 'INT', value: 16711680 },
    ],
  },
  {
    type: 'SaveImage',
    title: 'Save Image',
    category: 'image',
    style: 'classic',
    size: { width: 280, height: 180 },
    inputs: [{ name: 'images', type: 'IMAGE' }],
    outputs: [],
    widgets: [{ name: 'filename_prefix', type: 'STRING', value: 'ComfyForge_' }],
  }
];

export const NodeLibraryModal: React.FC<NodeLibraryModalProps> = ({ isOpen, onClose, onAddNode }) => {
  const tr = useT();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  if (!isOpen) return null;

  const filteredNodes = AVAILABLE_NODES.filter((n) => {
    const matchesSearch = n.title.toLowerCase().includes(search.toLowerCase()) || n.type.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || n.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleAdd = (nodeTmpl: Omit<ComfyNodeData, 'id' | 'position'>) => {
    const newNode: ComfyNodeData = {
      ...nodeTmpl,
      id: 'node_' + Math.random().toString(36).substring(2, 9),
      position: { x: 200 + Math.random() * 150, y: 150 + Math.random() * 100 },
    };
    onAddNode(newNode);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Cpu className="w-5 h-5 text-indigo-400" />
              <span>{tr('libraryTitle')}</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">{tr('librarySub')}</p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 border-b border-slate-800 bg-slate-950/40 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tr('librarySearch')}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto">
            {['all', 'loaders', 'database', 'scripts', 'documents', 'sampling', 'image'].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize whitespace-nowrap transition-all ${
                  selectedCategory === cat ? 'bg-indigo-600 text-white' : 'bg-slate-800/80 text-slate-400 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 p-4 sm:p-6 pb-24 lg:pb-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredNodes.map((node, idx) => (
            <div
              key={idx}
              className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-indigo-500/50 transition-all flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-white group-hover:text-indigo-400 transition-colors">
                    {node.title}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400">
                    {node.type}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 font-mono">{tr('categoryLabel', { cat: node.category })}</div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                <span className="text-[10px] text-slate-500 font-mono">
                  {tr('inputsOutputs', { in: node.inputs.length, out: node.outputs.length })}
                </span>
                <button
                  onClick={() => handleAdd(node)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{tr('addNode')}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
