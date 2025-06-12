import React, { useState, useEffect } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { t, translations } from './i18n';
import MindMap from './MindMap';

function MindMapNode({ node, path, onAdd, onDelete, onExpand, lang }) {
  const label = node.title || node.name || node.key || 'Node';
  const handleKeyDown = e => {
    if (e.key === 'a' && onAdd) onAdd(path);
    if (e.key === 'd' && onDelete) onDelete(path);
    if (e.key === 'e' && onExpand) onExpand(path);
  };
  return (
    <li tabIndex="0" aria-label={label} onKeyDown={handleKeyDown}>
      {label}{' '}
      {onAdd && (
        <button onClick={() => onAdd(path)} aria-label={translations.en.add}>
          {translations[lang]?.add || translations.en.add}
        </button>
      )}{' '}
      {onDelete && (
        <button onClick={() => onDelete(path)} aria-label={translations.en.delete}>
          {translations[lang]?.delete || translations.en.delete}
        </button>
      )}{' '}
      {onExpand && (
        <button onClick={() => onExpand(path)} aria-label={translations.en.expand}>
          {translations[lang]?.expand || translations.en.expand}
        </button>
      )}
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
              lang={lang}
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
  const [mapOffset, setMapOffset] = useState(0);
  const [hasMoreMaps, setHasMoreMaps] = useState(true);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'en');
  const [layout, setLayout] = useState(() => localStorage.getItem('layout') || 'hierarchical');
  const [useStream, setUseStream] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const tr = key => t(lang, key);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = lang;
    localStorage.setItem('lang', lang);
  }, [lang]);

  useEffect(() => {
    localStorage.setItem('layout', layout);
  }, [layout]);

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

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  const toggleLang = () => {
    setLang(prev => (prev === 'en' ? 'ko' : 'en'));
  };

  const toggleLayout = () => {
    setLayout(prev => (prev === 'hierarchical' ? 'radial' : 'hierarchical'));
  };

  const MAP_LIMIT = 5;
  const loadMaps = async (offset = 0, append = false) => {
    const token = await auth.currentUser?.getIdToken?.();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(`/api/maps?offset=${offset}&limit=${MAP_LIMIT}`, { headers });
    if (res.ok) {
      const data = await res.json();
      if (append) {
        setMaps(prev => [...prev, ...data]);
      } else {
        setMaps(data);
      }
      setHasMoreMaps(data.length === MAP_LIMIT);
      setMapOffset(offset + data.length);
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

  const loadMoreMaps = async () => {
    await loadMaps(mapOffset, true);
  };

  const deleteMapById = async id => {
    if (!confirm(tr('deleteMapConfirm'))) return;
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
    loadMaps(0);
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
        if (useStream) {
          res = await fetch('/api/text-sse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader },
            body: JSON.stringify({ text })
          });
        } else {
          res = await fetch('/api/text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader },
            body: JSON.stringify({ text })
          });
        }
      } else {
        setError('No file or text provided');
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error('Upload failed');
      if (useStream && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop();
          for (const part of parts) {
            const lines = part.split('\n');
            const event = lines[0].replace('event: ', '').trim();
            const dataStr = lines[1].replace('data: ', '').trim();
            if (event === 'tree') {
              const data = JSON.parse(dataStr);
              setTree(data.tree);
              setMapId(data.id);
            }
          }
        }
      } else {
        const data = await res.json();
        setTree(data.tree);
        setMapId(data.id);
      }
      await loadMaps();
      await loadUsage();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const addChild = async path => {
    const title = prompt(tr('childTitlePrompt'));
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
    if (!mapId || !confirm(tr('deleteNodeConfirm'))) return;
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

  const createCheckoutSession = async () => {
    const token = await auth.currentUser?.getIdToken?.();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers,
      body: JSON.stringify({ success_url: window.location.href, cancel_url: window.location.href })
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    }
  };

  return (
    <div className="app-container">
      <h1>VisualMind MVP</h1>
      <button onClick={toggleTheme} className="theme-toggle" aria-label={tr('toggleTheme')}>
        {theme === 'light' ? tr('dark') : tr('light')} {tr('mode')}
      </button>
      <button onClick={toggleLang} className="lang-toggle" aria-label={tr('toggleLang')}>
        {lang === 'en' ? 'KO' : 'EN'}
      </button>
      <button onClick={toggleLayout} className="layout-toggle" aria-label={tr('toggleLayout')}>
        {tr(layout)}
      </button>
      <label style={{ float: 'right', marginLeft: '0.5rem' }}>
        <input
          type="checkbox"
          checked={useStream}
          onChange={e => setUseStream(e.target.checked)}
        />
        {' '}SSE
      </label>
      {user ? (
        <>
          <p>{user.email}</p>
          <button onClick={logout} aria-label={tr('logout')}>{tr('logout')}</button>
          <form onSubmit={handleSubmit} style={{ marginTop: '1rem' }}>
            <div style={{ marginBottom: '0.5rem' }}>
              <input type="file" aria-label={tr('uploadPrompt')} onChange={e => setFile(e.target.files[0])} />
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <textarea
                placeholder={tr('textPlaceholder')}
                rows="5"
                style={{ width: '100%' }}
                value={text}
                onChange={e => setText(e.target.value)}
                aria-label={tr('textPlaceholder')}
              />
            </div>
            <button type="submit" aria-label={tr('submit')}>{tr('submit')}</button>
          </form>
        </>
      ) : (
        <form onSubmit={login} style={{ marginBottom: '1rem' }}>
          <div>
            <input
              type="email"
              placeholder={tr('email')}
              value={email}
              onChange={e => setEmail(e.target.value)}
              aria-label={tr('email')}
            />
          </div>
          <div>
            <input
              type="password"
              placeholder={tr('password')}
              value={password}
              onChange={e => setPassword(e.target.value)}
              aria-label={tr('password')}
            />
          </div>
          <button type="submit" aria-label={tr('login')}>{tr('login')}</button>{' '}
          <button type="button" onClick={signup} aria-label={tr('signup')}>{tr('signup')}</button>
        </form>
      )}
      {usage && (
        <p>{tr('dailyUsage')}: {usage.count} / {usage.quota}</p>
      )}
      <button onClick={createCheckoutSession} aria-label={tr('subscribe')}>
        {tr('subscribe')}
      </button>
      {loading && <p>{tr('loading')}</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {tree && (
        <div>
          <h2>{tr('mindMap')}</h2>
          <MindMap data={tree} layout={layout} />
          <ul>
            <MindMapNode
              node={tree}
              path={[]}
              onAdd={addChild}
              onDelete={deleteNode}
              onExpand={expandNode}
              lang={lang}
            />
          </ul>
          <p>ID: {mapId}</p>
          <h3>Raw JSON</h3>
          <pre>{JSON.stringify(tree, null, 2)}</pre>
        </div>
      )}
      {maps.length > 0 && (
        <div>
          <h2>{tr('savedMaps')}</h2>
          <ul>
            {maps.map(m => (
              <li key={m.id}>
                <button onClick={() => loadMapById(m.id)} aria-label={tr('load')}>
                  {tr('load')}
                </button>{' '}
                {m.id}{' '}
                <button onClick={() => deleteMapById(m.id)} aria-label={tr('delete')}>
                  {tr('delete')}
                </button>
              </li>
            ))}
          </ul>
          {hasMoreMaps && (
            <button onClick={loadMoreMaps} aria-label={tr('loadMore')}>
              {tr('loadMore')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
