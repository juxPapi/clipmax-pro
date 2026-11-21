import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';

const AppContext = createContext(null);

function toSummary(project) {
  if (!project) return null;
  return {
    id: project.id,
    name: project.name,
    source: project.source || null,
    duration: project.duration,
    width: project.width,
    height: project.height,
    status: project.status,
    progress: project.progress || null,
    clips: project.clips?.length || 0,
    topScore: project.clips?.reduce((max, clip) => Math.max(max, clip.score || 0), 0) || 0,
    exports: project.exports?.length || 0,
    language: project.language || 'auto',
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    thumb: `/api/projects/${project.id}/thumb`,
  };
}

export function AppProvider({ children }) {
  const [booting, setBooting] = useState(true);
  const [fatal, setFatal] = useState(null);
  const [projects, setProjects] = useState([]);
  const [queue, setQueue] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [settings, setSettings] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [health, setHealth] = useState(null);
  const [details, setDetails] = useState({});
  const [logs, setLogs] = useState({});
  const [toasts, setToasts] = useState([]);
  const toastId = useRef(0);

  const notify = useCallback((message, tone = 'neutral') => {
    const id = (toastId.current += 1);
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 5200);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const applyProject = useCallback((project) => {
    if (!project) return;
    setDetails((current) => ({ ...current, [project.id]: project }));
    const summary = toSummary(project);
    setProjects((current) => {
      const index = current.findIndex((entry) => entry.id === project.id);
      if (index === -1) return [summary, ...current];
      const next = [...current];
      next[index] = { ...next[index], ...summary };
      return next;
    });
  }, []);

  const refreshProjects = useCallback(async () => {
    const data = await api.projects();
    setProjects(data.projects);
    return data.projects;
  }, []);

  const refreshQueue = useCallback(async () => {
    const data = await api.queue();
    setQueue(data.items);
    return data.items;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [boot, healthData] = await Promise.all([api.bootstrap(), api.health()]);
        if (cancelled) return;
        setSettings(boot.settings);
        setProjects(boot.projects);
        setQueue(boot.queue);
        setJobs(boot.jobs);
        setHealth(healthData);
        setCatalog({
          styles: boot.styles,
          defaultStyle: boot.defaultStyle,
          styleCount: boot.styleCount,
          aspects: boot.aspects,
          layouts: boot.layouts,
          languages: boot.languages,
          models: boot.models,
          targets: boot.targets,
        });
      } catch (error) {
        if (!cancelled) setFatal(String(error.message || error));
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const source = new EventSource('/api/events');
    source.onmessage = (message) => {
      let payload = null;
      try {
        payload = JSON.parse(message.data);
      } catch {
        return;
      }
      if (payload.type === 'project' && payload.project) {
        applyProject(payload.project);
      } else if (payload.type === 'queue' && Array.isArray(payload.items)) {
        setQueue(payload.items);
      } else if (payload.type === 'job' && payload.job) {
        setJobs((current) => {
          const index = current.findIndex((entry) => entry.id === payload.job.id);
          if (index === -1) return [payload.job, ...current].slice(0, 60);
          const next = [...current];
          next[index] = payload.job;
          return next;
        });
      } else if (payload.type === 'log' && payload.projectId) {
        setLogs((current) => {
          const lines = [...(current[payload.projectId] || []), payload.line].slice(-40);
          return { ...current, [payload.projectId]: lines };
        });
      }
    };
    return () => source.close();
  }, [applyProject]);

  const loadProject = useCallback(
    async (id) => {
      const data = await api.project(id);
      applyProject(data.project);
      return data;
    },
    [applyProject]
  );

  const createFromUrl = useCallback(
    async (url) => {
      const data = await api.fromUrl(url);
      applyProject(data.project);
      notify('Link accepted. The pipeline is pulling it now.', 'good');
      return data.project;
    },
    [applyProject, notify]
  );

  const createFromUpload = useCallback(
    async (file, onProgress) => {
      const data = await api.upload(file, onProgress);
      applyProject(data.project);
      notify('File received. Listening for the good parts.', 'good');
      return data.project;
    },
    [applyProject, notify]
  );

  const reanalyze = useCallback(
    async (id, options) => {
      const data = await api.analyze(id, options);
      applyProject(data.project);
      notify('Listening again with the new model.', 'neutral');
      return data.project;
    },
    [applyProject, notify]
  );

  const renderClip = useCallback(
    async (id, options) => {
      const result = await api.render(id, options);
      await loadProject(id);
      notify('Export finished.', 'good');
      return result;
    },
    [loadProject, notify]
  );

  const removeProject = useCallback(
    async (id) => {
      await api.removeProject(id);
      setProjects((current) => current.filter((entry) => entry.id !== id));
      setDetails((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      notify('Source and exports deleted.', 'neutral');
    },
    [notify]
  );

  const removeExport = useCallback(
    async (id, exportId) => {
      const data = await api.removeExport(id, exportId);
      applyProject(data.project);
      notify('Export deleted.', 'neutral');
    },
    [applyProject, notify]
  );

  const publish = useCallback(
    async (payload) => {
      const { item } = await api.publish(payload);
      notify(item.status === 'scheduled' ? 'Added to the posting queue.' : 'Queued.', 'good');
      return item;
    },
    [notify]
  );

  const retryPost = useCallback(
    async (id) => {
      await api.retryPost(id);
      notify('Retrying that post.', 'neutral');
    },
    [notify]
  );

  const cancelPost = useCallback(
    async (id) => {
      await api.cancelPost(id);
      notify('Removed from the queue.', 'neutral');
    },
    [notify]
  );

  const saveSettings = useCallback(
    async (patch) => {
      const data = await api.saveSettings(patch);
      setSettings(data.settings);
      notify('Settings saved.', 'good');
      return data.settings;
    },
    [notify]
  );

  const value = useMemo(
    () => ({
      booting,
      fatal,
      projects,
      queue,
      jobs,
      settings,
      catalog,
      health,
      details,
      logs,
      toasts,
      notify,
      dismissToast,
      refreshProjects,
      refreshQueue,
      loadProject,
      createFromUrl,
      createFromUpload,
      reanalyze,
      renderClip,
      removeProject,
      removeExport,
      publish,
      retryPost,
      cancelPost,
      saveSettings,
    }),
    [
      booting,
      fatal,
      projects,
      queue,
      jobs,
      settings,
      catalog,
      health,
      details,
      logs,
      toasts,
      notify,
      dismissToast,
      refreshProjects,
      refreshQueue,
      loadProject,
      createFromUrl,
      createFromUpload,
      reanalyze,
      renderClip,
      removeProject,
      removeExport,
      publish,
      retryPost,
      cancelPost,
      saveSettings,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}
