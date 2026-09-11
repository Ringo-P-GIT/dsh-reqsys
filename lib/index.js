/**
 * ============================================================================
 * dsh-reqsys 宿主半侧（host half）—— 需求管理系统的"后端"部分
 * ============================================================================
 *
 * 【本文件做什么】
 *   在 DSH 的 Web 服务器上注册 `/dsh-reqsys/` 前缀的 HTTP 路由，
 *   提供需求（行迹）和任务（未竟）的完整 CRUD API，数据持久化到
 *   $DSH_HOME/requirements/data.json（与原 dsh-pet 集成版位置一致，
 *   升级后数据无缝迁移）。
 *
 * 【与原 dsh-pet 里的 reqsys 代码关系】
 *   本文件是从 dah-pet-ringo_P/index.js 提取的纯需求管理部分，
 *   去掉了宠物状态、资源路由等无关逻辑。数据格式 100% 兼容。
 *
 * 【路由结构】
 *   GET    /dsh-reqsys/api/requirements      → 列表
 *   POST   /dsh-reqsys/api/requirements      → 批量新增（含自动标签+润色）
 *   PUT    /dsh-reqsys/api/requirements/:id  → 更新（progress/version/archived/等）
 *   DELETE /dsh-reqsys/api/requirements/:id  → 删除
 *   GET    /dsh-reqsys/api/rules             → 获取标签规则
 *   PUT    /dsh-reqsys/api/rules             → 保存标签规则
 *   GET    /dsh-reqsys/api/tasks             → 列表
 *   POST   /dsh-reqsys/api/tasks             → 新增
 *   PUT    /dsh-reqsys/api/tasks/:id         → 更新（status/archived/等）
 *   DELETE /dsh-reqsys/api/tasks/:id         → 删除
 *
 * ============================================================================
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// 插件标识
const name = 'reqsys';
/** 需要注入的服务：webServer */
const inject = ['webServer'];

/**
 * 解析 DSH 主目录（$DSH_HOME，默认 ~/.dsh），自实现以避免对
 * @deepseek-ai/dsh-home-paths 的运行时依赖（link 插件无法从自身路径解析到它）。
 */
function resolveDshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh');
}

// ---- 数据持久化 ----
const REQSYS_DATA_DIR = join(resolveDshHome(), 'requirements');
const REQSYS_DATA_FILE = join(REQSYS_DATA_DIR, 'data.json');

/**
 * 读取需求数据，带自动备份恢复。
 * 数据格式：{ requirements: Req[], tasks: Task[], rules: Rule[] }
 */
function reqsysReadData() {
  try {
    return JSON.parse(readFileSync(REQSYS_DATA_FILE, 'utf-8'));
  } catch (e) {
    // 主文件损坏，尝试从备份恢复
    try {
      const backup = JSON.parse(readFileSync(REQSYS_DATA_FILE + '.backup', 'utf-8'));
      writeFileSync(REQSYS_DATA_FILE, JSON.stringify(backup, null, 2), 'utf-8');
      console.warn('[dsh-reqsys] 数据文件损坏，已从备份恢复');
      return backup;
    } catch (e2) {
      // 备份也损坏，返回默认结构
      return {
        requirements: [],
        tasks: [],
        rules: [
          { keywords: ['OA'], tag: 'OA' },
          { keywords: ['qsale', '销售'], tag: '销售' },
          { keywords: ['预算系统'], tag: '预算系统' },
        ],
      };
    }
  }
}

function reqsysWriteData(data) {
  const content = JSON.stringify(data, null, 2);
  if (!existsSync(REQSYS_DATA_DIR)) {
    mkdirSync(REQSYS_DATA_DIR, { recursive: true });
  }
  writeFileSync(REQSYS_DATA_FILE, content, 'utf-8');
  writeFileSync(REQSYS_DATA_FILE + '.backup', content, 'utf-8');
}

// ---- 路由 ----
const ROUTE_PREFIX = '/dsh-reqsys';
const MIME_JSON = 'application/json; charset=utf-8';

/**
 * 宿主插件主体：注册 `/dsh-reqsys` 前缀路由。
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {object} config
 */
function apply(ctx, config) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: ROUTE_PREFIX,
    handler: async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const rest = decodeURIComponent(url.pathname.slice(ROUTE_PREFIX.length + 1));

      // ---- 需求 API（行迹）----
      if (rest === 'api/requirements') {
        if (req.method === 'GET') {
          const data = reqsysReadData();
          res.writeHead(200, { 'content-type': MIME_JSON });
          res.end(JSON.stringify(data.requirements || []));
          return;
        }
        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const items = JSON.parse(body);
              const data = reqsysReadData();
              const rules = data.rules || [];
              const saved = [];
              for (const item of items) {
                let polished = (item.polished || item.original || '').trim();
                if (polished && !/[。.!？!?]/.test(polished.slice(-1))) polished += '。';
                const text = (item.original + ' ' + (item.polished || '')).toLowerCase();
                const autoTags = [];
                for (const rule of rules) {
                  for (const kw of (rule.keywords || [])) {
                    if (text.indexOf(kw.toLowerCase()) !== -1) {
                      if (autoTags.indexOf(rule.tag) === -1) autoTags.push(rule.tag);
                    }
                  }
                }
                const combinedTags = (item.tags || []).slice();
                for (const t of autoTags) {
                  if (combinedTags.indexOf(t) === -1) combinedTags.push(t);
                }
                const req = {
                  id: Date.now().toString(36) + Math.random().toString(36).substring(2, 7),
                  timestamp: new Date().toISOString(),
                  original: item.original || '',
                  polished: polished,
                  tags: combinedTags,
                  progress: '未处理',
                  version: '',
                  reason: '',
                };
                data.requirements.push(req);
                saved.push(req);
              }
              reqsysWriteData(data);
              res.writeHead(200, { 'content-type': MIME_JSON });
              res.end(JSON.stringify({ ok: true, requirements: saved }));
            } catch (e) {
              res.writeHead(400, { 'content-type': MIME_JSON });
              res.end(JSON.stringify({ error: e.message }));
            }
          });
          return;
        }
        res.writeHead(405);
        res.end('Method not allowed');
        return;
      }

      if (rest.startsWith('api/requirements/')) {
        const id = rest.split('/')[2];
        if (req.method === 'PUT' && id) {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const updates = JSON.parse(body);
              const data = reqsysReadData();
              const r = data.requirements.find(r => r.id === id);
              if (!r) {
                res.writeHead(404, { 'content-type': MIME_JSON });
                res.end(JSON.stringify({ error: 'not found' }));
                return;
              }
              if (updates.progress !== undefined) r.progress = updates.progress;
              if (updates.version !== undefined) r.version = updates.version;
              if (updates.reason !== undefined) r.reason = updates.reason;
              if (updates.polished !== undefined) r.polished = updates.polished;
              if (updates.tags !== undefined) r.tags = updates.tags;
              if (updates.archived !== undefined) {
                r.archived = updates.archived;
                if (updates.archived) {
                  r.archivedAt = new Date().toISOString();
                } else {
                  delete r.archivedAt;
                }
              }
              if (updates.status !== undefined) r.status = updates.status;
              reqsysWriteData(data);
              res.writeHead(200, { 'content-type': MIME_JSON });
              res.end(JSON.stringify({ ok: true }));
            } catch (e) {
              res.writeHead(400, { 'content-type': MIME_JSON });
              res.end(JSON.stringify({ error: e.message }));
            }
          });
          return;
        }
        if (req.method === 'DELETE' && id) {
          const data = reqsysReadData();
          const idx = data.requirements.findIndex(r => r.id === id);
          if (idx === -1) {
            res.writeHead(404, { 'content-type': MIME_JSON });
            res.end(JSON.stringify({ error: 'not found' }));
            return;
          }
          data.requirements.splice(idx, 1);
          reqsysWriteData(data);
          res.writeHead(200, { 'content-type': MIME_JSON });
          res.end(JSON.stringify({ ok: true }));
          return;
        }
        res.writeHead(405);
        res.end('Method not allowed');
        return;
      }

      // ---- 标签规则 API ----
      if (rest === 'api/rules') {
        if (req.method === 'GET') {
          const data = reqsysReadData();
          res.writeHead(200, { 'content-type': MIME_JSON });
          res.end(JSON.stringify(data.rules || []));
          return;
        }
        if (req.method === 'PUT') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const newRules = JSON.parse(body);
              const data = reqsysReadData();
              data.rules = newRules;
              reqsysWriteData(data);
              res.writeHead(200, { 'content-type': MIME_JSON });
              res.end(JSON.stringify({ ok: true }));
            } catch (e) {
              res.writeHead(400, { 'content-type': MIME_JSON });
              res.end(JSON.stringify({ error: e.message }));
            }
          });
          return;
        }
        res.writeHead(405);
        res.end('Method not allowed');
        return;
      }

      // ---- 任务 API（未竟）----
      if (rest === 'api/tasks') {
        if (req.method === 'GET') {
          const data = reqsysReadData();
          res.writeHead(200, { 'content-type': MIME_JSON });
          res.end(JSON.stringify(data.tasks || []));
          return;
        }
        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const item = JSON.parse(body);
              const data = reqsysReadData();
              if (!data.tasks) data.tasks = [];
              const task = {
                id: Date.now().toString(36) + Math.random().toString(36).substring(2, 7),
                timestamp: new Date().toISOString(),
                description: item.description || '',
                deadline: item.deadline || '',
                status: item.status || '未开始',
              };
              data.tasks.push(task);
              reqsysWriteData(data);
              res.writeHead(200, { 'content-type': MIME_JSON });
              res.end(JSON.stringify({ ok: true, task }));
            } catch (e) {
              res.writeHead(400, { 'content-type': MIME_JSON });
              res.end(JSON.stringify({ error: e.message }));
            }
          });
          return;
        }
        res.writeHead(405);
        res.end('Method not allowed');
        return;
      }

      if (rest.startsWith('api/tasks/')) {
        const id = rest.split('/')[2];
        if (req.method === 'PUT' && id) {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const updates = JSON.parse(body);
              const data = reqsysReadData();
              const t = (data.tasks || []).find(t => t.id === id);
              if (!t) {
                res.writeHead(404, { 'content-type': MIME_JSON });
                res.end(JSON.stringify({ error: 'not found' }));
                return;
              }
              if (updates.description !== undefined) t.description = updates.description;
              if (updates.deadline !== undefined) t.deadline = updates.deadline;
              if (updates.status !== undefined) t.status = updates.status;
              if (updates.archived !== undefined) {
                t.archived = updates.archived;
                if (updates.archived) {
                  t.archivedAt = new Date().toISOString();
                } else {
                  delete t.archivedAt;
                }
              }
              reqsysWriteData(data);
              res.writeHead(200, { 'content-type': MIME_JSON });
              res.end(JSON.stringify({ ok: true }));
            } catch (e) {
              res.writeHead(400, { 'content-type': MIME_JSON });
              res.end(JSON.stringify({ error: e.message }));
            }
          });
          return;
        }
        if (req.method === 'DELETE' && id) {
          const data = reqsysReadData();
          if (!data.tasks) data.tasks = [];
          const idx = data.tasks.findIndex(t => t.id === id);
          if (idx === -1) {
            res.writeHead(404, { 'content-type': MIME_JSON });
            res.end(JSON.stringify({ error: 'not found' }));
            return;
          }
          data.tasks.splice(idx, 1);
          reqsysWriteData(data);
          res.writeHead(200, { 'content-type': MIME_JSON });
          res.end(JSON.stringify({ ok: true }));
          return;
        }
        res.writeHead(405);
        res.end('Method not allowed');
        return;
      }

      // ---- 未知路由 ----
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('dsh-reqsys: unknown endpoint');
    },
  }), 'dsh-reqsys: /dsh-reqsys api route');
}

export { apply, inject, name };