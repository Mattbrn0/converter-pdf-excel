const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * Envoie les fichiers PDF au backend, suit la progression via SSE et retourne le blob Excel.
 * @param {File[]} files
 * @param { (percent: number) => void } onProgress - appelé avec 0 à 100
 * @returns {Promise<{ blob: Blob, filename: string }>}
 */
export async function convertPdfToExcel(files, onProgress) {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));

  const res = await fetch(`${API_BASE}/api/convert`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Erreur ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let token = null;
  let filename = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split(/\n\n/);
    buffer = chunks.pop() ?? '';

    for (const chunk of chunks) {
      const lines = chunk.split('\n');
      let event = '';
      let data = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) event = line.slice(7).trim();
        if (line.startsWith('data: ')) data = line.slice(6);
      }
      if (event === 'progress' && onProgress) {
        const p = parseInt(data, 10);
        if (!Number.isNaN(p)) onProgress(p);
      }
      if (event === 'done') {
        try {
          const obj = JSON.parse(data);
          token = obj.token;
          filename = obj.filename;
        } catch (_) {}
      }
      if (event === 'error') {
        try {
          const obj = JSON.parse(data);
          throw new Error(obj.error || 'Erreur conversion');
        } catch (e) {
          if (e instanceof Error && e.message !== 'Erreur conversion') throw e;
          throw new Error(data || 'Erreur conversion');
        }
      }
    }
  }

  if (!token || !filename) throw new Error('Réponse serveur invalide.');

  const downloadRes = await fetch(`${API_BASE}/api/convert/download/${token}`);
  if (!downloadRes.ok) throw new Error('Téléchargement impossible.');
  const blob = await downloadRes.blob();
  return { blob, filename };
}
