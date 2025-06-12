import React, { useRef, useEffect, useState } from 'react';
import { select } from 'd3-selection';
import { zoom, zoomIdentity } from 'd3-zoom';

const LayoutWorker = new URL('./layoutWorker.js', import.meta.url);

const VIRTUAL_THRESHOLD = 200;

export default function MindMap({ data, layout = 'hierarchical', width = 600, height = 400 }) {
  const svgRef = useRef();
  const gRef = useRef();
  const miniRef = useRef();
  const [transformState, setTransformState] = useState(zoomIdentity);
  const [layoutData, setLayoutData] = useState({ nodes: [], links: [] });
  const workerRef = useRef();

  // initialize zoom behavior
  useEffect(() => {
    const svg = select(svgRef.current);
    const g = select(gRef.current);
    const zoomBehavior = zoom()
      .scaleExtent([0.25, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
        setTransformState(event.transform);
      });
    svg.call(zoomBehavior);
  }, []);

  // setup layout worker
  useEffect(() => {
    workerRef.current = new Worker(LayoutWorker, { type: 'module' });
    const worker = workerRef.current;
    worker.onmessage = (e) => setLayoutData(e.data);
    return () => worker.terminate();
  }, []);

  useEffect(() => {
    if (!data) return;
    if (workerRef.current) {
      workerRef.current.postMessage({ data, layout, width, height });
    }
  }, [data, layout, width, height]);

  // render layout when worker outputs
  useEffect(() => {
    const g = select(gRef.current);
    g.selectAll('*').remove();
    if (layoutData.nodes.length === 0) return;

    let nodes = layoutData.nodes;
    let links = layoutData.links;

    if (layoutData.nodes.length > VIRTUAL_THRESHOLD) {
      const minX = -transformState.x / transformState.k;
      const minY = -transformState.y / transformState.k;
      const maxX = (width - transformState.x) / transformState.k;
      const maxY = (height - transformState.y) / transformState.k;
      const margin = 40;
      const isVisible = n => {
        const x = layout === 'radial' ? n.x + width / 2 : n.x;
        const y = layout === 'radial' ? n.y + height / 2 : n.y;
        return x >= minX - margin && x <= maxX + margin && y >= minY - margin && y <= maxY + margin;
      };
      nodes = layoutData.nodes.filter(isVisible);
      links = layoutData.links.filter(l => {
        const sx = layout === 'radial' ? l.source[0] + width / 2 : l.source[0];
        const sy = layout === 'radial' ? l.source[1] + height / 2 : l.source[1];
        const tx = layout === 'radial' ? l.target[0] + width / 2 : l.target[0];
        const ty = layout === 'radial' ? l.target[1] + height / 2 : l.target[1];
        return (
          (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) ||
          (tx >= minX && tx <= maxX && ty >= minY && ty <= maxY)
        );
      });
    }

    if (layout === 'radial') {
      const group = g.append('g').attr('transform', `translate(${width / 2},${height / 2})`);
      group
        .selectAll('path.link')
        .data(links)
        .enter()
        .append('path')
        .attr('class', 'link')
        .attr('fill', 'none')
        .attr('stroke', '#999')
        .attr('d', d => `M${d.source[0]},${d.source[1]}L${d.target[0]},${d.target[1]}`);
      const node = group
        .selectAll('g.node')
        .data(nodes)
        .enter()
        .append('g')
        .attr('class', 'node')
        .attr('transform', d => `translate(${d.x},${d.y})`);
      node.append('circle').attr('r', 4).attr('fill', '#555');
      node
        .append('text')
        .attr('dy', '0.31em')
        .attr('x', d => (d.textAnchor === 'start' ? 6 : -6))
        .attr('text-anchor', d => d.textAnchor)
        .attr('transform', d => (d.rotate ? 'rotate(180)' : null))
        .text(d => d.label);
    } else {
      const group = g.append('g').attr('transform', 'translate(40,20)');
      group
        .selectAll('path.link')
        .data(links)
        .enter()
        .append('path')
        .attr('class', 'link')
        .attr('fill', 'none')
        .attr('stroke', '#999')
        .attr('d', d => `M${d.source[0]},${d.source[1]}V${d.target[1]}H${d.target[0]}`);
      const node = group
        .selectAll('g.node')
        .data(nodes)
        .enter()
        .append('g')
        .attr('class', 'node')
        .attr('transform', d => `translate(${d.x},${d.y})`);
      node.append('circle').attr('r', 4).attr('fill', '#555');
      node
        .append('text')
        .attr('dy', '0.31em')
        .attr('x', d => (d.textAnchor === 'end' ? -6 : 6))
        .attr('text-anchor', d => d.textAnchor)
        .text(d => d.label);
    }
  }, [layoutData, layout, width, height, transformState]);

  // minimap rendering
  useEffect(() => {
    if (layoutData.nodes.length === 0) return;
    const miniW = width / 4;
    const miniH = height / 4;
    const miniSvg = select(miniRef.current);
    miniSvg.selectAll('*').remove();
    const g = miniSvg.append('g');
    if (layout === 'radial') {
      g.attr('transform', `translate(${miniW / 2},${miniH / 2})`);
      g.selectAll('path')
        .data(layoutData.links)
        .enter()
        .append('path')
        .attr('fill', 'none')
        .attr('stroke', '#aaa')
        .attr('d', d => `M${d.source[0] * miniW / width},${d.source[1] * miniH / height}L${d.target[0] * miniW / width},${d.target[1] * miniH / height}`);
      g.selectAll('circle')
        .data(layoutData.nodes)
        .enter()
        .append('circle')
        .attr('r', 1.5)
        .attr('transform', d => `translate(${d.x * miniW / width},${d.y * miniH / height})`)
        .attr('fill', '#555');
    } else {
      g.attr('transform', 'translate(20,10)');
      const scaleX = miniW / width;
      const scaleY = miniH / height;
      g.selectAll('path')
        .data(layoutData.links)
        .enter()
        .append('path')
        .attr('fill', 'none')
        .attr('stroke', '#aaa')
        .attr('d', d => `M${d.source[0]*scaleX},${d.source[1]*scaleY}V${d.target[1]*scaleY}H${d.target[0]*scaleX}`);
      g.selectAll('circle')
        .data(layoutData.nodes)
        .enter()
        .append('circle')
        .attr('r', 1.5)
        .attr('transform', d => `translate(${d.x*scaleX},${d.y*scaleY})`)
        .attr('fill', '#555');
    }

    // viewport rectangle
    const scale = miniW / width;
    const viewW = width / transformState.k * scale;
    const viewH = height / transformState.k * scale;
    const viewX = -transformState.x / transformState.k * scale;
    const viewY = -transformState.y / transformState.k * scale;
    miniSvg
      .append('rect')
      .attr('class', 'view-rect')
      .attr('fill', 'none')
      .attr('stroke', 'red')
      .attr('pointer-events', 'none')
      .attr('x', viewX)
      .attr('y', viewY)
      .attr('width', viewW)
      .attr('height', viewH);
  }, [layoutData, layout, width, height, transformState]);

  return (
    <div className="mindmap-container" style={{ position: 'relative' }}>
      <svg ref={svgRef} width={width} height={height} role="img" className="mindmap-svg">
        <g ref={gRef} />
      </svg>
      <svg ref={miniRef} width={width / 4} height={height / 4} className="minimap" />
    </div>
  );
}
