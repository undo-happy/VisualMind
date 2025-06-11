import React, { useState, useEffect } from 'react';

function MindMapNode({ node, path, onAdd, onDelete, onExpand }) {
  const label = node.title || node.name || node.key || 'Node';
  return (
    <li>
      {label}{' '}
      {onAdd && <button onClick={() => onAdd(path)}>Add</button>}{' '}
      {onDelete && <button onClick={() => onDelete(path)}>Delete</button>}{' '}
      {onExpand && <button onClick={() => onExpand(path)}>Expand</button>}
      {Array.isArray(node.children) && node.children.length > 0 && (
        <ul>
          {node.children.map((child, idx) => (
            <MindMapNode
              key={idx}
              node={child}
              path={[...path, idx]}
              onAdd={onAdd}
              onDelete={onDelete}
              onExpand={onExpand}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function App() {
  const [file, setFile] = useState(null);
  const [tree, setTree] = useState(null);
  const [mapId, setMapId] = useState('');
  const [maps, setMaps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadMaps = async () => {
    const res = await fetch('/api/maps');
    if (res.ok) {
      const data = await res.json();
      setMaps(data);
    }
  };

  useEffect(() => {
    loadMaps();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      setTree(data.tree);
      setMapId(data.id);
      await loadMaps();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const addChild = async path => {
    const title = prompt('Child title');
    if (!title || !mapId) return;
    const res = await fetch(`/api/maps/${mapId}/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, title })
    });
    if (res.ok) {
      const data = await res.json();
      setTree({ ...data });
    }
  };

  const deleteNode = async path => {
    if (!mapId || !confirm('Delete node?')) return;
    const res = await fetch(`/api/maps/${mapId}/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path })
    });
    if (res.ok) {
      const data = await res.json();
      setTree({ ...data });
    }
  };

  const expandNode = async path => {
    if (!mapId) return;
    const res = await fetch(`/api/maps/${mapId}/expand`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path })
    });
    if (res.ok) {
      const data = await res.json();
      setTree({ ...data });
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h1>VisualMind MVP</h1>
      <form onSubmit={handleSubmit}>
        <input type="file" onChange={e => setFile(e.target.files[0])} />
        <button type="submit">Upload</button>
      </form>
      {loading && <p>Processing...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {tree && (
        <div>
          <h2>Mind Map</h2>
          <ul>
            <MindMapNode
              node={tree}
              path={[]}
              onAdd={addChild}
              onDelete={deleteNode}
              onExpand={expandNode}
            />
          </ul>
          <p>ID: {mapId}</p>
          <h3>Raw JSON</h3>
          <pre>{JSON.stringify(tree, null, 2)}</pre>
        </div>
      )}
      {maps.length > 0 && (
        <div>
          <h2>Saved Maps</h2>
          <ul>
            {maps.map(m => (
              <li key={m.id}>{m.id}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default App;
