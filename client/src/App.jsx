import React, { useState, useEffect } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';

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
  const [user, setUser] = useState(null);
  const [file, setFile] = useState(null);
  const [text, setText] = useState('');
  const [tree, setTree] = useState(null);
  const [mapId, setMapId] = useState('');
  const [maps, setMaps] = useState([]);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUser(u));
    return () => unsub();
  }, []);

  const login = async e => {
    e.preventDefault();
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError(err.message);
    }
  };

  const signup = async e => {
    e.preventDefault();
    setError('');
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError(err.message);
    }
  };

  const logout = () => {
    signOut(auth);
  };

  const loadMaps = async () => {
    const token = await auth.currentUser?.getIdToken?.();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch('/api/maps', { headers });
    if (res.ok) {
      const data = await res.json();
      setMaps(data);
    }
  };

  const loadUsage = async () => {
    const token = await auth.currentUser?.getIdToken?.();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch('/api/usage', { headers });
    if (res.ok) {
      const data = await res.json();
      setUsage(data);
    }
  };

  const loadMapById = async id => {
    const token = await auth.currentUser?.getIdToken?.();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(`/api/maps/${id}`, { headers });
    if (res.ok) {
      const data = await res.json();
      setMapId(id);
      setTree(data.tree);
    }
  };

  const deleteMapById = async id => {
    if (!confirm('Delete this map?')) return;
    const token = await auth.currentUser?.getIdToken?.();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(`/api/maps/${id}`, { method: 'DELETE', headers });
    if (res.ok) {
      setMaps(maps.filter(m => m.id !== id));
      if (mapId === id) {
        setMapId('');
        setTree(null);
      }
    }
  };

  useEffect(() => {
    loadMaps();
    loadUsage();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const token = await auth.currentUser?.getIdToken?.();
      const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
      let res;
      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        res = await fetch('/api/upload', { method: 'POST', headers: authHeader, body: formData });
      } else if (text.trim()) {
        res = await fetch('/api/text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeader },
          body: JSON.stringify({ text })
        });
      } else {
        setError('No file or text provided');
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      setTree(data.tree);
      setMapId(data.id);
      await loadMaps();
      await loadUsage();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const addChild = async path => {
    const title = prompt('Child title');
    if (!title || !mapId) return;
    const token = await auth.currentUser?.getIdToken?.();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`/api/maps/${mapId}/add`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ path, title })
    });
    if (res.ok) {
      const data = await res.json();
      setTree({ ...data });
      await loadUsage();
    }
  };

  const deleteNode = async path => {
    if (!mapId || !confirm('Delete node?')) return;
    const token = await auth.currentUser?.getIdToken?.();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`/api/maps/${mapId}/remove`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ path })
    });
    if (res.ok) {
      const data = await res.json();
      setTree({ ...data });
    }
  };

  const expandNode = async path => {
    if (!mapId) return;
    const token = await auth.currentUser?.getIdToken?.();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`/api/maps/${mapId}/expand`, {
      method: 'POST',
      headers,
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
      {user ? (
        <>
          <p>Logged in as {user.email}</p>
          <button onClick={logout}>Logout</button>
          <form onSubmit={handleSubmit} style={{ marginTop: '1rem' }}>
            <div style={{ marginBottom: '0.5rem' }}>
              <input type="file" onChange={e => setFile(e.target.files[0])} />
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <textarea
                placeholder="또는 텍스트를 입력하세요"
                rows="5"
                style={{ width: '100%' }}
                value={text}
                onChange={e => setText(e.target.value)}
              />
            </div>
            <button type="submit">Submit</button>
          </form>
        </>
      ) : (
        <form onSubmit={login} style={{ marginBottom: '1rem' }}>
          <div>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          <div>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>
          <button type="submit">Login</button>{' '}
          <button type="button" onClick={signup}>Sign Up</button>
        </form>
      )}
      {usage && (
        <p>Daily usage: {usage.count} / {usage.quota}</p>
      )}
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
              <li key={m.id}>
                <button onClick={() => loadMapById(m.id)}>Load</button>{' '}
                {m.id}{' '}
                <button onClick={() => deleteMapById(m.id)}>Delete</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default App;
