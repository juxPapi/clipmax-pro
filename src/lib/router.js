import { useEffect, useState } from 'react';

/** Navigate by hash so the desktop shell needs no router dependency. */
export function navigate(path) {
  window.location.hash = path.startsWith('#') ? path : `#/${path.replace(/^\//, '')}`;
}

export function useRoute() {
  const [hash, setHash] = useState(() => window.location.hash || '#/library');
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || '#/library');
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const clean = hash.replace(/^#\/?/, '');
  const [view = 'library', param = null] = clean.split('/');
  return { view, param };
}
