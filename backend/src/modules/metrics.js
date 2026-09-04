import { query } from '../database/db.js';

export async function metrics(req, res) {
  const started = Date.now();
  try {
    const result = await query('SELECT 1 AS ok');
    const body = [
      '# HELP bus_platform_up API process readiness dependency check.',
      '# TYPE bus_platform_up gauge',
      `bus_platform_up ${result.rows[0]?.ok === 1 ? 1 : 0}`,
      '# HELP bus_platform_healthcheck_duration_ms Duration of dependency check.',
      '# TYPE bus_platform_healthcheck_duration_ms gauge',
      `bus_platform_healthcheck_duration_ms ${Date.now() - started}`,
    ].join('\n') + '\n';
    res.type('text/plain').send(body);
  } catch {
    res.status(503).type('text/plain').send('bus_platform_up 0\n');
  }
}
