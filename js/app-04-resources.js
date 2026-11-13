/* app-04-resources.js —— 原 js/app.v3.19.js 第 1959–2172 行拆分（2026-09-11 模块化）。
 * 成员以 App.xxx 赋值形式挂载到全局 App 对象，加载顺序见 index.html。*/
App._iconSvg = function _iconSvg(name, size) {
    const s = size || 20;
    const ICONS = {
      folder:     '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
      book:       '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
      file:       '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 13h6 M9 17h6"/></svg>',
      'file-pdf': '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6"/><path d="M9 14v4 M12 14v4 M9 14h2 M9 16h2 M15 14h2.5a1.5 1.5 0 0 1 0 3H15v1 M15 18v-1" stroke-width="1.3"/></svg>',
      lightbulb:  '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6 M10 22h4 M12 2a7 7 0 0 0-4 12.7c.5.4 1 1 1 1.6V18h6v-1.7c0-.7.5-1.3 1-1.6A7 7 0 0 0 12 2z"/></svg>',
    };
    return ICONS[name] || ICONS.file;
  };

  /** 渲染教学资源页：参考文献条目（仅列引用，不提供 PDF 直链 + 章节标签 + RAG 语料关联）v=20260904c */
App.renderResources = function renderResources() {
    const el = document.getElementById('resources-content');
    if (!el) return;
    const data = window.TeachingResources;
    if (!data || !data.groups || !data.groups.length) {
      el.innerHTML = '<div class="stu-error" style="text-align:center;padding:40px;">📁 教学资源暂未配置</div>';
      return;
    }
    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const subEl = document.getElementById('resources-subtitle');
    if (subEl) subEl.textContent = data.subtitle || '';

    el.innerHTML = `
      <div class="exam-papers-block" style="background:linear-gradient(135deg,#f5f3ff,#eef2ff);border:1px solid #e0e7ff;">
        <div class="exam-papers-head">
          <span class="exam-papers-head-icon">${this._iconSvg(data.icon || 'folder', 24)}</span>
          <div>
            <b>${esc(data.title || '教学资源')}</b>
            <small>${esc(data.subtitle || '')}</small>
          </div>
        </div>
        <div class="resources-groups">
          ${data.groups.map(g => `
            <div class="exam-papers-group" style="background:#fff;">
              <div class="exam-papers-group-name">${this._iconSvg(g.icon || 'file', 18)} <span>${esc(g.name)}</span></div>
              <div class="exam-papers-desc">${esc(g.desc || '')}</div>
              <div class="exam-papers-files">
                ${g.files.map(f => `
                  <div class="exam-papers-file" style="cursor:default;">
                    <span class="ep-file-icon">${this._iconSvg('file-pdf', 20)}</span>
                    <span class="ep-file-info">
                      <span class="ep-file-name">${esc(f.name)}</span>
                      <span class="ep-file-meta">${esc(f.author || '')}${f.journal ? ' · ' + esc(f.journal) : ''}${f.year ? ' · ' + esc(f.year) : ''}</span>
                      ${f.abstract ? `<span class="resources-abstract">${esc(f.abstract)}</span>` : ''}
                    </span>
                    <span class="resources-chips">
                      ${(f.tags || []).map(t => `<span class="resources-tag">${esc(t)}</span>`).join('')}
                      <span class="resources-tag chapter">${esc(f.chapter || '')}</span>
                    </span>
                    <span class="ep-file-open" style="opacity:.6;">引用</span>
                  </div>`).join('')}
              </div>
            </div>`).join('')}
        </div>
        <div class="resources-foot">
          ${this._iconSvg('lightbulb', 16)} 以上为规范参考文献条目，<b>仅列引用，不提供 PDF 全文公开下载</b>；全文可向作者或出版方获取。文献内容已提炼为 RAG 知识库语料（6 条），在「智能问答」中提问相关主题（如"量纲分析 π 定理"、"拉普拉斯矩阵"、"PIPA 教学法"）时会被自动检索引用。
        </div>
      </div>`;
  };

  // ============ 问答历史 ============

App.renderHistory = async function renderHistory(page) {
    const listEl = document.getElementById('history-list');
    const emptyEl = document.getElementById('history-empty');
    const pagiEl = document.getElementById('history-pagination');
    if (!Auth.isLoggedIn) {
      listEl.style.display = 'none';
      emptyEl.style.display = '';
      emptyEl.innerHTML = `<div style="text-align:center;padding:60px 20px;color:var(--text-tertiary);">
        <div style="font-size:48px;margin-bottom:16px;">🔑</div>
        <h2>请先登录</h2>
        <p>登录后可查看完整的问答历史会话</p>
        <button class="user-login-btn" style="margin-top:16px;font-size:14px;" onclick="window.WelcomeLogin ? WelcomeLogin.open('login') : App.showAuthModal({mode:'login'})">🔑 登录 / 注册</button>
      </div>`;
      pagiEl.innerHTML = '';
      return;
    }
    page = page || this._historyPage || 1;
    this._historyPage = page;
    listEl.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-tertiary);">加载中…</div>';
    listEl.style.display = '';
    emptyEl.style.display = 'none';
    try {
      const q = document.getElementById('history-search')?.value?.trim() || '';
      const params = new URLSearchParams({ page, page_size: 8 });
      if (q) params.set('q', q);
      const resp = await Auth.fetchWithAuth('/api/history?' + params.toString());
      if (!resp.ok) throw new Error('加载失败');
      const d = await resp.json();
      if (!d.sessions || d.sessions.length === 0) {
        listEl.style.display = 'none';
        emptyEl.style.display = '';
        emptyEl.innerHTML = `<div style="text-align:center;padding:60px 20px;color:var(--text-tertiary);">
          <div style="font-size:48px;margin-bottom:16px;">📋</div>
          <h2>暂无问答历史记录</h2>
          <p>登录后提问即可自动按会话保存历史</p>
        </div>`;
        pagiEl.innerHTML = '';
        return;
      }
      listEl.innerHTML = d.sessions.map(s => {
        const date = new Date(s.updated || s.created).toLocaleString('zh-CN');
        // v=20260824 过滤脏值
        // v=20260926 relate_knowledge 兼容字符串("a,b")与数组(["a","b"])两种后端结构:
        // 原写法 (v || '').split(...) 遇到数组会被 String() 拼成 "a,b" 再切分,
        // 元素含逗号/是对象时还会切出脏值(故下方保留 '[object Object]' 过滤)。
        const kpArr = Array.isArray(s.relate_knowledge)
          ? s.relate_knowledge
          : String(s.relate_knowledge == null ? '' : s.relate_knowledge).split(/[,，]/);
        const kps = kpArr.map(x => String(x == null ? '' : x).trim()).filter(x => x && x !== '[object Object]');
        const kpHtml = kps.slice(0, 5).map(k => `<span class="history-session-kp-tag">${this.escapeHtml(k)}</span>`).join('');
        // 清洗标题尾部多余的中英文标点（如 》 。 ？ ! ！ ,等），避免 "什么是施密特正交化》"
        const cleanTitle = (this._cleanTrailingPunct || (t => t)).call(this, s.title || '');
        // preview:走 markdownToHtml 渲染（含 $...$ LaTeX 公式），由下面 renderLatexInElement 二次渲染
        const previewHtml = s.preview ? this.markdownToHtml(s.preview, { wrapCard: false }) : '';
        return `<div class="history-session-item" onclick="App.openSessionDetail('${s.id}')">
          <button class="history-session-del" onclick="event.stopPropagation();App.deleteSession('${s.id}')" title="删除该会话">🗑</button>
          <div class="history-session-header">
            <div class="history-session-title">${this.escapeHtml(cleanTitle)}</div>
            <div class="history-session-meta">${date} · ${s.msg_count} 条消息</div>
          </div>
          ${previewHtml ? `<div class="history-session-preview">${previewHtml}</div>` : ''}
          ${kpHtml ? `<div class="history-session-kp">${kpHtml}</div>` : ''}
        </div>`;
      }).join('');
      // 渲染列表中所有 preview 里的 LaTeX 公式
      this.renderLatexInElement(listEl);
      this._renderHistoryPagination(d);
    } catch (e) {
      listEl.innerHTML = '<div style="text-align:center;padding:24px;color:var(--error);">⚠️ 加载失败：' + (e.message || e) + '</div>';
      pagiEl.innerHTML = '';
    }
  };

App._renderHistoryPagination = function _renderHistoryPagination(d) {
    const pagiEl = document.getElementById('history-pagination');
    if (!pagiEl) return;
    const total = d.total || 0, page = d.page || 1, pages = d.pages || 1;
    if (pages <= 1) { pagiEl.innerHTML = `<span style="font-size:12px;color:var(--text-tertiary);">共 ${total} 个会话</span>`; return; }
    let html = `<span style="font-size:12px;color:var(--text-tertiary);">共 ${total} 个会话 · 第 ${page}/${pages} 页</span>`;
    html += `<button class="admin-pager-btn" ${page <= 1 ? 'disabled' : ''} onclick="App.renderHistory(${page - 1})">‹ 上一页</button>`;
    const start = Math.max(1, page - 3), end = Math.min(pages, page + 3);
    for (let i = start; i <= end; i++) {
      html += `<button class="admin-pager-btn${i === page ? ' active' : ''}" onclick="App.renderHistory(${i})">${i}</button>`;
    }
    html += `<button class="admin-pager-btn" ${page >= pages ? 'disabled' : ''} onclick="App.renderHistory(${page + 1})">下一页 ›</button>`;
    pagiEl.innerHTML = html;
  };

App.historySearch = function historySearch() { this.renderHistory(1); };

  /** 打开会话详情页（路由切换到 view-session-detail） */
App.openSessionDetail = async function openSessionDetail(sid) {
    if (!Auth.isLoggedIn) return;
    const content = document.getElementById('session-detail-content');
    content.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-tertiary);">加载中…</div>';
    this.switchView('session-detail');
    try {
      const resp = await Auth.fetchWithAuth('/api/history/session/' + sid);
      if (!resp.ok) throw new Error('加载失败');
      const d = await resp.json();
      const s = d.session;
      const msgs = d.messages || [];
      // v=20260824 过滤脏值
      // v=20260926 同 loadHistory:relate_knowledge 可能是数组,不能直接当字符串切分
      const kpArr = Array.isArray(s.relate_knowledge)
        ? s.relate_knowledge
        : String(s.relate_knowledge == null ? '' : s.relate_knowledge).split(/[,，]/);
      const kps = kpArr.map(x => String(x == null ? '' : x).trim()).filter(x => x && x !== '[object Object]');
      const kpHtml = kps.map(k => `<span class="session-kp-tag">${this.escapeHtml(k)}</span>`).join(' ');
      const createdDate = new Date(s.created).toLocaleString('zh-CN');
      // 渲染每条消息：复用 chat 渲染管线（markdownToHtml + renderLatexInElement）
      const msgHtml = msgs.map(m => {
        const isUser = m.role === 'user';
        const isOcr = m.ocr_used;
        const alignStyle = isUser ? 'flex-direction:row-reverse;' : '';
        // 清洗消息内容尾部多余的中英文标点（展示侧）
              const cleanContent = (m.content || '').replace(/[\s\u3000。，；：、？！?!\.,;:…'"''""`~～\-—_+=|\\\/《》「」『』<>〈〉【】]{1,12}$/g, '');
              return `<div class="session-message-row" style="display:flex;gap:10px;${alignStyle}margin-bottom:14px;">
          <div style="display:flex;flex-direction:column;align-items:${isUser ? 'flex-end' : 'flex-start'};max-width:80%;">
            <div class="bot-bubble" style="display:inline-block;${isUser ? 'background:var(--primary);color:#fff;' : 'background:var(--surface-elevated);color:var(--text);'}padding:10px 14px;border-radius:10px;line-height:1.6;font-size:13.5px;border:1px solid var(--border-light);">
              ${isOcr ? '<div style="font-size:11px;color:' + (isUser ? 'rgba(255,255,255,0.7)' : 'var(--text-tertiary)') + ';margin-bottom:4px;">🖼 OCR 识别题目</div>' : ''}
              ${m.rag_used && !isUser ? '<span style="font-size:10px;background:#dcfce7;color:#166534;padding:1px 6px;border-radius:4px;margin-right:6px;">RAG</span>' : ''}
              <span class="message-content">${this.markdownToHtml(cleanContent)}</span>
              <div style="font-size:11px;color:${isUser ? 'rgba(255,255,255,0.7)' : 'var(--text-tertiary)'};margin-top:6px;">${new Date(m.created).toLocaleString('zh-CN')}</div>
            </div>
          </div>
        </div>`;
      }).join('');
      content.innerHTML = `
        <div style="max-width:880px;margin:0 auto;">
          <div class="session-detail-title">${this.escapeHtml(s.title)}</div>
          <div class="session-detail-meta">📅 ${createdDate} · ${msgs.length} 条消息${kpHtml ? ' · 关联：' + kpHtml : ''}</div>
          <div class="session-message-list">${msgHtml}</div>
        </div>`;
      // 渲染所有消息中的 LaTeX 公式
      this.renderLatexInElement(content);
    } catch (e) {
      content.innerHTML = '<div style="text-align:center;padding:40px;color:var(--error);">⚠️ 加载失败：' + (e.message || e) + '</div>';
    }
  };

  /** 删除会话（二次确认） */
App.deleteSession = async function deleteSession(sid) {
    if (!Auth.isLoggedIn) return;
    if (!confirm('确认删除该会话？会话内全部对话记录将一并清除，且不可恢复。')) return;
    try {
      const resp = await Auth.fetchWithAuth('/api/history/session/' + sid, { method: 'DELETE' });
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}));
        throw new Error(e.detail || '删除失败');
      }
      if (this._adminToast) this._adminToast('🗑️ 会话已删除', 'ok');
      this.renderHistory(this._historyPage || 1);
    } catch (e) {
      alert('删除失败：' + (e.message || e));
    }
  };

