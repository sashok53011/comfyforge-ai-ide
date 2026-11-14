import React, { useEffect, useMemo, useRef } from 'react';
import * as d3 from 'd3';
import { ComfyNodeData, DbTable, Workflow } from '../types';
import { Database, Play, Link2 } from 'lucide-react';
import { useT } from '../i18n';

interface SchemaVisualizerProps {
  selectedNode: ComfyNodeData | null;
  workflow: Workflow;
  dbTables: DbTable[];
  onOpenSQLEditor: () => void;
}

interface NodeDatum extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  kind: 'workflow' | 'table';
  detail: string;
}

interface LinkDatum extends d3.SimulationLinkDatum<NodeDatum> {
  source: string | NodeDatum;
  target: string | NodeDatum;
  label: string;
}

const DATA_CATEGORIES = new Set(['database', 'scripts', 'documents']);

/** Real FK edges, parsed from the CREATE TABLE statements of the attached database. */
function tableEdges(tables: DbTable[]): { from: string; to: string }[] {
  const names = new Set(tables.map((t) => t.name));
  const edges: { from: string; to: string }[] = [];
  tables.forEach((table) => {
    const matches = table.ddl?.match(/references\s+["'\[]?([A-Za-z0-9_]+)/gi) || [];
    matches.forEach((m) => {
      const target = m.replace(/references\s+["'\[]?/i, '').replace(/["'\]]/g, '');
      if (names.has(target) && target !== table.name) edges.push({ from: table.name, to: target });
    });
  });
  return edges;
}

export const SchemaVisualizer: React.FC<SchemaVisualizerProps> = ({ selectedNode, workflow, dbTables, onOpenSQLEditor }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const tr = useT();

  const dataNodes = useMemo(() => workflow.nodes.filter((n) => DATA_CATEGORIES.has(n.category)), [workflow]);
  const edges = useMemo(() => tableEdges(dbTables), [dbTables]);

  const hasAnything = dataNodes.length > 0 || dbTables.length > 0;

  useEffect(() => {
    if (!svgRef.current || !hasAnything) return;

    const width = 280;
    const height = 230;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const nodes: NodeDatum[] = [
      ...dataNodes.map((n) => ({
        id: n.id,
        label: n.title,
        kind: 'workflow' as const,
        detail: `${n.type} · ${n.category}`,
      })),
      ...dbTables.map((t) => ({
        id: `tbl:${t.name}`,
        label: t.name,
        kind: 'table' as const,
        detail: t.columns.map((c) => `${c.name} ${c.type}`).join(', '),
      })),
    ];

    const links: LinkDatum[] = [
      ...workflow.links
        .filter((l) => dataNodes.some((n) => n.id === l.fromNode) && dataNodes.some((n) => n.id === l.toNode))
        .map((l) => ({ source: l.fromNode, target: l.toNode, label: l.toInput })),
      ...edges.map((e) => ({ source: `tbl:${e.from}`, target: `tbl:${e.to}`, label: 'FK' })),
    ];

    const simulation = d3
      .forceSimulation<NodeDatum>(nodes)
      .force('link', d3.forceLink<NodeDatum, LinkDatum>(links).id((d) => d.id).distance(70))
      .force('charge', d3.forceManyBody().strength(-140))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide<NodeDatum>().radius(34));

    const g = svg.append('g');

    const link = g
      .append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', (d) => (String(d.label) === 'FK' ? '#34d399' : '#6366f1'))
      .attr('stroke-opacity', 0.7)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', (d) => (String(d.label) === 'FK' ? '5 4' : null));

    const node = g
      .append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .call(
        d3.drag<any, NodeDatum>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    node
      .append('circle')
      .attr('r', (d) => (d.kind === 'table' ? 16 : 12))
      .attr('fill', (d) => (d.kind === 'table' ? '#052e16' : '#1e1b4b'))
      .attr('stroke', (d) => {
        if (d.kind === 'table') return '#34d399';
        return selectedNode && d.id === selectedNode.id ? '#f59e0b' : '#6366f1';
      })
      .attr('stroke-width', (d) => (selectedNode && d.id === selectedNode.id ? 3 : 2));

    node
      .append('text')
      .text((d) => (d.label.length > 18 ? `${d.label.slice(0, 17)}…` : d.label))
      .attr('x', 20)
      .attr('y', 4)
      .attr('fill', '#e2e8f0')
      .attr('font-size', '10px')
      .attr('font-family', 'monospace');

    node.append('title').text((d) => `${d.label}\n${d.detail}`);

    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as NodeDatum).x || 0)
        .attr('y1', (d) => (d.source as NodeDatum).y || 0)
        .attr('x2', (d) => (d.target as NodeDatum).x || 0)
        .attr('y2', (d) => (d.target as NodeDatum).y || 0);

      node.attr('transform', (d) => `translate(${d.x || 0},${d.y || 0})`);
    });

    return () => {
      simulation.stop();
    };
  }, [dataNodes, dbTables, edges, workflow, hasAnything, selectedNode]);

  return (
    <div className="space-y-4 pt-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
          <Database className="w-3.5 h-3.5 text-emerald-400" />
          <span>{tr('schemaGraph')}</span>
        </h3>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
          {dbTables.length > 0 ? tr('tablesCount', { n: dbTables.length }) : tr('workflowOnly')}
        </span>
      </div>

      <div className="rounded-xl bg-slate-950 border border-slate-800 p-2 flex items-center justify-center overflow-hidden shadow-inner">
        {hasAnything ? (
          <svg ref={svgRef} className="w-[280px] h-[230px]" />
        ) : (
          <div className="p-6 text-center text-slate-500 text-xs">
            <Database className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <span>{tr('noSchemaYet')}</span>
          </div>
        )}
      </div>

      {dbTables.length > 0 && (
        <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3 space-y-2 max-h-40 overflow-y-auto">
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Link2 className="w-3 h-3" /> {tr('tablesAndColumns')}
          </div>
          {dbTables.map((t) => (
            <div key={t.name} className="text-[10px] font-mono">
              <div className="text-emerald-400">{t.name}</div>
              <div className="text-slate-400 break-words">
                {t.columns.map((c) => `${c.name}:${c.type}`).join(' · ') || '—'}
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={onOpenSQLEditor}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20 transition-all"
      >
        <Play className="w-3.5 h-3.5" />
        <span>{tr('openSqlEditor')}</span>
      </button>
      <p className="text-[10px] text-slate-500 -mt-2">{tr('schemaHint')}</p>
    </div>
  );
};
