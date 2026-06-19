/**
 * Correct-by-construction layout for the whiteboard-style architecture diagram.
 *
 * Each lab describes its architecture as left-to-right columns of nodes plus a
 * list of flows between node ids. This helper computes the absolute SVG
 * geometry (viewBox, zone rects, node rects, flow bezier paths) and the mobile
 * stage list, so individual labs never hand-place coordinates and every diagram
 * stays aligned and non-overlapping.
 */
import type {
  DiagramDefinition,
  DiagramFlowDefinition,
  DiagramNodeDefinition,
  DiagramZoneDefinition,
  MobileDiagramStageDefinition,
} from './lab-types';

export type DiagramColumnNode = {
  id: string;
  /** Bold first line inside the node box (desktop). */
  title: string;
  /** Small second line inside the node box (desktop). */
  subtitle: string;
  /** Sentence shown for this node in the stacked mobile flow. */
  summary: string;
};

export type DiagramColumn = {
  id: string;
  label: string;
  /** Visual accent; maps to `.system-lab__sketch-zone--<variant>`. */
  variant?: 'clients' | 'edge' | 'backbone' | 'processing' | 'storage' | string;
  nodes: DiagramColumnNode[];
};

export type DiagramFlowSpec = {
  from: string;
  to: string;
  variant?: 'primary' | 'secondary' | 'direct';
};

export type ColumnDiagramInput = {
  title: string;
  description: string;
  columns: DiagramColumn[];
  flows: DiagramFlowSpec[];
};

const OUTER_MARGIN = 24;
const NODE_WIDTH = 150;
const NODE_HEIGHT = 92;
const NODE_GAP_Y = 26;
const COLUMN_GAP_X = 50;
const ZONE_PAD_X = 20;
const ZONE_PAD_TOP = 46;
const ZONE_PAD_BOTTOM = 22;
const ZONE_WIDTH = NODE_WIDTH + ZONE_PAD_X * 2;
const SKIP_BOW = 56;

type NodeGeometry = {
  columnIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export function buildColumnDiagram(input: ColumnDiagramInput): DiagramDefinition {
  const { columns } = input;
  const maxNodes = columns.reduce((max, column) => Math.max(max, column.nodes.length), 1);
  const contentHeight = maxNodes * NODE_HEIGHT + (maxNodes - 1) * NODE_GAP_Y;
  const zoneHeight = ZONE_PAD_TOP + contentHeight + ZONE_PAD_BOTTOM;
  const zoneTop = OUTER_MARGIN;

  const width = OUTER_MARGIN * 2 + columns.length * ZONE_WIDTH + (columns.length - 1) * COLUMN_GAP_X;
  const height = OUTER_MARGIN * 2 + zoneHeight;

  const geometry = new Map<string, NodeGeometry>();
  const zones: DiagramZoneDefinition[] = [];
  const nodes: DiagramNodeDefinition[] = [];
  const mobileStages: MobileDiagramStageDefinition[] = [];

  columns.forEach((column, columnIndex) => {
    const zoneX = OUTER_MARGIN + columnIndex * (ZONE_WIDTH + COLUMN_GAP_X);
    zones.push({
      id: column.id,
      label: column.label,
      x: zoneX,
      y: zoneTop,
      width: ZONE_WIDTH,
      height: zoneHeight,
      variant: column.variant ?? column.id,
    });

    const stackHeight =
      column.nodes.length * NODE_HEIGHT + (column.nodes.length - 1) * NODE_GAP_Y;
    const startY = zoneTop + ZONE_PAD_TOP + (contentHeight - stackHeight) / 2;
    const nodeX = zoneX + ZONE_PAD_X;

    column.nodes.forEach((node, nodeIndex) => {
      const nodeY = startY + nodeIndex * (NODE_HEIGHT + NODE_GAP_Y);
      geometry.set(node.id, {
        columnIndex,
        x: nodeX,
        y: nodeY,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      });
      nodes.push({
        id: node.id,
        title: node.title,
        subtitle: node.subtitle,
        x: nodeX,
        y: nodeY,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      });
    });

    mobileStages.push({
      label: column.label,
      nodes: column.nodes.map((node) => ({
        id: node.id,
        title: node.title,
        summary: node.summary,
      })),
    });
  });

  const flows: DiagramFlowDefinition[] = input.flows.map((flow) => ({
    id: flowId(flow),
    path: flowPath(geometry.get(flow.from), geometry.get(flow.to)),
    variant: flow.variant ?? 'primary',
  }));

  return {
    title: input.title,
    description: input.description,
    viewBox: `0 0 ${width} ${height}`,
    zones,
    flows,
    nodes,
    mobileStages,
  };
}

/** Stable flow id used by the runtime to toggle flow state (camelCase pair). */
export function flowId(flow: DiagramFlowSpec): string {
  return `${flow.from}To${capitalize(flow.to)}`;
}

function flowPath(from: NodeGeometry | undefined, to: NodeGeometry | undefined): string {
  if (!from || !to) {
    return '';
  }

  // Same column: short vertical S-curve between stacked boxes.
  if (from.columnIndex === to.columnIndex) {
    const x = from.x + from.width / 2;
    const downward = to.y >= from.y;
    const y1 = downward ? from.y + from.height : from.y;
    const y2 = downward ? to.y : to.y + to.height;
    const midY = (y1 + y2) / 2;
    return `M ${round(x)} ${round(y1)} C ${round(x)} ${round(midY)}, ${round(x)} ${round(midY)}, ${round(x)} ${round(y2)}`;
  }

  const leftToRight = to.columnIndex > from.columnIndex;
  const x1 = leftToRight ? from.x + from.width : from.x;
  const x2 = leftToRight ? to.x : to.x + to.width;
  const y1 = from.y + from.height / 2;
  const y2 = to.y + to.height / 2;
  const columnSpan = Math.abs(to.columnIndex - from.columnIndex);

  // Skip-a-column flows bow above the intermediate nodes so they never cross a box.
  if (columnSpan >= 2) {
    const bowY = Math.min(y1, y2) - SKIP_BOW;
    const cx1 = x1 + (x2 - x1) * 0.25;
    const cx2 = x1 + (x2 - x1) * 0.75;
    return `M ${round(x1)} ${round(y1)} C ${round(cx1)} ${round(bowY)}, ${round(cx2)} ${round(bowY)}, ${round(x2)} ${round(y2)}`;
  }

  // Adjacent columns: smooth horizontal bezier with horizontal tangents.
  const dx = (x2 - x1) * 0.45;
  return `M ${round(x1)} ${round(y1)} C ${round(x1 + dx)} ${round(y1)}, ${round(x2 - dx)} ${round(y2)}, ${round(x2)} ${round(y2)}`;
}

function capitalize(value: string): string {
  return value.length === 0 ? value : `${value[0].toUpperCase()}${value.slice(1)}`;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
