import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
const dbPath = join(dataDir, 'db.json');

mkdirSync(dataDir, { recursive: true });

const defaultData = {
  nextJobId: 6,
  nextExecId: 7,
  jobs: [
    { id: 1, name: 'Backup DB', expression: '0 2 * * *', command: '/scripts/backup.sh', enabled: true, created_at: '2026-03-01T00:00:00Z', updated_at: '2026-03-01T00:00:00Z' },
    { id: 2, name: 'Clear Logs', expression: '0 0 * * 0', command: 'find /var/log -name "*.log" -mtime +30 -delete', enabled: true, created_at: '2026-03-01T00:00:00Z', updated_at: '2026-03-01T00:00:00Z' },
    { id: 3, name: 'Health Check', expression: '*/5 * * * *', command: 'curl -s http://localhost:3000/health', enabled: true, created_at: '2026-03-01T00:00:00Z', updated_at: '2026-03-01T00:00:00Z' },
    { id: 4, name: 'Send Reports', expression: '0 9 * * 1', command: 'python3 /scripts/weekly_report.py', enabled: true, created_at: '2026-03-01T00:00:00Z', updated_at: '2026-03-01T00:00:00Z' },
    { id: 5, name: 'Sync Data', expression: '30 */6 * * *', command: '/scripts/sync.sh', enabled: false, created_at: '2026-03-01T00:00:00Z', updated_at: '2026-03-01T00:00:00Z' },
  ],
  executions: [
    { id: 1, job_id: 1, status: 'success', started_at: '2026-03-05T02:00:00Z', finished_at: '2026-03-05T02:03:12Z', output: 'Backup completed: 2.3GB' },
    { id: 2, job_id: 1, status: 'success', started_at: '2026-03-06T02:00:00Z', finished_at: '2026-03-06T02:02:45Z', output: 'Backup completed: 2.4GB' },
    { id: 3, job_id: 3, status: 'success', started_at: '2026-03-06T06:45:00Z', finished_at: '2026-03-06T06:45:01Z', output: 'OK' },
    { id: 4, job_id: 3, status: 'failed', started_at: '2026-03-06T06:50:00Z', finished_at: '2026-03-06T06:50:05Z', error: 'Connection refused' },
    { id: 5, job_id: 4, status: 'success', started_at: '2026-03-03T09:00:00Z', finished_at: '2026-03-03T09:05:30Z', output: 'Report sent to 12 recipients' },
    { id: 6, job_id: 5, status: 'running', started_at: '2026-03-06T06:30:00Z', finished_at: null, output: null },
  ],
};

let data;
try {
  data = JSON.parse(readFileSync(dbPath, 'utf8'));
} catch {
  data = structuredClone(defaultData);
  save();
}

function save() {
  writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

export function getDb() { return data; }
export function persist() { save(); }
