import React, { useState } from 'react';

function App() {
  const [file, setFile] = useState(null);
  const [tree, setTree] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
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
      {tree && <pre>{JSON.stringify(tree, null, 2)}</pre>}
    </div>
  );
}

export default App;
