import React, { useState, useEffect, useCallback } from 'react';

const API = '/api/jobs';

function StatusBadge({ status }) {
  return <span className={`status ${status}`}>{status}</span>;
}

function Toggle({ on, onToggle }) {
  return <button className={`toggle ${on ? 'on' : 'off'}`} onClick={onToggle} />;
}

function JobForm({ job, onSave, onCancel }) {
  const [form, setForm] = useState(job || { name: '', expression: '', command: '', enabled: true });
  const [error, setError] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const method = job ? 'PUT' : 'POST';
      const url = job ? `${API}/${job.id}` : API;
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      onSave();
    } catch (e) { setError(e.message); }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>{job ? 'Edit Job' : 'New Job'}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Name</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} required placeholder="My Cron Job" />
          </div>
          <div className="form-group">
            <label>Cron Expression</label>
            <input value={form.expression} onChange={e => set('expression', e.target.value)} required placeholder="*/5 * * * *" />
          </div>
          <div className="form-group">
            <label>Command</label>
            <input value={form.command} onChange={e => set('command', e.target.value)} required placeholder="/scripts/my-task.sh" />
          </div>
          {error && <p style={{ color: '#f87171', fontSize: 13 }}>{error}</p>}
          <div className="form-actions">
            <button type="button" className="btn" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn btn-primary">{job ? 'Update' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function JobList({ jobs, onRefresh }) {
  const [editing, setEditing] = useState(null);
  const [showNew, setShowNew] = useState(false);

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete "${name}"?`)) return;
    await fetch(`${API}/${id}`, { method: 'DELETE' });
    onRefresh();
  };

  const handleToggle = async (job) => {
    await fetch(`${API}/${job.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !job.enabled }),
    });
    onRefresh();
  };

  const lastExecStatus = (job) => {
    if (!job.recent_executions?.length) return null;
    return job.recent_executions[0];
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2>Cron Jobs ({jobs.length})</h2>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ New Job</button>
      </div>
      <div className="job-list">
        {jobs.map(job => {
          const last = lastExecStatus(job);
          return (
            <div key={job.id} className="job-card">
              <div className="job-header">
                <div>
                  <span className="job-name">{job.name}</span>
                  <span className="job-expr" style={{ marginLeft: 12 }}>{job.expression}</span>
                </div>
                <Toggle on={job.enabled} onToggle={() => handleToggle(job)} />
              </div>
              <div className="job-command">{job.command}</div>
              <div className="job-meta">
                {last && <StatusBadge status={last.status} />}
                {!job.enabled && <StatusBadge status="disabled" />}
                {job.next_runs?.[0] && (
                  <span className="next-run">Next: {new Date(job.next_runs[0]).toLocaleString()}</span>
                )}
                <span style={{ flex: 1 }} />
                <div className="job-actions">
                  <button className="btn" onClick={() => setEditing(job)}>Edit</button>
                  <button className="btn btn-danger" onClick={() => handleDelete(job.id, job.name)}>Delete</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {showNew && <JobForm onSave={() => { setShowNew(false); onRefresh(); }} onCancel={() => setShowNew(false)} />}
      {editing && <JobForm job={editing} onSave={() => { setEditing(null); onRefresh(); }} onCancel={() => setEditing(null)} />}
    </>
  );
}

function Timeline({ schedule }) {
  const grouped = {};
  for (const evt of schedule) {
    const date = new Date(evt.time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(evt);
  }

  return (
    <>
      <h2>Schedule (next 7 days)</h2>
      {Object.keys(grouped).length === 0 && <p style={{ color: '#64748b' }}>No scheduled events</p>}
      <div className="timeline">
        {Object.entries(grouped).map(([date, events]) => (
          <div key={date} className="timeline-day">
            <div className="timeline-date">{date}</div>
            <div className="timeline-events">
              {events.slice(0, 20).map((evt, i) => (
                <div key={i} className="timeline-event">
                  <span className="timeline-time">{new Date(evt.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span>{evt.job_name}</span>
                </div>
              ))}
              {events.length > 20 && <span style={{ color: '#64748b', fontSize: 12 }}>+{events.length - 20} more</span>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function ExecutionLog({ jobs }) {
  const allExecs = jobs.flatMap(j =>
    (j.recent_executions || []).map(e => ({ ...e, job_name: j.name }))
  ).sort((a, b) => b.started_at.localeCompare(a.started_at));

  return (
    <>
      <h2>Recent Executions</h2>
      {allExecs.length === 0 && <p style={{ color: '#64748b' }}>No executions yet</p>}
      <div className="exec-list">
        {allExecs.map(e => (
          <div key={e.id} className="exec-row">
            <span className="exec-time">{new Date(e.started_at).toLocaleString()}</span>
            <span style={{ minWidth: 120 }}>{e.job_name}</span>
            <StatusBadge status={e.status} />
            <span className="exec-output">{e.output || e.error || '—'}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export default function App() {
  const [tab, setTab] = useState('jobs');
  const [jobs, setJobs] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [jobsRes, schedRes] = await Promise.all([fetch(API), fetch(`${API}/schedule?days=7`)]);
      setJobs(await jobsRes.json());
      setSchedule(await schedRes.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  if (loading) return <div className="app"><h1>CronManager</h1><p>Loading...</p></div>;

  return (
    <div className="app">
      <h1>CronManager</h1>
      <div className="tabs">
        {['jobs', 'timeline', 'executions'].map(t => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'jobs' ? 'Jobs' : t === 'timeline' ? 'Timeline' : 'Executions'}
          </button>
        ))}
      </div>
      {tab === 'jobs' && <JobList jobs={jobs} onRefresh={refresh} />}
      {tab === 'timeline' && <Timeline schedule={schedule} />}
      {tab === 'executions' && <ExecutionLog jobs={jobs} />}
    </div>
  );
}
