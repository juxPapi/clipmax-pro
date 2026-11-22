// Thin client for the local API.

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: options.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    ...options,
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!response.ok) {
    throw new Error(data?.error || `${response.status} ${response.statusText}`);
  }
  return data;
}

export const api = {
  health: () => request('/api/health'),
  bootstrap: () => request('/api/bootstrap'),
  projects: () => request('/api/projects'),
  project: (id) => request(`/api/projects/${id}`),
  settings: () => request('/api/settings'),
  saveSettings: (patch) => request('/api/settings', { method: 'PUT', body: JSON.stringify(patch) }),

  fromUrl: (url) => request('/api/projects/url', { method: 'POST', body: JSON.stringify({ url }) }),

  upload(file, onProgress) {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append('video', file, file.name);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/projects/upload');
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) onProgress(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onload = () => {
        let data = null;
        try {
          data = JSON.parse(xhr.responseText || '{}');
        } catch {
          data = {};
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data?.error || `Upload failed (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error('The upload connection failed.'));
      xhr.send(form);
    });
  },

  analyze: (id, options) =>
    request(`/api/projects/${id}/analyze`, { method: 'POST', body: JSON.stringify(options || {}) }),
  render: (id, options) => request(`/api/projects/${id}/render`, { method: 'POST', body: JSON.stringify(options) }),
  splitRender: (options) => request('/api/split/render', { method: 'POST', body: JSON.stringify(options) }),
  removeProject: (id) => request(`/api/projects/${id}`, { method: 'DELETE' }),
  removeExport: (id, exportId) => request(`/api/projects/${id}/exports/${exportId}`, { method: 'DELETE' }),

  queue: () => request('/api/publish/queue'),
  publish: (payload) => request('/api/publish', { method: 'POST', body: JSON.stringify(payload) }),
  retryPost: (id) => request(`/api/publish/${id}/retry`, { method: 'POST' }),
  cancelPost: (id) => request(`/api/publish/${id}`, { method: 'DELETE' }),
};
