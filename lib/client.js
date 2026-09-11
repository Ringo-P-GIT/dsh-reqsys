/**
 * ============================================================================
 * dsh-reqsys 浏览器半侧（browser half）—— 需求管理系统的"前端"部分
 * ============================================================================
 *
 * 【本文件做什么】
 *   1. 注入需求系统 UI 的 CSS
 *   2. 监听 dsh-pet 容器上的双击事件（DOM 桥接，不修改宠物代码）
 *   3. 双击后显示行迹/未竟弹窗
 *   4. 管理列表提供：筛选、分页、搜索、批量操作、导出、标签规则配置
 *
 * 【与 dsh-pet 解耦】
 *   不依赖 dsh-pet 的代码或状态。双击桥接通过捕获宠物容器的 dblclick 事件实现。
 *
 * ============================================================================
 */

window.__ModuleLoader__.load({
  id: 'dsh-reqsys',

  factory: (require) => {
    const react = require('react');
    const { useState, useEffect, useRef, useCallback, useMemo } = react;
    // 注意：必须用 createElement（h(type, props, ...children) 签名），
    // 不能用 react/jsx-runtime 的 jsx —— 后者第三参是 key，children 必须放进 props.children。
    const h = react.createElement;
    const Fragment = react.Fragment;

    // ========================================================================
    // CSS — 100% 与原 dsh-pet 集成的 reqsys UI 一致
    // ========================================================================
    const cssId = 'dsh-reqsys/css';
    if (typeof document !== 'undefined' && !document.querySelector('style[data-plugin-css="' + cssId + '"]')) {
      const tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-reqsys';
      tag.dataset.pluginCss = cssId;
      tag.textContent = [
        '.reqsys-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;overflow-y:auto}',
        '.reqsys-card-wrap{background:linear-gradient(135deg,#526aa8,#8ea5da,#c5a468,#8ea5da,#526aa8);padding:4px;border-radius:18px;box-shadow:0 8px 40px rgba(0,0,0,.3)}',
        '.reqsys-card{background:#fff;border-radius:14px;padding:28px 32px;color:#111}',
        '.reqsys-card h2{color:#172347;margin:0 0 16px 0;font-size:20px;font-weight:600}',
        '.reqsys-card textarea{width:100%;min-height:100px;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;line-height:1.5;resize:vertical;box-sizing:border-box;font-family:inherit}',
        '.reqsys-card textarea:focus{outline:0;border-color:#4a7cff;box-shadow:0 0 0 3px rgba(74,124,255,.15)}',
        '.reqsys-tags{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}',
        '.reqsys-tag{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:500;background:#e8f0fe;color:#1a5cc8}',
        '.reqsys-preview-item{border:1px solid #eee;border-radius:10px;padding:14px;margin-bottom:12px}',
        '.reqsys-preview-item .item-index{font-size:13px;font-weight:600;color:#4a7cff;margin-bottom:6px}',
        '.reqsys-table{width:100%;border-collapse:collapse;font-size:13px}',
        '.reqsys-table th{text-align:left;padding:8px 10px;border-bottom:2px solid #eee;font-weight:600;color:#555;white-space:nowrap}',
        '.reqsys-table td{padding:8px 10px;border-bottom:1px solid #f0f0f0;vertical-align:middle}',
        '.reqsys-table tr:hover td{background:#f8f9ff}',
        '.reqsys-empty{text-align:center;padding:40px 20px;color:#999}',
        '.reqsys-filter-bar{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:flex-start}',
        '.reqsys-filter-bar .filter-group{display:flex;flex-direction:column;gap:4px}',
        '.reqsys-filter-bar .filter-label{font-size:11px;color:#888;font-weight:500}',
        '.reqsys-filter-bar .filter-count{font-size:12px;color:#888;align-self:flex-end}',
        '.reqsys-version-tag{font-size:11px;font-weight:500;padding:2px 6px;border-radius:4px;display:inline-block;cursor:pointer}',
        '.reqsys-version-tag.design{background:#e3f2fd;color:#1565c0}',
        '.reqsys-version-tag.released{background:#e8f5e9;color:#2e7d32}',
        '.reqsys-reason-text{font-size:11px;color:#c62828;cursor:pointer}',
        '.reqsys-subtitle{font-size:13px;color:#666;margin:-8px 0 12px 0}',
        '.reqsys-maid-btn{background:#fff;border:1px solid rgba(71,91,145,.3);border-radius:8px;padding:8px 20px;font-size:14px;cursor:pointer;color:#172347;transition:all .15s}',
        '.reqsys-maid-btn:hover{background:rgba(103,126,183,.12);border-color:rgba(71,91,145,.5)}',
        '.reqsys-maid-btn.primary{background:#526aa8;color:#fff;border-color:#526aa8}',
        '.reqsys-maid-btn.primary:hover{background:#405a99}',
        '.reqsys-maid-btn.primary:disabled{background:#8a94aa;border-color:#8a94aa;cursor:default}',
      ].join('\n');
      document.head.appendChild(tag);
    }

    // ========================================================================
    // API 层
    // ========================================================================
    const API_BASE = '/dsh-reqsys/api';

    async function reqFetch(path, opts) {
      const res = await fetch(API_BASE + path, {
        headers: { 'Content-Type': 'application/json' },
        ...opts,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || res.statusText);
      }
      return res.json();
    }

    function fmtTime(iso) {
      if (!iso) return '';
      const d = new Date(iso);
      return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
    }

    const TAG_COLORS = ['#1a5cc8','#c62828','#2e7d32','#92400e','#6b21a8','#c55c1a','#00695c','#37474f'];
    function tagColor(t) { let h=0; for (let i=0;i<t.length;i++) h=((h<<5)-h)+t.charCodeAt(i); return TAG_COLORS[Math.abs(h)%TAG_COLORS.length]; }

    const PROGRESS_OPTIONS = ['未处理', '方案设计', '已发布', '废弃'];
    const TASK_STATUS_OPTIONS = ['未开始', '进行中', '已完成'];

    // ========================================================================
    // 居中编辑弹框（promise 化，纯 DOM，与原 dsh-pet 集成版 100% 一致）
    // ========================================================================
    function showEditDialog(title, initialValue, isMultiline) {
      return new Promise(function(resolve) {
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5)';
        overlay.addEventListener('click', function(e) { if (e.target === e.currentTarget) { document.body.removeChild(overlay); resolve(null); } });

        var wrap = document.createElement('div');
        wrap.className = 'reqsys-card-wrap';
        wrap.style.cssText = 'width:500px;max-width:92vw';

        var card = document.createElement('div');
        card.className = 'reqsys-card';
        card.style.cssText = 'padding:24px';

        var titleEl = document.createElement('h3');
        titleEl.style.cssText = 'margin:0 0 16px 0;font-size:18px;font-weight:600';
        titleEl.textContent = title;

        var input;
        if (isMultiline) {
          input = document.createElement('textarea');
          input.style.cssText = 'width:100%;min-height:120px;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;line-height:1.5;resize:vertical;box-sizing:border-box;font-family:inherit';
          input.style.height = Math.max(120, Math.min(400, (initialValue || '').split('\n').length * 24 + 30)) + 'px';
        } else {
          input = document.createElement('input');
          input.type = 'text';
          input.style.cssText = 'width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;font-family:inherit';
        }
        input.value = initialValue || '';
        input.autofocus = true;

        var btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;margin-top:16px';

        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'reqsys-maid-btn';
        cancelBtn.textContent = '取消';
        cancelBtn.addEventListener('click', function() { document.body.removeChild(overlay); resolve(null); });

        var okBtn = document.createElement('button');
        okBtn.className = 'reqsys-maid-btn primary';
        okBtn.textContent = '确认';
        okBtn.addEventListener('click', function() { document.body.removeChild(overlay); resolve(input.value); });

        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(okBtn);

        card.appendChild(titleEl);
        card.appendChild(input);
        card.appendChild(btnRow);
        wrap.appendChild(card);
        overlay.appendChild(wrap);
        document.body.appendChild(overlay);

        setTimeout(function() { input.focus(); input.select(); }, 50);
      });
    }

    // ========================================================================
    // React 主应用组件
    // ========================================================================
    function ReqsysApp() {
      const [visible, setVisible] = useState(false);
      const [tab, setTab] = useState('wish');       // wish | task
      const [view, setView] = useState('input');    // input | preview | reqlist | tasklist
      const [reqInput, setReqInput] = useState('');
      const [taskInput, setTaskInput] = useState('');
      const [taskDeadline, setTaskDeadline] = useState('');
      const [loading, setLoading] = useState(false);
      const [result, setResult] = useState(null);

      // 行迹
      const [reqList, setReqList] = useState([]);
      const [reqSelected, setReqSelected] = useState([]);
      const [reqArchived, setReqArchived] = useState(false);
      const [reqPage, setReqPage] = useState(0);
      const [reqFilterTags, setReqFilterTags] = useState([]);
      const [reqFilterProgs, setReqFilterProgs] = useState([]);
      const [reqFilterVer, setReqFilterVer] = useState([]);
      const [reqFilterSearch, setReqFilterSearch] = useState('');

      // 未竟
      const [taskList, setTaskList] = useState([]);
      const [taskSelected, setTaskSelected] = useState([]);
      const [taskArchived, setTaskArchived] = useState(false);
      const [taskPage, setTaskPage] = useState(0);
      const [taskFilterStatus, setTaskFilterStatus] = useState([]);
      const [taskFilterSearch, setTaskFilterSearch] = useState('');

      // 规则
      const [rules, setRules] = useState([]);
      const [showRules, setShowRules] = useState(false);

      // 重置
      const resetAll = useCallback(() => {
        setView('input'); setTab('wish'); setReqInput(''); setTaskInput(''); setTaskDeadline('');
        setResult(null); setLoading(false); setReqList([]); setReqSelected([]);
        setReqArchived(false); setReqPage(0); setReqFilterTags([]); setReqFilterProgs([]);
        setReqFilterVer([]); setReqFilterSearch(''); setTaskList([]); setTaskSelected([]);
        setTaskArchived(false); setTaskPage(0); setTaskFilterStatus([]); setTaskFilterSearch('');
      }, []);

      const onPreview = useCallback(function(data) {
        setResult(data);
        setView('preview');
      }, []);

      // ---- 双击桥接 ----
      // dsh-pet 0.2.8 的 pointer capture 会拦截真实 dblclick（冒泡阶段收不到），
      // 因此：① 捕获阶段监听 dblclick（先于 pet 处理）；② pointerdown 手动双击检测兜底。
      useEffect(function() {
        // 挂载 showEditDialog 到 window 供各组件使用
        if (typeof window !== 'undefined') window.showEditDialog = showEditDialog;

        // 判断一个元素是否属于 dsh-pet 容器
        function isPetElement(node) {
          while (node && node !== document.body) {
            if (node.dataset && (node.dataset.plugin === 'dsh-pet' || node.getAttribute('data-plugin') === 'dsh-pet' || node.classList.contains('dsh-pet-hit') || node.id === 'dsh-pet-root')) return true;
            node = node.parentElement;
          }
          return false;
        }

        function onDblClick(e) {
          if (isPetElement(e.target)) { setVisible(true); }
        }
        // 捕获阶段：document → ... → 目标，先于 pet 自身的处理执行
        document.addEventListener('dblclick', onDblClick, true);

        // 兜底：pointerdown 手动检测双击（pet 的 setPointerCapture 可能吞掉 dblclick）
        let lastDown = 0;
        function onPointerDown(e) {
          if (e.button !== 0) return;
          if (!isPetElement(e.target)) return;
          const now = Date.now();
          if (now - lastDown < 350) {
            setVisible(true);
            lastDown = 0;
          } else {
            lastDown = now;
          }
        }
        document.addEventListener('pointerdown', onPointerDown, true);

        return function() {
          document.removeEventListener('dblclick', onDblClick, true);
          document.removeEventListener('pointerdown', onPointerDown, true);
        };
      }, []);

      // ---- 常用 API 封装 ----
      const loadReqs = useCallback(async function() {
        setLoading(true);
        try { const d = await reqFetch('/requirements'); setReqList(d||[]); setView('reqlist'); }
        catch(e) { alert('加载失败: ' + e.message); }
        setLoading(false);
      }, []);

      const loadTasks = useCallback(async function() {
        setLoading(true);
        try { const d = await reqFetch('/tasks'); setTaskList(d||[]); setView('tasklist'); }
        catch(e) { alert('加载失败: ' + e.message); }
        setLoading(false);
      }, []);

      if (!visible) return null;

      // ---- 分类渲染 ----
      if (view === 'input') return h(InputView, {
        tab, setTab, reqInput, setReqInput, taskInput, setTaskInput,
        taskDeadline, setTaskDeadline, loading, setLoading,
        onDone: resetAll, onPreview,
        onClose: function() { setVisible(false); resetAll(); },
        onGoReqs: loadReqs, onGoTasks: loadTasks,
      });

      if (view === 'preview' && result) return h(PreviewView, {
        result, setResult,
        onBack: function() { setView('input'); setResult(null); },
        onDone: resetAll, onClose: function() { setVisible(false); resetAll(); },
      });

      if (view === 'reqlist') return h('div', {
        style: { position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.5)' },
        onClick: function(e) { if (e.target === e.currentTarget) { setVisible(false); resetAll(); } },
      }, h(ReqsysListView, {
        reqList, setReqList,
        reqFilterTags, setReqFilterTags,
        reqFilterProgs, setReqFilterProgs,
        reqFilterSearch, setReqFilterSearch,
        onClose: function() { setVisible(false); resetAll(); },
      }));

      if (view === 'tasklist') return h('div', {
        style: { position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.5)' },
        onClick: function(e) { if (e.target === e.currentTarget) { setVisible(false); resetAll(); } },
      }, h(TaskListView, {
        taskList, setTaskList,
        onClose: function() { setVisible(false); resetAll(); },
      }));

      return null;
    }

    // ========================================================================
    // 子组件：录入
    // ========================================================================
    function InputView(props) {
      const { tab, setTab, reqInput, setReqInput, taskInput, setTaskInput,
        taskDeadline, setTaskDeadline, loading, setLoading,
        onDone, onClose, onGoReqs, onGoTasks, onPreview } = props;
      const [localLoading, setLocalLoading] = useState(false);

      async function submitWish() {
        if (!reqInput.trim()) return;
        setLocalLoading(true);
        try {
          const lines = reqInput.split('\n');
          const items = []; let cur = '';
          const pat = /^\s*(?:\d+[.、）)]|[-*•]|\(\d+\))\s*/;
          for (const line of lines) {
            const l = line.trim(); if (!l) continue;
            if (pat.test(l)) { if (cur) items.push(cur.trim()); cur = l.replace(pat,'').trim(); }
            else { if (cur) cur += ' ' + l; else cur = l; }
          }
          if (cur) items.push(cur.trim());
          const processed = items.map(function(t) {
            const tl = t.toLowerCase();
            const tags = [];
            const AR = [{k:['oa'],t:'OA'},{k:['qsale','销售'],t:'销售'},{k:['预算系统'],t:'budget'}];
            AR.forEach(function(r){ r.k.forEach(function(kw){ if(tl.indexOf(kw.toLowerCase())!==-1 && tags.indexOf(r.t)===-1) tags.push(r.t); }); });
            return { original: t, polished: t, tags };
          });
          if (processed.length===0) { alert('未识别到有效需求'); return; }
          // 跳到预览确认
          onPreview({ items: processed, multi: processed.length > 1 });
        } catch(e) { alert('处理失败: ' + e.message); }
        setLocalLoading(false);
      }

      async function submitTask() {
        if (!taskInput.trim()) return;
        setLocalLoading(true);
        try {
          const resp = await fetch(API_BASE + '/tasks', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: taskInput.trim(), deadline: taskDeadline }),
          });
          const d = await resp.json();
          if (!resp.ok) { alert('保存失败: ' + (d.error||resp.status)); return; }
          setTaskInput(''); setTaskDeadline(''); alert('已添加待办');
        } catch(e) { alert('保存失败: ' + e.message); }
        setLocalLoading(false);
      }

      return h('div', { className: 'reqsys-overlay', onClick: function(e) { if (e.target===e.currentTarget) onClose(); } },
        h('div', { className: 'reqsys-card-wrap', style: { width: '640px', maxWidth: '92vw' } },
          h('div', { className: 'reqsys-card', style: { maxHeight: '85vh', overflowY: 'auto' } },
            // 标题栏
            h('div', { style: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' } },
              h('div', { style: { display:'flex', gap:'8px', alignItems:'center' } },
                h('span', { style: { padding:'6px 16px', borderRadius:'8px', fontSize:'14px', fontWeight:600, cursor:'pointer', background: tab==='wish' ? '#526aa8' : '#f0f2f5', color: tab==='wish' ? '#fff' : '#555' }, onClick: function() { setTab('wish'); } }, '事已至此'),
                h('span', { style: { padding:'6px 16px', borderRadius:'8px', fontSize:'14px', fontWeight:600, cursor:'pointer', background: tab==='task' ? '#526aa8' : '#f0f2f5', color: tab==='task' ? '#fff' : '#555' }, onClick: function() { setTab('task'); } }, '你看，又急'),
              ),
              h('div', { style: { display:'flex', gap:'6px', alignItems:'center' } },
                h('button', { className: 'reqsys-maid-btn', title:'查看行迹', style:{ display:'flex', alignItems:'center', gap:'6px', padding:'4px 12px', fontSize:'12px', background:'#8e6bb0', color:'#fff', border:'none' }, onClick: onGoReqs }, '行迹'),
                h('button', { className: 'reqsys-maid-btn', title:'查看未竟', style:{ display:'flex', alignItems:'center', gap:'6px', padding:'4px 12px', fontSize:'12px', background:'#8e6bb0', color:'#fff', border:'none' }, onClick: onGoTasks }, '未竟'),
              ),
            ),
            tab === 'wish'
              ? h('div', {},
                  h('p', { style: { fontSize:'13px', color:'#666', margin:'-8px 0 12px 0' } }, '早点录完，早点休息'),
                  h('textarea', { value: reqInput, onChange: function(e) { setReqInput(e.target.value); }, placeholder: '例如：\n1. OA审批流程优化\n2. 销售报表按月份筛选\n3. 预算系统对接财务', style: { width:'100%', minHeight:'140px', padding:'10px 12px', border:'1px solid #ddd', borderRadius:'8px', fontSize:'14px', lineHeight:1.5, resize:'vertical', boxSizing:'border-box', fontFamily:'inherit' }, autoFocus: true }),
                  h('div', { style: { display:'flex', gap:'10px', justifyContent:'flex-end', marginTop:'16px' } },
                    h('button', { className: 'reqsys-maid-btn', onClick: onClose }, '取消'),
                    h('button', { className: 'reqsys-maid-btn primary', onClick: submitWish, disabled: localLoading || !reqInput.trim() }, localLoading ? '处理中...' : '提交'),
                  ),
                )
              : h('div', {},
                  h('p', { style: { fontSize:'13px', color:'#666', margin:'-8px 0 12px 0' } }, '我知道你很急，但是别急'),
                  h('textarea', { value: taskInput, onChange: function(e) { setTaskInput(e.target.value); }, placeholder: '描述待办事项...', style: { width:'100%', minHeight:'80px', padding:'10px 12px', border:'1px solid #ddd', borderRadius:'8px', fontSize:'14px', lineHeight:1.5, resize:'vertical', boxSizing:'border-box', fontFamily:'inherit' }, autoFocus: true }),
                  h('div', { style: { marginTop:'12px', fontSize:'13px', color:'#555', display:'flex', alignItems:'center', gap:'10px' } },
                    h('span', {}, '截止日期：'),
                    h('input', { type:'date', value: taskDeadline, onChange: function(e) { setTaskDeadline(e.target.value); }, style: { padding:'6px 10px', border:'1px solid #ddd', borderRadius:'6px', fontSize:'13px', flex:1, cursor:'pointer' } }),
                  ),
                  h('div', { style: { display:'flex', gap:'10px', justifyContent:'flex-end', marginTop:'16px' } },
                    h('button', { className: 'reqsys-maid-btn', onClick: onClose }, '取消'),
                    h('button', { className: 'reqsys-maid-btn primary', onClick: submitTask, disabled: localLoading || !taskInput.trim() }, localLoading ? '处理中...' : '添加'),
                  ),
                ),
          ),
        ),
      );
    }

    // ========================================================================
    // ========================================================================
    // 需求/任务列表视图 —— 从 dah-pet-ringo_P/client.js 原样移植（功能 100% 一致）
    // ========================================================================
		// ============================================================================
		var PAGE_SIZE = 15;

		function ReqsysListView(props) {
			var reqList = props.reqList;
			var setReqList = props.setReqList;
			var reqFilterTags = props.reqFilterTags;
			var setReqFilterTags = props.setReqFilterTags;
			var reqFilterProgs = props.reqFilterProgs;
			var setReqFilterProgs = props.setReqFilterProgs;
			var reqFilterSearch = props.reqFilterSearch;
			var setReqFilterSearch = props.setReqFilterSearch;
			var onClose = props.onClose;
			var currentPage = 0;
			var setPage = useState(0);
			currentPage = setPage[0];
			var setPageFn = setPage[1];
			var showRules = useState(false);
			var showRulesVal = showRules[0];
			var setShowRules = showRules[1];
			var rulesData = useState([]);
			var rules = rulesData[0];
			var setRules = rulesData[1];
			var reqFilterVersion = useState([]);
			var reqFilterVersionVal = reqFilterVersion[0];
			var setReqFilterVersion = reqFilterVersion[1];
			var reqShowArchived = useState(false);
			var reqShowArchivedVal = reqShowArchived[0];
			var setReqShowArchived = reqShowArchived[1];
			var versionOpen = useState(false);
			var versionOpenVal = versionOpen[0];
			var setVersionOpen = versionOpen[1];
			var tagOpen = useState(false);
			var tagOpenVal = tagOpen[0];
			var setTagOpen = tagOpen[1];
			var progOpen = useState(false);
			var progOpenVal = progOpen[0];
			var setProgOpen = progOpen[1];
			var batchCmdState = useState('');
			var batchCmd = batchCmdState[0];
			var setBatchCmd = batchCmdState[1];
			var batchConfirmState = useState(null);
			var batchConfirm = batchConfirmState[0];
			var setBatchConfirm = batchConfirmState[1];
			var reqSelectedIdsState = useState([]);
			var reqSelectedIds = reqSelectedIdsState[0];
			var setReqSelectedIds = reqSelectedIdsState[1];

			// 解析自然语言批量指令
			function parseBatchCmd(cmd) {
				var result = { action: 'CHANGE_STATUS', version: '', tag: '', filterStatus: '', targetStatus: '', desc: cmd };
				// 检测动作类型
				if (cmd.indexOf('放在') !== -1) {
					result.action = 'SET_VERSION';
				} else if (cmd.trim().indexOf('归档') === 0) {
					result.action = 'ARCHIVE';
				}
				// 提取版本号（通用）
				var vMatch = cmd.match(/v?\d+(?:\.\d+)?/);
				if (vMatch) result.version = vMatch[0];
				// 提取标签：XX标签 / 标签为XX / XX相关需求
				var tagMatch = cmd.match(/(\S{2,6})标签/);
				if (!tagMatch) tagMatch = cmd.match(/(?:标签[为:：]?\s*)(\S+)/);
				if (!tagMatch) tagMatch = cmd.match(/(\S{2,6})(?:相关需求)/);
				if (tagMatch) {
					var t = tagMatch[1].trim();
					var nonTags = ['版本', '已发布', '方案设计', '废弃', '未处理', '批量', '批量的', '放在', '归档', '进展'];
					if (nonTags.indexOf(t) === -1) result.tag = t;
				}
				if (result.action === 'SET_VERSION') {
					// 从"放在XX版本"提取目标版本
					var fv = cmd.match(/放在\s*(v?\d+(?:\.\d+)?)\s*(?:版本)?/);
					if (fv) result.targetVersion = fv[1];
					result.desc = '设版本: ' + (result.tag ? '标签[' + result.tag + '] ' : '') + '→ 版本' + (result.targetVersion || result.version);
				} else if (result.action === 'ARCHIVE') {
					result.filterStatus = '';
					result.desc = '归档: 版本' + result.version + ' 的需求';
				} else {
					// CHANGE_STATUS
					// 提取目标状态：进展改为XX / 改为XX / 直接扫描
					var tsMatch = cmd.match(/进展改为\s*(\S+)/);
					if (!tsMatch) tsMatch = cmd.match(/改为\s*(\S+)/);
					var statuses = ['已发布', '方案设计', '废弃', '未处理'];
					if (tsMatch) {
						var st = tsMatch[1];
						// 匹配完整状态名
						for (var si = 0; si < statuses.length; si++) {
							if (st.indexOf(statuses[si]) !== -1 || statuses[si].indexOf(st) !== -1) {
								result.targetStatus = statuses[si]; break;
							}
						}
						if (!result.targetStatus) result.targetStatus = st;
					} else {
						for (var si = 0; si < statuses.length; si++) {
							if (cmd.indexOf(statuses[si]) !== -1) { result.targetStatus = statuses[si]; break; }
						}
					}
					// 提取筛选状态：XX状态 或 "改为"前的状态
					var fsMatch = cmd.match(/(\S{2,4})状态/);
					if (fsMatch) {
						var fs = fsMatch[1];
						for (var si = 0; si < statuses.length; si++) {
							if (fs.indexOf(statuses[si]) !== -1 || statuses[si].indexOf(fs) !== -1) {
								result.filterStatus = statuses[si]; break;
							}
						}
					}
					if (!result.filterStatus) {
						// 找"改为"或"的需求"前面的状态
						var splitIdx = -1;
						var gaiIdx = cmd.indexOf('改为');
						if (gaiIdx !== -1) splitIdx = gaiIdx;
						var xuqIdx = cmd.indexOf('的需求');
						if (xuqIdx !== -1 && (splitIdx === -1 || xuqIdx < splitIdx)) splitIdx = xuqIdx;
						if (splitIdx !== -1) {
							var before = cmd.substring(0, splitIdx);
							for (var si = 0; si < statuses.length; si++) {
								if (before.indexOf(statuses[si]) !== -1) { result.filterStatus = statuses[si]; break; }
							}
						}
					}
					// 推断筛选条件（兼容旧格式）
					if (!result.filterStatus) {
						if (result.targetStatus === '方案设计') result.filterStatus = '未处理';
						else if (result.targetStatus) result.filterStatus = '方案设计';
					}
					result.desc = '改进展: ' + (result.version ? '版本' + result.version + ' ' : '') + (result.tag ? '标签[' + result.tag + '] ' : '') + (result.filterStatus ? '当前"' + result.filterStatus + '"' : '') + ' → "' + result.targetStatus + '"';
				}
				return result;
			}

			function doBatchCmd() {
				var cmd = batchCmd.trim();
				if (!cmd) return;
				var parsed = parseBatchCmd(cmd);
				// 筛选匹配项（按动作类型）
				var matches = [];
				if (parsed.action === 'SET_VERSION') {
					if (!parsed.tag) { alert('设置版本需要指定标签，如 "OA标签的需求，放在v5.3版本"'); return; }
					if (!parsed.targetVersion && !parsed.version) { alert('未识别到目标版本号'); return; }
					var targetV = parsed.targetVersion || parsed.version;
					matches = reqList.filter(function(r) {
						if (r.archived) return false;
						var hasTag = (r.tags || []).indexOf(parsed.tag) !== -1;
						if (!hasTag) return false;
						return true;
					});
					parsed.targetVersion = targetV;
					if (matches.length === 0) { alert('未找到标签为"' + parsed.tag + '"的需求'); return; }
				} else if (parsed.action === 'ARCHIVE') {
					if (!parsed.version) { alert('归档需要指定版本号，如 "归档v5.3版本的需求"'); return; }
					matches = reqList.filter(function(r) {
						if (r.archived) return false;
						if (r.version !== parsed.version) return false;
						return true;
					});
					if (matches.length === 0) { alert('未找到版本' + parsed.version + '的未归档需求'); return; }
				} else {
					// CHANGE_STATUS
					if (!parsed.targetStatus) { alert('未识别到目标状态，如 "进展改为已发布"'); return; }
					matches = reqList.filter(function(r) {
						if (r.archived) return false;
						if (parsed.version && r.version !== parsed.version) return false;
						if (parsed.tag) {
							var hasTag = (r.tags || []).indexOf(parsed.tag) !== -1;
							if (!hasTag) return false;
						}
						if (parsed.filterStatus && r.progress !== parsed.filterStatus) return false;
						return true;
					});
					if (matches.length === 0) {
						alert('未找到匹配的需求' + (parsed.version ? '\n版本: ' + parsed.version : '') + (parsed.tag ? '  标签: ' + parsed.tag : '') + (parsed.filterStatus ? '\n当前进展: ' + parsed.filterStatus : ''));
						return;
					}
				}
				// 打开确认弹框
				setBatchConfirm({ parsed: parsed, matches: matches, selected: matches.map(function(m) { return m.id; }) });
			}

			function doBatchExecute(selectedIds) {
				var matches = batchConfirm.matches.filter(function(m) { return selectedIds.indexOf(m.id) !== -1; });
				if (matches.length === 0) { setBatchConfirm(null); return; }
				var bp = batchConfirm.parsed;
				var done = 0;
				matches.forEach(function(r) {
					var body = {};
					if (bp.action === 'SET_VERSION') {
						body = { version: bp.targetVersion || bp.version };
					} else if (bp.action === 'ARCHIVE') {
						body = { archived: true };
					} else {
						body = { polished: r.polished || r.original, tags: r.tags || [], progress: bp.targetStatus, version: r.version, reason: r.reason || '' };
					}
					reqFetch('/requirements/' + r.id, { method: 'PUT', body: JSON.stringify(body) }).then(function() {
						done++;
						if (done === matches.length) {
							reqFetch('/requirements').then(function(data) { setReqList(data || []); setBatchCmd(''); setBatchConfirm(null); }).catch(function(e) { alert('刷新失败: ' + e.message); });
						}
					}).catch(function(e) { alert('更新失败: ' + e.message); });
				});
			}

			var currentTabItems = reqList.filter(function(r) { return reqShowArchivedVal ? r.archived : !r.archived; });
			var allTags = [];
			var allProgs = ['未处理', '方案设计', '已发布', '废弃'];
			currentTabItems.forEach(function(r) {
				(r.tags || []).forEach(function(t) {
					if (allTags.indexOf(t) === -1) allTags.push(t);
				});
			});
			var allVersions = [];
			currentTabItems.forEach(function(r) {
				var v = (r.version || '').trim();
				if (v && allVersions.indexOf(v) === -1) allVersions.push(v);
			});
			allVersions.sort();

			var filtered = reqList.filter(function(r) {
				if (reqShowArchivedVal ? !r.archived : r.archived) return false;
				if (reqFilterTags.length > 0) {
					var hasTag = false;
					reqFilterTags.forEach(function(t) { if ((r.tags || []).indexOf(t) !== -1) hasTag = true; });
					if (!hasTag) return false;
				}
				if (reqFilterProgs.length > 0) {
					if (reqFilterProgs.indexOf(r.progress || '未处理') === -1) return false;
				}
				if (reqFilterSearch.trim()) {
					var s = reqFilterSearch.trim().toLowerCase();
					var desc = (r.polished || r.original || '').toLowerCase();
					if (desc.indexOf(s) === -1) return false;
				}
				if (reqFilterVersionVal.length > 0) {
					var rv = r.version || '';
					if (reqFilterVersionVal.indexOf(rv) === -1) return false;
				}
				return true;
			});

			useEffect(function() {
				setPageFn(0);
			}, [reqFilterTags, reqFilterProgs, reqFilterSearch, reqFilterVersionVal]);

			var totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
			var pageStart = currentPage * PAGE_SIZE;
			var pageItems = filtered.slice().reverse().slice(pageStart, pageStart + PAGE_SIZE);

			function updateReq(id, progress, version, reason) {
				return reqFetch('/requirements/' + id, { method: 'PUT', body: JSON.stringify({ progress: progress, version: version, reason: reason }) }).then(function() {
					setReqList(function(list) {
						return list.map(function(r) {
							if (r.id !== id) return r;
							var updated = Object.assign({}, r, { progress: progress });
							if (version !== undefined) updated.version = version;
							if (reason !== undefined) updated.reason = reason;
							return updated;
						});
					});
				}).catch(function(e) { alert('更新失败: ' + e.message); });
			}

			function updateReqPolished(id, polished) {
				return reqFetch('/requirements/' + id, { method: 'PUT', body: JSON.stringify({ polished: polished }) }).then(function() {
					setReqList(function(list) {
						return list.map(function(r) {
							if (r.id !== id) return r;
							return Object.assign({}, r, { polished: polished });
						});
					});
				}).catch(function(e) { alert('更新失败: ' + e.message); });
			}

			// 标签规则管理弹窗
			if (showRulesVal) {
				return h('div', { style: { position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }, onClick: function(e) { if (e.target === e.currentTarget) setShowRules(false); }, children: h('div', { className: 'reqsys-card-wrap', style: { width: '500px', maxWidth: '92vw' }, children: [
					h('div', { className: 'reqsys-card', style: { maxHeight: '80vh', overflowY: 'auto' }, children: [
						h('h2', { style: { margin: '0 0 12px 0', fontSize: '18px', fontWeight: 600 }, children: '⚙ 自动标签规则' }),
						h('p', { style: { fontSize: '12px', color: '#888', marginBottom: '12px' }, children: '设置关键词与标签的映射规则，提交需求时自动匹配。' }),
						rules.map(function(rule, idx) {
							return h('div', { key: idx, style: { border: '1px solid #eee', borderRadius: '8px', padding: '10px', marginBottom: '8px' }, children: [
								h('div', { style: { display: 'flex', gap: '8px', marginBottom: '6px', alignItems: 'center' }, children: [
									h('input', { type: 'text', value: rule.tag, placeholder: '标签名', onChange: function(e) { var newRules = rules.map(function(r, i) { if (i !== idx) return r; return Object.assign({}, r, { tag: e.target.value }); }); setRules(newRules); }, style: { flex: 1, padding: '4px 8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px' } }),
									h('button', { style: { padding: '4px 10px', border: '1px solid #e55', borderRadius: '6px', background: '#fff', color: '#e55', fontSize: '12px', cursor: 'pointer' }, onClick: function() { var newRules = rules.filter(function(_, i) { return i !== idx; }); setRules(newRules); }, children: '删除' }),
								]}),
								h('input', { type: 'text', value: (rule.keywords || []).join(', '), placeholder: '关键词，用逗号分隔', onChange: function(e) { var newKeywords = e.target.value.split(',').map(function(s) { return s.trim(); }).filter(Boolean); var newRules = rules.map(function(r, i) { if (i !== idx) return r; return Object.assign({}, r, { keywords: newKeywords }); }); setRules(newRules); }, style: { width: '100%', padding: '4px 8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' } }),
							]});
						}),
						h('button', { style: { padding: '6px 14px', border: '1px dashed #aaa', borderRadius: '6px', background: '#fafafa', color: '#666', fontSize: '12px', cursor: 'pointer', width: '100%', marginBottom: '12px' }, onClick: function() { setRules(rules.concat([{ tag: '', keywords: [''] }])); }, children: '+ 添加规则' }),
						h('div', { style: { display: 'flex', gap: '10px', justifyContent: 'flex-end' }, children: [
							h('button', { className: 'reqsys-maid-btn', onClick: function() { setShowRules(false); }, children: '取消' }),
							h('button', { className: 'reqsys-maid-btn primary', onClick: function() { reqFetch('/rules', { method: 'PUT', body: JSON.stringify(rules) }).then(function() { setShowRules(false); alert('规则已保存'); }).catch(function(e) { alert('保存失败: ' + e.message); }); }, children: '保存' }),
						]}),
					]})]}) });
			}

			// 批量确认弹框
			if (batchConfirm) {
				var bp = batchConfirm.parsed;
				var bm = batchConfirm.matches;
				var bs = batchConfirm.selected;
				return h('div', { style: { position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }, onClick: function(e) { if (e.target === e.currentTarget) setBatchConfirm(null); }, children: h('div', { className: 'reqsys-card-wrap', style: { width: '800px', maxWidth: '92vw' }, children: [
					h('div', { className: 'reqsys-card', style: { maxHeight: '80vh', overflowY: 'auto' }, children: [
						h('h3', { style: { margin: '0 0 8px 0', fontSize: '16px', fontWeight: 600 }, children: '批量执行确认' }),
						h('div', { style: { fontSize: '13px', color: '#555', marginBottom: '12px', padding: '8px 12px', background: '#f8f6ff', borderRadius: '6px' }, children: [
							h('div', { children: '指令: ' + bp.desc }),
							
						]}),
						h('div', { style: { fontSize: '12px', color: '#888', marginBottom: '8px' }, children: '取消勾选以排除（共 ' + bm.length + ' 条匹配）' }),
						bm.map(function(m, mi) {
							var checked = bs.indexOf(m.id) !== -1;
							return h('div', { key: m.id, style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', background: checked ? '#fff' : '#f5f5f5', borderRadius: '6px', marginBottom: '4px', border: '1px solid ' + (checked ? '#e8e0f0' : '#eee') }, children: [
								h('input', { type: 'checkbox', checked: checked, onChange: function() { var idx = bs.indexOf(m.id); if (idx === -1) { setBatchConfirm(Object.assign({}, batchConfirm, { selected: bs.concat([m.id]) })); } else { var ns = bs.slice(); ns.splice(idx, 1); setBatchConfirm(Object.assign({}, batchConfirm, { selected: ns })); } }, style: { cursor: 'pointer', margin: 0 } }),
								h('span', { style: { flex: 1, fontSize: '13px', color: checked ? '#333' : '#999', textDecoration: checked ? 'none' : 'line-through' }, children: (m.polished || m.original || '') + ' (v' + m.version + ')' }),
							]});
						}),
						h('div', { style: { display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '12px' }, children: [
							h('button', { className: 'reqsys-maid-btn', onClick: function() { setBatchConfirm(null); }, children: '取消' }),
							h('button', { className: 'reqsys-maid-btn primary', onClick: function() { doBatchExecute(bs); }, disabled: bs.length === 0, children: '执行 (' + bs.length + ' 条)' }),
						]}),
					]})]}) });
			}

			return h('div', { className: 'reqsys-card-wrap', style: { width: '1100px', maxWidth: '95vw' }, children: [
				h('div', { className: 'reqsys-card', style: { height: '70vh', overflowY: 'auto' }, children: [
				h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }, children: [
					h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' }, children: [
						h('h2', { style: { margin: 0, fontSize: '20px', fontWeight: 600 }, children: '📋 行迹' }),
						h('span', { style: { padding: '4px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', background: !reqShowArchivedVal ? '#8e6bb0' : '#f0f2f5', color: !reqShowArchivedVal ? '#fff' : '#555' }, onClick: function() { setReqShowArchived(false); setReqSelectedIds([]); }, children: '活动中' }),
						h('span', { style: { padding: '4px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', background: reqShowArchivedVal ? '#8e6bb0' : '#f0f2f5', color: reqShowArchivedVal ? '#fff' : '#555' }, onClick: function() { setReqShowArchived(true); setReqSelectedIds([]); }, children: '已归档' }),
					]}),
					h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' }, children: [
						h('button', { className: 'reqsys-maid-btn', style: { background: '#25a55e', color: '#fff', border: 'none' }, onClick: function() { var BOM = '\uFEFF'; var header = '记录时间,需求描述,标签,当前进展,版本,废弃原因' + (reqShowArchivedVal ? ',归档时间' : '') + '\n'; var rows = filtered.map(function(r) { var desc = (r.polished || r.original || '').replace(/"/g, '""'); var tags = (r.tags || []).join('; '); return fmtTime(r.timestamp) + ',"' + desc + '",' + tags + ',' + (r.progress || '未处理') + ',' + (r.version || '') + ',' + (r.reason || '') + (reqShowArchivedVal ? ',' + (r.archivedAt ? fmtTime(r.archivedAt) : '') : ''); }).join('\n'); var blob = new Blob([BOM + header + rows], { type: 'text/csv;charset=utf-8' }); var url = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = url; a.download = '行迹_' + new Date().toISOString().slice(0,10) + '.csv'; document.body.appendChild(a); a.click(); setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100); }, children: '📥 导出 CSV' }),
						h('button', { className: 'reqsys-maid-btn', onClick: function() { var blob = new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' }); var url = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = url; a.download = '行迹_' + new Date().toISOString().slice(0,10) + '.json'; document.body.appendChild(a); a.click(); setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100); }, children: '📥 导出 JSON' }),
						h('button', { className: 'reqsys-maid-btn', style: { background: '#8e6bb0', color: '#fff', border: 'none' }, onClick: function() { reqFetch('/rules').then(function(r) { setRules(r || []); setShowRules(true); }).catch(function(e) { alert('加载规则失败: ' + e.message); }); }, children: '⚙ 配置标签' }),
					]}),
				]}),
				h('div', { className: 'reqsys-filter-bar', children: [
					h('div', { className: 'filter-group', children: [
						h('span', { className: 'filter-label', children: '标签' }),
						h('div', { style: { position: 'relative' }, children: [
							h('button', { className: 'reqsys-maid-btn', style: { padding: '4px 12px', fontSize: '12px', minWidth: '120px', textAlign: 'left' }, onClick: function() { setTagOpen(!tagOpenVal); }, children: '标签 ' + (reqFilterTags.length > 0 ? '(' + reqFilterTags.length + ')' : '') + (tagOpenVal ? ' ▲' : ' ▼') }),
							tagOpenVal ? h('div', { style: { position: 'fixed', inset: 0, zIndex: 9 }, onClick: function() { setTagOpen(false); } }) : null,
							tagOpenVal ? h('div', { style: { position: 'absolute', top: '100%', left: 0, zIndex: 10, background: '#fff', border: '1px solid #ddd', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,.15)', padding: '6px', minWidth: '160px', maxHeight: '200px', overflowY: 'auto' }, children: allTags.map(function(t) {
								var active = reqFilterTags.indexOf(t) !== -1;
								return h('div', { key: t, style: { padding: '4px 8px', cursor: 'pointer', borderRadius: '4px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', background: active ? '#e8f0fe' : 'transparent' }, onClick: function() { var idx = reqFilterTags.indexOf(t); if (idx === -1) { setReqFilterTags(reqFilterTags.concat([t])); } else { var newTags = reqFilterTags.slice(); newTags.splice(idx, 1); setReqFilterTags(newTags); } }, children: [
									h('input', { type: 'checkbox', checked: active, style: { margin: 0, cursor: 'pointer' }, onChange: function() {} }),
									h('span', { children: t }),
								]});
							}) }) : null,
						]}),
					]}),
					h('div', { className: 'filter-group', children: [
						h('span', { className: 'filter-label', children: '进展' }),
						h('div', { style: { position: 'relative' }, children: [
							h('button', { className: 'reqsys-maid-btn', style: { padding: '4px 12px', fontSize: '12px', minWidth: '120px', textAlign: 'left' }, onClick: function() { setProgOpen(!progOpenVal); }, children: '进展 ' + (reqFilterProgs.length > 0 ? '(' + reqFilterProgs.length + ')' : '') + (progOpenVal ? ' ▲' : ' ▼') }),
							progOpenVal ? h('div', { style: { position: 'fixed', inset: 0, zIndex: 9 }, onClick: function() { setProgOpen(false); } }) : null,
							progOpenVal ? h('div', { style: { position: 'absolute', top: '100%', left: 0, zIndex: 10, background: '#fff', border: '1px solid #ddd', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,.15)', padding: '6px', minWidth: '160px' }, children: allProgs.map(function(p) {
								var active = reqFilterProgs.indexOf(p) !== -1;
								return h('div', { key: p, style: { padding: '4px 8px', cursor: 'pointer', borderRadius: '4px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', background: active ? '#e8f0fe' : 'transparent' }, onClick: function() { var idx = reqFilterProgs.indexOf(p); if (idx === -1) { setReqFilterProgs(reqFilterProgs.concat([p])); } else { var newProgs = reqFilterProgs.slice(); newProgs.splice(idx, 1); setReqFilterProgs(newProgs); } }, children: [
									h('input', { type: 'checkbox', checked: active, style: { margin: 0, cursor: 'pointer' }, onChange: function() {} }),
									h('span', { children: p }),
								]});
							}) }) : null,
						]}),
					]}),
					h('div', { className: 'filter-group', children: [
						h('span', { className: 'filter-label', children: '版本' }),
						h('div', { style: { position: 'relative' }, children: [
							h('button', { className: 'reqsys-maid-btn', style: { padding: '4px 12px', fontSize: '12px', minWidth: '120px', textAlign: 'left' }, onClick: function() { setVersionOpen(!versionOpenVal); }, children: '版本 ' + (reqFilterVersionVal.length > 0 ? '(' + reqFilterVersionVal.length + ')' : '') + (versionOpenVal ? ' ▲' : ' ▼') }),
							versionOpenVal ? h('div', { style: { position: 'fixed', inset: 0, zIndex: 9 }, onClick: function() { setVersionOpen(false); } }) : null,
							versionOpenVal ? h('div', { style: { position: 'absolute', top: '100%', left: 0, zIndex: 10, background: '#fff', border: '1px solid #ddd', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,.15)', padding: '6px', minWidth: '160px', maxHeight: '200px', overflowY: 'auto' }, children: allVersions.map(function(v) {
								var active = reqFilterVersionVal.indexOf(v) !== -1;
								return h('div', { key: v, style: { padding: '4px 8px', cursor: 'pointer', borderRadius: '4px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', background: active ? '#e8f0fe' : 'transparent' }, onClick: function() { var idx = reqFilterVersionVal.indexOf(v); if (idx === -1) { setReqFilterVersion(reqFilterVersionVal.concat([v])); } else { var nv = reqFilterVersionVal.slice(); nv.splice(idx, 1); setReqFilterVersion(nv); } }, children: [
									h('input', { type: 'checkbox', checked: active, style: { margin: 0, cursor: 'pointer' }, onChange: function() {} }),
									h('span', { children: v }),
								]});
							}) }) : null,
						]}),
					]}),
					h('div', { className: 'filter-group', children: [
						h('span', { className: 'filter-label', children: '搜索' }),
						h('input', { type: 'text', value: reqFilterSearch, onChange: function(e) { setReqFilterSearch(e.target.value); }, placeholder: '搜索需求描述...', style: { padding: '4px 8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', width: '300px', boxSizing: 'border-box' } }),
					]}),
					h('span', { className: 'filter-count', children: '共 ' + filtered.length + ' 条' }),
					h('button', { className: 'reqsys-maid-btn', style: { padding: '4px 10px', fontSize: '11px', background: reqSelectedIds.length > 0 ? '#8e6bb0' : '#ccc', color: '#fff', border: 'none', alignSelf: 'flex-end' }, onClick: function() { if (reqSelectedIds.length === 0) return; var isArchiving = !reqShowArchivedVal; var label = isArchiving ? '归档' : '重启'; if (!confirm('确认' + label + '选中的 ' + reqSelectedIds.length + ' 条需求？')) return; var done = 0; reqSelectedIds.forEach(function(id) { var body = isArchiving ? { archived: true } : { archived: false, progress: '未处理' }; reqFetch('/requirements/' + id, { method: 'PUT', body: JSON.stringify(body) }).then(function() { done++; if (done === reqSelectedIds.length) { reqFetch('/requirements').then(function(data) { setReqList(data || []); setReqSelectedIds([]); }).catch(function(e) { alert('刷新失败: ' + e.message); }); } }).catch(function(e) { alert(label + '失败: ' + e.message); }); }); }, children: (reqShowArchivedVal ? '🔄 重启选中' : '📦 归档选中') + ' (' + reqSelectedIds.length + ')' }),
					h('button', { className: 'reqsys-maid-btn', style: { padding: '4px 10px', fontSize: '11px', color: '#888', border: '1px solid #ddd', background: '#fff', alignSelf: 'flex-end' }, onClick: function() { setReqFilterTags([]); setReqFilterProgs([]); setReqFilterSearch(''); setReqFilterVersion([]); setBatchCmd(''); setReqSelectedIds([]); }, children: '重置' }),
				]}),
				// 批量指令栏
				h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px', padding: '8px 12px', background: '#f8f6ff', borderRadius: '8px', border: '1px solid #e8e0f0' }, children: [
					h('input', { type: 'text', value: batchCmd, onChange: function(e) { setBatchCmd(e.target.value); }, onKeyDown: function(e) { if (e.key === 'Enter') { e.preventDefault(); doBatchCmd(); } }, placeholder: '指令：设版本 / 归档 / 改进展，如 "OA标签的需求，放在v5.3"', style: { flex: 1, padding: '6px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' } }),
					h('button', { className: 'reqsys-maid-btn', style: { background: '#8e6bb0', color: '#fff', border: 'none', padding: '6px 14px', fontSize: '13px' }, onClick: function() { doBatchCmd(); }, children: '批量执行' }),
				]}),
				filtered.length === 0
					? h('div', { style: { textAlign: 'center', padding: '40px 20px', color: '#999' }, children: '暂无匹配的需求记录' })
					: h('div', { style: { overflowX: 'auto' }, children: h('table', { className: 'reqsys-table', children: [
						h('thead', { children: h('tr', { children: [
							h('th', { style: { width: '30px', textAlign: 'center' }, children: '#' }),
							h('th', { style: { width: '28px', textAlign: 'center', verticalAlign: 'middle' }, children: h('input', { type: 'checkbox', checked: filtered.length > 0 && reqSelectedIds.length === filtered.length, onChange: function() { if (reqSelectedIds.length === filtered.length) { setReqSelectedIds([]); } else { setReqSelectedIds(filtered.map(function(r) { return r.id; })); } }, style: { cursor: 'pointer', margin: 0, verticalAlign: 'middle' } }) }),
							h('th', { style: { width: '100px' }, children: '记录时间' }),
							h('th', { children: '需求描述' }),
							h('th', { style: { width: '120px' }, children: '标签' }),
							h('th', { style: { width: '90px' }, children: '当前进展' }),
							h('th', { style: { width: '70px' }, children: '版本' }),
							h('th', { style: { width: '70px' }, children: '废弃原因' }),
							reqShowArchivedVal ? h('th', { style: { width: '90px' }, children: '归档时间' }) : null,
							h('th', { style: { width: '50px' }, children: '操作' }),
						]}) }),
						h('tbody', { children: pageItems.map(function(r, i) {
							var readOnly = reqShowArchivedVal;
							var roUpdateReq = readOnly ? function() {} : updateReq;
							return h('tr', { key: r.id, children: [
								h('td', { style: { padding: '8px 6px', borderBottom: '1px solid #f0f0f0', color: '#999', fontSize: '11px', textAlign: 'center' }, children: pageStart + i + 1 }),
								h('td', { style: { padding: '8px 10px', borderBottom: '1px solid #f0f0f0', textAlign: 'center', verticalAlign: 'middle' }, children: h('input', { type: 'checkbox', checked: reqSelectedIds.indexOf(r.id) !== -1, onChange: function() { var idx = reqSelectedIds.indexOf(r.id); if (idx === -1) { setReqSelectedIds(reqSelectedIds.concat([r.id])); } else { var ns = reqSelectedIds.slice(); ns.splice(idx, 1); setReqSelectedIds(ns); } }, style: { cursor: 'pointer', margin: 0, verticalAlign: 'middle' } }) }),
								h('td', { style: { padding: '8px 10px', borderBottom: '1px solid #f0f0f0', fontSize: '11px', color: '#888', whiteSpace: 'nowrap' }, children: fmtTime(r.timestamp) }),
								h('td', { style: { padding: '8px 10px', borderBottom: '1px solid #f0f0f0', fontSize: '13px', whiteSpace: 'normal', wordBreak: 'break-word', cursor: readOnly ? 'default' : 'pointer' }, onClick: readOnly ? null : function() { showEditDialog('编辑需求描述', r.polished || r.original || '', true).then(function(newDesc) { if (newDesc === null) return; updateReqPolished(r.id, newDesc.trim()); }); }, children: r.polished || r.original || '' }),
								h('td', { style: { padding: '8px 10px', borderBottom: '1px solid #f0f0f0' }, children: (r.tags || []).map(function(t) {
									return h('span', { key: t, style: { display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 500, background: '#e8f0fe', color: '#1a5cc8', margin: '1px 2px' }, children: t });
								}) }),
								ReqsysSelectCell(r, roUpdateReq),
								ReqsysVersionCell(r, roUpdateReq),
								ReqsysReasonCell(r, roUpdateReq),
								reqShowArchivedVal ? h('td', { style: { padding: '8px 10px', borderBottom: '1px solid #f0f0f0', fontSize: '11px', color: '#999', whiteSpace: 'nowrap' }, children: r.archivedAt ? fmtTime(r.archivedAt) : '' }) : null,
								h('td', { style: { padding: '8px 10px', borderBottom: '1px solid #f0f0f0', textAlign: 'center', whiteSpace: 'nowrap' }, children: readOnly ? [
									h('span', { style: { cursor: 'pointer', color: '#25a55e', fontSize: '16px', lineHeight: 1, marginRight: '12px' }, onClick: function() { reqFetch('/requirements/' + r.id, { method: 'PUT', body: JSON.stringify({ archived: false, progress: '未处理' }) }).then(function() { setReqList(function(list) { return list.map(function(item) { if (item.id !== r.id) return item; return Object.assign({}, item, { archived: false, progress: '未处理' }); }); }); }).catch(function(e) { alert('failed: ' + e.message); }); }, children: '🔄' }),
									h('span', { style: { cursor: 'pointer', color: '#e55', fontSize: '16px', lineHeight: 1 }, onClick: function() { if (confirm('delete this item?')) { reqFetch('/requirements/' + r.id, { method: 'DELETE' }).then(function() { setReqList(function(list) { return list.filter(function(item) { return item.id !== r.id; }); }); }).catch(function(e) { alert('delete failed: ' + e.message); }); } }, children: 'x' }),
							] : [
									h('span', { style: { cursor: 'pointer', color: '#8e6bb0', fontSize: '13px', lineHeight: 1, marginRight: '12px' }, onClick: function() { reqFetch('/requirements/' + r.id, { method: 'PUT', body: JSON.stringify({ archived: !r.archived }) }).then(function() { setReqList(function(list) { return list.map(function(item) { if (item.id !== r.id) return item; return Object.assign({}, item, { archived: !r.archived }); }); }); }).catch(function(e) { alert('failed: ' + e.message); }); }, children: r.archived ? '📤' : '📦' }),
									h('span', { style: { cursor: 'pointer', color: '#e55', fontSize: '16px', lineHeight: 1 }, onClick: function() { if (confirm('delete this item?')) { reqFetch('/requirements/' + r.id, { method: 'DELETE' }).then(function() { setReqList(function(list) { return list.filter(function(item) { return item.id !== r.id; }); }); }).catch(function(e) { alert('delete failed: ' + e.message); }); } }, children: 'x' }),
							] }),
							]});
						}) }),
					]}) }),
				filtered.length > PAGE_SIZE ? h('div', { style: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', padding: '12px 0 4px', fontSize: '13px', color: '#555' }, children: [
					h('button', { className: 'reqsys-maid-btn', style: { padding: '4px 12px', fontSize: '12px' }, onClick: function() { setPageFn(Math.max(0, currentPage - 1)); }, disabled: currentPage === 0, children: '‹ 上一页' }),
					h('span', { style: { fontSize: '12px', color: '#888' }, children: (currentPage + 1) + ' / ' + totalPages + ' 页' }),
					h('button', { className: 'reqsys-maid-btn', style: { padding: '4px 12px', fontSize: '12px' }, onClick: function() { setPageFn(Math.min(totalPages - 1, currentPage + 1)); }, disabled: currentPage >= totalPages - 1, children: '下一页 ›' }),
				]}) : null,
			]})]});
			}

		function ReqsysSelectCell(r, updateReq) {
			if (r.archived) return h('td', { style: { padding: '8px 10px', borderBottom: '1px solid #f0f0f0' }, children: h('span', { style: { fontSize: '12px', color: '#666' }, children: r.progress || '未处理' }) });
			return h('td', { style: { padding: '8px 10px', borderBottom: '1px solid #f0f0f0' }, children: h('select', { value: r.progress || '未处理', onChange: function(e) { var newVal = e.target.value; var curVersion = r.version || ''; var curReason = r.reason || ''; if (newVal === '方案设计' || newVal === '已发布') { if (curVersion) { updateReq(r.id, newVal, curVersion, curReason); } else { showEditDialog('输入版本号', curVersion, false).then(function(v) { if (v === null) { e.target.value = r.progress || '未处理'; return; } updateReq(r.id, newVal, v || '', curReason); }); } } else if (newVal === '废弃') { if (curReason) { updateReq(r.id, newVal, curVersion, curReason); } else { showEditDialog('输入废弃原因', curReason, true).then(function(reason) { if (reason === null) { e.target.value = r.progress || '未处理'; return; } updateReq(r.id, newVal, curVersion, reason || ''); }); } } else { updateReq(r.id, newVal, curVersion, curReason); } }, style: { padding: '4px 8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }, children: [h('option', { value: '未处理', children: '未处理' }), h('option', { value: '方案设计', children: '方案设计' }), h('option', { value: '已发布', children: '已发布' }), h('option', { value: '废弃', children: '废弃' })] })});
		}

		function ReqsysVersionCell(r, updateReq) {
			var v = r.version || '';
			if (r.archived) return h('td', { style: { padding: '8px 10px', borderBottom: '1px solid #f0f0f0' }, children: h('span', { style: { fontSize: '12px', color: '#666' }, children: v || '-' }) });
			if (!v) return h('td', { style: { padding: '8px 10px', borderBottom: '1px solid #f0f0f0', fontSize: '12px', color: '#ccc', cursor: 'pointer' }, onClick: function() { showEditDialog('输入版本号', '', false).then(function(nv) { if (nv !== null) updateReq(r.id, r.progress || '未处理', nv, r.reason || ''); }); }, children: '点击添加' });
			var cls = r.progress === '已发布' ? 'released' : 'design';
			return h('td', { style: { padding: '8px 10px', borderBottom: '1px solid #f0f0f0' }, children: h('span', { className: 'reqsys-version-tag ' + cls, onClick: function() { showEditDialog('修改版本号', v, false).then(function(nv) { if (nv !== null) updateReq(r.id, r.progress || '未处理', nv, r.reason || ''); }); }, children: v }) });
		}

		function ReqsysReasonCell(r, updateReq) {
			var reason = r.reason || '';
			if (r.archived) return h('td', { style: { padding: '8px 10px', borderBottom: '1px solid #f0f0f0' }, children: h('span', { style: { fontSize: '12px', color: '#666' }, children: reason || '-' }) });
			if (!reason) return h('td', { style: { padding: '8px 10px', borderBottom: '1px solid #f0f0f0', fontSize: '12px', color: '#ccc', cursor: 'pointer' }, onClick: function() { showEditDialog('输入废弃原因', '', true).then(function(nr) { if (nr !== null) updateReq(r.id, r.progress || '未处理', r.version || '', nr); }); }, children: '点击填写' });
			return h('td', { style: { padding: '8px 10px', borderBottom: '1px solid #f0f0f0' }, children: h('span', { className: 'reqsys-reason-text', onClick: function() { showEditDialog('修改废弃原因', reason, true).then(function(nr) { if (nr !== null) updateReq(r.id, r.progress || '未处理', r.version || '', nr); }); }, children: reason }) });
		}

		// ============================================================================
		// 未竟任务列表组件
		// ============================================================================
		function TaskListView(props) {
			var taskList = props.taskList;
			var setTaskList = props.setTaskList;
			var onClose = props.onClose;

			var taskFilterStatus = useState([]);
			var taskFilterStatusVal = taskFilterStatus[0];
			var setTaskFilterStatus = taskFilterStatus[1];
			var taskFilterSearch = useState('');
			var taskFilterSearchVal = taskFilterSearch[0];
			var setTaskFilterSearch = taskFilterSearch[1];
			var taskPage = useState(0);
			var taskPageVal = taskPage[0];
			var setTaskPage = taskPage[1];
			var TASK_PAGE_SIZE = 15;
			var taskShowArchived = useState(false);
			var taskShowArchivedVal = taskShowArchived[0];
			var setTaskShowArchived = taskShowArchived[1];
			var taskSelectedIdsState = useState([]);
			var taskSelectedIds = taskSelectedIdsState[0];
			var setTaskSelectedIds = taskSelectedIdsState[1];

			var allStatuses = ['未开始', '进行中', '已完成'];

			var filtered = taskList.filter(function(t) {
				if (taskShowArchivedVal ? !t.archived : t.archived) return false;
				if (taskFilterStatusVal.length > 0 && taskFilterStatusVal.indexOf(t.status || '未开始') === -1) return false;
				if (taskFilterSearchVal.trim()) {
					var s = taskFilterSearchVal.trim().toLowerCase();
					var desc = (t.description || '').toLowerCase();
					if (desc.indexOf(s) === -1) return false;
				}
				return true;
			});

			var totalPages = Math.max(1, Math.ceil(filtered.length / TASK_PAGE_SIZE));
			var safePage = Math.min(taskPageVal, totalPages - 1);
			var pageStart = safePage * TASK_PAGE_SIZE;
			var pageItems = filtered.slice(pageStart, pageStart + TASK_PAGE_SIZE);

			useEffect(function() { setTaskPage(0); }, [taskFilterStatusVal, taskFilterSearchVal]);

			function updateTask(id, updates) {
				return reqFetch('/tasks/' + id, { method: 'PUT', body: JSON.stringify(updates) }).then(function() {
					setTaskList(function(list) {
						return list.map(function(t) {
							if (t.id !== id) return t;
							return Object.assign({}, t, updates);
						});
					});
				}).catch(function(e) { alert('update failed: ' + e.message); });
			}

			function deleteTask(id) {
				if (confirm('delete this item?')) {
					reqFetch('/tasks/' + id, { method: 'DELETE' }).then(function() {
						setTaskList(function(list) { return list.filter(function(t) { return t.id !== id; }); });
					}).catch(function(e) { alert('delete failed: ' + e.message); });
				}
			}

			return h('div', { className: 'reqsys-card-wrap', style: { width: '960px', maxWidth: '95vw' }, children: [
				h('div', { className: 'reqsys-card', style: { height: '70vh', overflowY: 'auto' }, children: [
				h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }, children: [
					h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' }, children: [
						h('h2', { style: { margin: 0, fontSize: '20px', fontWeight: 600 }, children: '📋 未竟' }),
						h('span', { style: { padding: '4px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', background: !taskShowArchivedVal ? '#8e6bb0' : '#f0f2f5', color: !taskShowArchivedVal ? '#fff' : '#555' }, onClick: function() { setTaskShowArchived(false); setTaskSelectedIds([]); }, children: '活动中' }),
						h('span', { style: { padding: '4px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', background: taskShowArchivedVal ? '#8e6bb0' : '#f0f2f5', color: taskShowArchivedVal ? '#fff' : '#555' }, onClick: function() { setTaskShowArchived(true); setTaskSelectedIds([]); }, children: '已归档' }),
					]}),
					h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' }, children: [
						h('button', { className: 'reqsys-maid-btn', style: { background: '#25a55e', color: '#fff', border: 'none' }, onClick: function() { var BOM = '\uFEFF'; var header = '待办描述,记录时间,截止日期,完成情况' + (taskShowArchivedVal ? ',归档时间' : '') + '\n'; var rows = filtered.map(function(t) { var desc = (t.description || '').replace(/"/g, '""'); return '"' + desc + '",' + fmtTime(t.timestamp) + ',' + (t.deadline || '') + ',' + (t.status || '未开始') + (taskShowArchivedVal ? ',' + (t.archivedAt ? fmtTime(t.archivedAt) : '') : ''); }).join('\n'); var blob = new Blob([BOM + header + rows], { type: 'text/csv;charset=utf-8' }); var url = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = url; a.download = '未竟_' + new Date().toISOString().slice(0,10) + '.csv'; document.body.appendChild(a); a.click(); setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100); }, children: '📥 导出 CSV' }),
						h('button', { className: 'reqsys-maid-btn', onClick: function() { var blob = new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' }); var url = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = url; a.download = '未竟_' + new Date().toISOString().slice(0,10) + '.json'; document.body.appendChild(a); a.click(); setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100); }, children: '📥 导出 JSON' }),
					]}),
				]}),
				h('div', { className: 'reqsys-filter-bar', children: [
					h('div', { className: 'filter-group', children: [
						h('span', { className: 'filter-label', children: '完成情况' }),
						h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px' }, children: allStatuses.map(function(s) {
							var active = taskFilterStatusVal.indexOf(s) !== -1;
							return h('span', { key: s, style: { display: 'inline-block', padding: '2px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 500, cursor: 'pointer', background: active ? '#8e6bb0' : '#f0f2f5', color: active ? '#fff' : '#555', border: active ? '1px solid #8e6bb0' : '1px solid #ddd' }, onClick: function() { var idx = taskFilterStatusVal.indexOf(s); if (idx === -1) { setTaskFilterStatus(taskFilterStatusVal.concat([s])); } else { var ns = taskFilterStatusVal.slice(); ns.splice(idx, 1); setTaskFilterStatus(ns); } }, children: s + (active ? ' x' : '') });
						}) }),
					]}),
					h('div', { className: 'filter-group', children: [
						h('span', { className: 'filter-label', children: '搜索' }),
						h('input', { type: 'text', value: taskFilterSearchVal, onChange: function(e) { setTaskFilterSearch(e.target.value); }, placeholder: '搜索待办描述...', style: { padding: '4px 8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', width: '300px', boxSizing: 'border-box' } }),
					]}),
					h('span', { className: 'filter-count', children: '共 ' + filtered.length + ' 条' }),
					h('button', { className: 'reqsys-maid-btn', style: { padding: '4px 10px', fontSize: '11px', background: taskSelectedIds.length > 0 ? '#8e6bb0' : '#ccc', color: '#fff', border: 'none', alignSelf: 'flex-end' }, onClick: function() { if (taskSelectedIds.length === 0) return; var isArchiving = !taskShowArchivedVal; var label = isArchiving ? '归档' : '重启'; if (!confirm('确认' + label + '选中的 ' + taskSelectedIds.length + ' 条？')) return; var done = 0; taskSelectedIds.forEach(function(id) { var body = isArchiving ? { archived: true } : { archived: false, status: '未开始' }; reqFetch('/tasks/' + id, { method: 'PUT', body: JSON.stringify(body) }).then(function() { done++; if (done === taskSelectedIds.length) { reqFetch('/tasks').then(function(data) { setTaskList(data || []); setTaskSelectedIds([]); }).catch(function(e) { alert('刷新失败: ' + e.message); }); } }).catch(function(e) { alert(label + '失败: ' + e.message); }); }); }, children: (taskShowArchivedVal ? '🔄 重启选中' : '📦 归档选中') + ' (' + taskSelectedIds.length + ')' }),
					h('button', { className: 'reqsys-maid-btn', style: { padding: '4px 10px', fontSize: '11px', color: '#888', border: '1px solid #ddd', background: '#fff', alignSelf: 'flex-end' }, onClick: function() { setTaskFilterStatus([]); setTaskFilterSearch(''); setTaskSelectedIds([]); }, children: '重置' }),
				]}),
				filtered.length === 0
					? h('div', { style: { textAlign: 'center', padding: '40px 20px', color: '#999' }, children: '暂无匹配的未竟之事' })
					: h('div', { style: { overflowX: 'auto' }, children: h('table', { className: 'reqsys-table', children: [
						h('thead', { children: h('tr', { children: [
							h('th', { style: { width: '30px', textAlign: 'center' }, children: '#' }),
							h('th', { style: { width: '28px', textAlign: 'center', verticalAlign: 'middle' }, children: h('input', { type: 'checkbox', checked: filtered.length > 0 && taskSelectedIds.length === filtered.length, onChange: function() { if (taskSelectedIds.length === filtered.length) { setTaskSelectedIds([]); } else { setTaskSelectedIds(filtered.map(function(t) { return t.id; })); } }, style: { cursor: 'pointer', margin: 0, verticalAlign: 'middle' } }) }),
							h('th', { children: '待办描述' }),
							h('th', { style: { width: '90px' }, children: '记录时间' }),
							h('th', { style: { width: '100px' }, children: '截止日期' }),
							h('th', { style: { width: '80px' }, children: '完成情况' }),
							taskShowArchivedVal ? h('th', { style: { width: '90px' }, children: '归档时间' }) : null,
							h('th', { style: { width: '50px' }, children: '操作' }),
						]}) }),
						h('tbody', { children: pageItems.map(function(t, i) {
							var readOnly = taskShowArchivedVal;
							return h('tr', { key: t.id, children: [
								h('td', { style: { padding: '8px 6px', borderBottom: '1px solid #f0f0f0', color: '#999', fontSize: '11px', textAlign: 'center' }, children: pageStart + i + 1 }),
								h('td', { style: { padding: '8px 10px', borderBottom: '1px solid #f0f0f0', textAlign: 'center', verticalAlign: 'middle' }, children: h('input', { type: 'checkbox', checked: taskSelectedIds.indexOf(t.id) !== -1, onChange: function() { var idx = taskSelectedIds.indexOf(t.id); if (idx === -1) { setTaskSelectedIds(taskSelectedIds.concat([t.id])); } else { var ns = taskSelectedIds.slice(); ns.splice(idx, 1); setTaskSelectedIds(ns); } }, style: { cursor: 'pointer', margin: 0, verticalAlign: 'middle' } }) }),
								h('td', { style: { padding: '8px 10px', borderBottom: '1px solid #f0f0f0', fontSize: '13px', whiteSpace: 'normal', wordBreak: 'break-word', cursor: readOnly ? 'default' : 'pointer' }, onClick: readOnly ? null : function() { showEditDialog('编辑待办描述', t.description, true).then(function(nd) { if (nd === null) return; updateTask(t.id, { description: nd.trim() }); }); }, children: t.description }),
								h('td', { style: { padding: '8px 10px', borderBottom: '1px solid #f0f0f0', fontSize: '11px', color: '#888', whiteSpace: 'nowrap' }, children: fmtTime(t.timestamp) }),
								h('td', { style: { padding: '8px 10px', borderBottom: '1px solid #f0f0f0', fontSize: '12px', whiteSpace: 'nowrap', cursor: readOnly ? 'default' : 'pointer', color: (function() { if (!t.deadline) return 'inherit'; var now = new Date(); var dl = new Date(t.deadline); var diff = (dl - now) / (1000 * 60 * 60 * 24); if (diff < 2 && t.status !== '已完成') return '#e55'; return 'inherit'; })() }, onClick: readOnly ? null : function(e) { var rect = e.currentTarget.getBoundingClientRect(); var inp = document.createElement('input'); inp.type = 'date'; inp.value = t.deadline || ''; inp.style.position = 'fixed'; inp.style.left = rect.left + 'px'; inp.style.top = rect.bottom + 'px'; inp.style.opacity = '0'; inp.style.pointerEvents = 'none'; inp.style.width = '1px'; inp.style.height = '1px'; document.body.appendChild(inp); inp.addEventListener('change', function() { var val = inp.value; document.body.removeChild(inp); if (val) updateTask(t.id, { deadline: val }); }); inp.addEventListener('blur', function() { if (document.body.contains(inp)) document.body.removeChild(inp); }); setTimeout(function() { inp.showPicker(); }, 10); }, children: t.deadline || '-' }),
								h('td', { style: { padding: '8px 10px', borderBottom: '1px solid #f0f0f0' }, children: readOnly ? h('span', { style: { fontSize: '12px', color: '#888' }, children: t.status || '未开始' }) : h('select', { value: t.status || '未开始', onChange: function(e) { updateTask(t.id, { status: e.target.value }); }, style: { padding: '4px 8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }, children: [
									h('option', { value: '未开始', children: '未开始' }),
									h('option', { value: '进行中', children: '进行中' }),
									h('option', { value: '已完成', children: '已完成' }),
								] }) }),
								taskShowArchivedVal ? h('td', { style: { padding: '8px 10px', borderBottom: '1px solid #f0f0f0', fontSize: '11px', color: '#999', whiteSpace: 'nowrap' }, children: t.archivedAt ? fmtTime(t.archivedAt) : '' }) : null,
								h('td', { style: { padding: '8px 10px', borderBottom: '1px solid #f0f0f0', textAlign: 'center', whiteSpace: 'nowrap' }, children: readOnly ? [
								h('span', { style: { cursor: 'pointer', color: '#25a55e', fontSize: '16px', lineHeight: 1, marginRight: '12px' }, onClick: function() { reqFetch('/tasks/' + t.id, { method: 'PUT', body: JSON.stringify({ archived: false, status: '未开始' }) }).then(function() { setTaskList(function(list) { return list.map(function(item) { if (item.id !== t.id) return item; return Object.assign({}, item, { archived: false, status: '未开始' }); }); }); }).catch(function(e) { alert('failed: ' + e.message); }); }, children: '🔄' }),
								h('span', { style: { cursor: 'pointer', color: '#e55', fontSize: '16px', lineHeight: 1 }, onClick: function() { deleteTask(t.id); }, children: 'x' }),
							] : [
								h('span', { style: { cursor: 'pointer', color: '#8e6bb0', fontSize: '13px', lineHeight: 1, marginRight: '12px' }, onClick: function() { reqFetch('/tasks/' + t.id, { method: 'PUT', body: JSON.stringify({ archived: !t.archived }) }).then(function() { setTaskList(function(list) { return list.map(function(item) { if (item.id !== t.id) return item; return Object.assign({}, item, { archived: !t.archived }); }); }); }).catch(function(e) { alert('failed: ' + e.message); }); }, children: t.archived ? '📤' : '📦' }),
								h('span', { style: { cursor: 'pointer', color: '#e55', fontSize: '16px', lineHeight: 1 }, onClick: function() { deleteTask(t.id); }, children: 'x' }),
							] }),
						] });
					}) }),
				] }) }),
				filtered.length > TASK_PAGE_SIZE ? h('div', { style: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', padding: '12px 0 4px', fontSize: '13px', color: '#555' }, children: [
					h('button', { className: 'reqsys-maid-btn', style: { padding: '4px 12px', fontSize: '12px' }, onClick: function() { setTaskPage(Math.max(0, taskPageVal - 1)); }, disabled: taskPageVal === 0, children: '< ' }),
					h('span', { style: { fontSize: '12px', color: '#888' }, children: (taskPageVal + 1) + ' / ' + totalPages }),
					h('button', { className: 'reqsys-maid-btn', style: { padding: '4px 12px', fontSize: '12px' }, onClick: function() { setTaskPage(Math.min(totalPages - 1, taskPageVal + 1)); }, disabled: taskPageVal >= totalPages - 1, children: ' >' }),
				]}) : null,
			]})]});
		}

    // 插件主体：通过 DSH 的 slot 系统挂载（与 dsh-pet 同一套机制）
    // ========================================================================
    const name = 'reqsys';
    const inject = ['slots'];

    function apply(ctx, config) {
      // 挂到 shell.overlay 槽位（和宠物同层，但在其之上）
      // order 更大 → 渲染在宠物之上，弹窗不会被宠物遮挡
      ctx.slots.inject('shell.overlay', function* () {
        yield ctx.slots.register({
          name: 'shell.overlay',
          id: 'reqsys',
          order: 2000,
        }, (ownerProps) => h(ReqsysApp, { config, ...ownerProps }));
      });
    }

    return { apply, inject, name };
  },
});