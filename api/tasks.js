const REPO = 'SyuneHovan/arahet-agrocamp-LOCAL';
const BRANCH = 'plan-data';
const API_URL = `https://api.github.com/repos/${REPO}/contents/tasks.json`;

class StoreError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

function validateDocument(data) {
  if (data?.schemaVersion !== 1 || !Array.isArray(data.tasks) || data.tasks.length !== 38 ||
    new Set(data.tasks.map(t => t.id)).size !== data.tasks.length ||
    data.tasks.some(t => typeof t.id !== 'string' || typeof t.done !== 'boolean' ||
      !Number.isSafeInteger(t.revision) || t.revision < 0)) {
    throw new StoreError(502, 'invalid_store');
  }
  return data;
}

function createHandler({fetchImpl = globalThis.fetch, token = () => process.env.ARAHET_GITHUB_TOKEN, pause = ms => new Promise(r => setTimeout(r, ms))} = {}) {
  async function github(method, payload) {
    const response = await fetchImpl(API_URL + (method === 'GET' ? `?ref=${BRANCH}` : ''), {
      method, cache: 'no-store', signal: AbortSignal.timeout(10000),
      headers: {Authorization: `Bearer ${token()}`, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json', 'User-Agent': 'Arahet-Internal-Plan'},
      ...(payload ? {body: JSON.stringify(payload)} : {})
    });
    if (!response.ok) {
      if (response.status === 409) throw new StoreError(409, 'write_conflict');
      if (response.status === 429 || response.status === 403) throw new StoreError(503, 'github_unavailable');
      throw new StoreError(502, 'github_unavailable');
    }
    return response.json();
  }
  async function read() {
    const file = await github('GET');
    if (file.encoding !== 'base64' || !file.sha || typeof file.content !== 'string') throw new StoreError(502, 'invalid_store');
    return {sha: file.sha, data: validateDocument(JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')))};
  }
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'PATCH'].includes(req.method)) {
      res.setHeader('Allow', 'GET, PATCH'); return res.status(405).json({error: 'method_not_allowed'});
    }
    if (!token()) return res.status(503).json({error: 'storage_not_configured'});
    try {
      if (req.method === 'GET') return res.status(200).json((await read()).data);
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) return res.status(415).json({error:'json_required'});
      // The endpoint intentionally permits anonymous edits, but not cross-site browser form submissions.
      if (req.headers.origin) {
        const expected = new URL(`https://${req.headers.host}`).host;
        if (new URL(req.headers.origin).host !== expected) return res.status(403).json({error:'origin_rejected'});
      }
      let body = req.body;
      if (typeof body === 'string') {
        if (Buffer.byteLength(body) > 1024) return res.status(413).json({error:'invalid_change'});
        try { body = JSON.parse(body); } catch { return res.status(400).json({error:'invalid_change'}); }
      }
      if (!body || Object.keys(body).sort().join(',') !== 'done,id,revision' ||
        typeof body.id !== 'string' || body.id.length > 80 || typeof body.done !== 'boolean' ||
        !Number.isSafeInteger(body.revision) || body.revision < 0) return res.status(400).json({error:'invalid_change'});
      for (let attempt = 0; attempt < 4; attempt++) {
        const {sha, data} = await read();
        const task = data.tasks.find(t => t.id === body.id);
        if (!task) return res.status(404).json({error:'unknown_task'});
        // Idempotent retries must not create redundant commits.
        if (task.done === body.done) return res.status(200).json(data);
        if (task.revision !== body.revision) return res.status(409).json({error:'task_changed', data});
        task.done = body.done;
        task.revision += 1;
        task.updatedAt = new Date().toISOString();
        try {
          await github('PUT', {branch: BRANCH, sha, message: `Update ${task.id}: ${task.done ? 'done' : 'pending'}`,
            content: Buffer.from(JSON.stringify(data, null, 2) + '\n').toString('base64')});
          return res.status(200).json(data);
        } catch (error) {
          if (error.code !== 'write_conflict' || attempt === 3) throw error;
          await pause(100 * (attempt + 1));
        }
      }
    } catch (error) {
      return res.status(error.status || 502).json({error: error.code || 'storage_unavailable'});
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
