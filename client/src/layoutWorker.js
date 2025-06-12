import { hierarchy, tree, cluster } from 'd3-hierarchy';

function radialPoint(x, y) {
  return [Math.cos(x - Math.PI / 2) * y, Math.sin(x - Math.PI / 2) * y];
}

let prevPos = new Map();

self.onmessage = (e) => {
  const { data, layout, width, height } = e.data;
  if (!data) return;
  const root = hierarchy(data);
  let nodes = [];
  let links = [];
  if (layout === 'radial') {
    const layoutFunc = cluster().size([2 * Math.PI, Math.min(width, height) / 2 - 40]);
    layoutFunc(root);
    nodes = root.descendants().map(d => {
      const key = d.ancestors().map(a => a.data.title || a.data.name || a.data.key).join('/');
      const [x, y] = radialPoint(d.x, d.y);
      const pos = prevPos.get(key) || [x, y];
      prevPos.set(key, pos);
      return {
        x: pos[0],
        y: pos[1],
        textAnchor: d.x < Math.PI ? 'start' : 'end',
        rotate: d.x >= Math.PI,
        label: d.data.title || d.data.name || d.data.key,
        children: !!d.children
      };
    });
    links = root.links().map(l => {
      const s = radialPoint(l.source.x, l.source.y);
      const t = radialPoint(l.target.x, l.target.y);
      return { source: s, target: t };
    });
  } else {
    const layoutFunc = tree().size([height - 40, width - 80]);
    layoutFunc(root);
    nodes = root.descendants().map(d => {
      const key = d.ancestors().map(a => a.data.title || a.data.name || a.data.key).join('/');
      const pos = prevPos.get(key) || [d.y, d.x];
      prevPos.set(key, pos);
      return {
        x: pos[0],
        y: pos[1],
        textAnchor: d.children ? 'end' : 'start',
        rotate: false,
        label: d.data.title || d.data.name || d.data.key,
        children: !!d.children
      };
    });
    links = root.links().map(l => ({
      source: [l.source.y, l.source.x],
      target: [l.target.y, l.target.x]
    }));
  }
  self.postMessage({ nodes, links });
};
