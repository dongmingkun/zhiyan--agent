/* app-09-chat.js —— 原 js/app.v3.19.js 第 4803–5335 行拆分（2026-09-11 模块化）。
 * 成员以 App.xxx 赋值形式挂载到全局 App 对象，加载顺序见 index.html。*/
App.openChat = function openChat(friendId, nickname, username, avatar) {
    this._chatMode = 'private';
    this._currentChatGroup = null;
    this._currentChatFriend = friendId;
    this._currentChatPeerName = nickname || '?';
    document.getElementById('friends-chat-empty').style.display = 'none';
    document.getElementById('friends-chat-window').style.display = '';
    document.getElementById('chat-window-avatar').textContent = avatar;
    document.getElementById('chat-window-name').textContent = nickname;
    document.getElementById('chat-window-username').textContent = '@' + username;
    // Highlight active friend (通过 data 属性匹配)
    document.querySelectorAll('.friend-list-item').forEach(el => el.classList.remove('active'));
    const target = document.querySelector(`.friend-list-item[data-friend-id="${friendId}"]`);
    if (target) {
      target.classList.add('active');
      // 立即清除红点，避免等待服务器返回
      const dot = target.querySelector('.unread-dot');
      const badge = target.querySelector('.friend-list-unread');
      if (dot) dot.remove();
      if (badge) badge.remove();
    }
    // Load messages + 启动高频消息轮询
    this._loadMessages();
    this._startChatPolling();
  };

App.closeChat = function closeChat() {
    this._currentChatFriend = null;
    this._currentChatGroup = null;
    this._chatMode = 'private';
    this._stopChatPolling();
    document.getElementById('friends-chat-empty').style.display = '';
    document.getElementById('friends-chat-window').style.display = 'none';
    document.querySelectorAll('.friend-list-item').forEach(el => el.classList.remove('active'));
    if (App.Social) App.Social.cancelReply();
  };

App._loadMessages = async function _loadMessages() {
    if (!this._currentChatFriend) return;
    try {
      const resp = await Auth.fetchWithAuth(`/api/messages/${this._currentChatFriend}`);
      if (!resp.ok) throw new Error('加载失败');
      const data = await resp.json();
      App.Social.renderChat(data.messages, {
        currentUserId: Auth.user.id,
        apiBase: (window.APP_CONFIG && window.APP_CONFIG.API_BASE) || '',
        myAvatar: Auth.user.avatar,
        peerName: this._currentChatPeerName || '?',
        replyMap: App.Social.msgCache
      });
      // Reload friend list to clear unread dots
      this._loadFriendsList();
      this._updateUnreadBadge();
    } catch (e) {
      document.getElementById('chat-window-messages').innerHTML = `<div class="friends-empty">加载消息失败: ${e.message}</div>`;
    }
  };

App._pollMessages = async function _pollMessages() {
    if (!this._currentChatFriend) return;
    try {
      const resp = await Auth.fetchWithAuth(`/api/messages/${this._currentChatFriend}`);
      if (!resp.ok) return;
      const data = await resp.json();
      const msgEl = document.getElementById('chat-window-messages');
      // 仅在消息数量或最后一条消息变化时更新，避免频繁重建 DOM
      const currentCount = msgEl.querySelectorAll('.chat-msg').length;
      const lastId = msgEl.querySelector('.chat-msg:last-child')?.dataset.msgId || '';
      const newLastId = data.messages.length ? data.messages[data.messages.length - 1].id : '';
      if (data.messages.length !== currentCount || lastId !== newLastId) {
        // 判断用户是否已在底部（新消息时自动滚到底）
        const atBottom = msgEl.scrollHeight - msgEl.scrollTop - msgEl.clientHeight < 60;
        this._loadMessages();
        if (atBottom) msgEl.scrollTop = msgEl.scrollHeight;
      }
    } catch { /* ignore */ }
  };

App.sendMessageToFriend = async function sendMessageToFriend() {
    if (App.Social) { await App.Social.sendCurrentChat(); return; }
    if (!Auth.isLoggedIn || !this._currentChatFriend) return;
    const input = document.getElementById('chat-message-input');
    const content = input.value.trim();
    if (!content) return;
    try {
      const resp = await Auth.fetchWithAuth('/api/messages', {
        method: 'POST',
        body: JSON.stringify({ to_user_id: this._currentChatFriend, content })
      });
      if (!resp.ok) {
        const e = await resp.json();
        throw new Error(e.detail || '发送失败');
      }
      input.value = '';
      this._loadMessages();
    } catch (e) {
      alert('发送失败: ' + e.message);
    }
  };

  // ============ 电子教材（v=20260904c 版权收敛：全文/截图已下线，仅保留引用条目） ============

App.textbook = {
    citation: '《线性代数》第六版 · 同济大学数学系 编 · 高等教育出版社 · ISBN 978-7-04-039661-4'
  };

  // v=20260904c 版权收敛：教材全文 PDF 与翻页截图已下线，仅保留规范引用条目，
  // 不再提供打开/翻页/下载教材功能。以下函数统一改为提示「仅列引用」。
App.openTextbook = function openTextbook(targetPage = 1) {
    this._shotToast('📚 教材仅列引用（《线性代数》第六版 · 同济大学数学系 编 · 高等教育出版社 · ISBN 978-7-04-039661-4），全文请向出版社获取。', 'info');
  };

App.closeTextbook = function closeTextbook() { /* 模态框已移除，无操作 */ };

App.jumpToTextbookChapter = function jumpToTextbookChapter(chapterId) {
    this.openTextbook();
  };

App.openTextbookForSection = function openTextbookForSection(sectionId) {
    this.openTextbook();
  };

App.textbookShowDownloadMenu = function textbookShowDownloadMenu(e) {
    if (e) e.stopPropagation();
    this._shotToast('📚 教材仅列引用，不提供全文下载。', 'info');
  };

App.textbookDownload = function textbookDownload(format) {
    this._shotToast('📚 教材仅列引用，不提供全文下载（PDF/分页截图均已下线）。', 'info');
  };

App.textbookDownloadCurrentPage = function textbookDownloadCurrentPage() {
    this._shotToast('📚 教材仅列引用，不提供分页下载。', 'info');
  };

  // ============ v=20260908h 自编学习笔记（版权合规的"可看可下载"替代） ============
  // 复用 KnowledgeBase 中 6 章 16 个知识点的自编内容（非同济版原文），
  // 以左右分栏阅读器展示，支持 LaTeX 渲染 + 导出本地 HTML/纯文本。
App.openStudyNotes = function openStudyNotes() {
    const kb = (typeof KnowledgeBase !== 'undefined') ? KnowledgeBase : null;
    if (!kb || !kb.chapters || !kb.chapters.length) {
      this._shotToast('学习笔记数据尚未加载，请稍后重试。', 'info');
      return;
    }
    const totalSections = kb.chapters.reduce((n, c) => n + (c.sections?.length || 0), 0);

    // ── 目录：搜索框 + 章节点（可折叠）+ 知识点（带激活指示条） ──
    let tocHtml = `
      <div class="snotes-toc-inner">
        <div class="snotes-toc-head">
          <div class="snotes-toc-title">📚 章节目录</div>
          <div class="snotes-toc-stats">${kb.chapters.length} 章 · ${totalSections} 知识点</div>
        </div>
        <div class="snotes-toc-search">
          <input type="search" id="snotes-search-input" placeholder="🔍 搜索知识点…" autocomplete="off" />
        </div>
        <div class="snotes-toc-list" id="snotes-toc-list">`;
    let bodyHtml = '';
    let allItems = []; // {ci, si, title, chapterTitle, node} 用于滚动联动
    kb.chapters.forEach((ch, ci) => {
      const sections = ch.sections || [];
      tocHtml += `<div class="snotes-toc-chapter" data-ci="${ci}">
        <button class="snotes-toc-chapter-title" data-ci="${ci}">
          <span class="snotes-toc-chap-icon">${this.escapeHtml(ch.icon || '📚')}</span>
          <span class="snotes-toc-chap-name">${this.escapeHtml(ch.title)}</span>
          <span class="snotes-toc-chap-arrow">▾</span>
        </button>
        <div class="snotes-toc-items">`;
      sections.forEach((sec, si) => {
        tocHtml += `<button class="snotes-toc-item" data-ci="${ci}" data-si="${si}">
          <span class="snotes-toc-item-dot"></span>
          <span class="snotes-toc-item-text">${this.escapeHtml(sec.title)}</span>
        </button>`;
        allItems.push({ ci, si, title: sec.title });
      });
      tocHtml += `</div></div>`;
    });
    tocHtml += `</div></div>`;

    // ── 章节正文：每章一个 banner，知识点一节一卡片 ──
    kb.chapters.forEach((ch, ci) => {
      const sections = ch.sections || [];
      bodyHtml += `<section class="snotes-chapter" data-ci="${ci}">
        <div class="snotes-chapter-banner">
          <div class="snotes-chapter-banner-icon">${this.escapeHtml(ch.icon || '📚')}</div>
          <div class="snotes-chapter-banner-text">
            <div class="snotes-chapter-banner-title">${this.escapeHtml(ch.title)}</div>
            <div class="snotes-chapter-banner-desc">${this.escapeHtml(ch.summary || '')}</div>
            <div class="snotes-chapter-banner-meta">第 ${ci + 1} 章 · ${sections.length} 个知识点</div>
          </div>
        </div>`;
      sections.forEach((sec, si) => {
        bodyHtml += `<article class="snotes-section" data-ci="${ci}" data-si="${si}" id="snotes-sec-${ci}-${si}">
          <div class="snotes-sec-head">
            <span class="snotes-sec-badge">${ci + 1}.${si + 1}</span>
            <h3 class="snotes-sec-title">${this.escapeHtml(sec.title)}</h3>
          </div>
          <p class="snotes-sec-summary">${this.escapeHtml(sec.summary || '')}</p>`;
        if (sec.content) {
          bodyHtml += `<div class="snotes-sec-body">${this.markdownToHtml(sec.content)}</div>`;
        }
        if (sec.formulas && sec.formulas.length) {
          bodyHtml += `<div class="snotes-sec-block snotes-block-formula">
            <div class="snotes-sec-label">📐 关键公式 <span class="snotes-sec-count">${sec.formulas.length} 条</span></div>
            <ul class="snotes-formula-list">${sec.formulas.map((f, i) => `<li><span class="snotes-formula-idx">${i + 1}</span><span class="snotes-formula-text">${this.escapeHtml(f)}</span></li>`).join('')}</ul>
          </div>`;
        }
        if (sec.examples && sec.examples.length) {
          bodyHtml += `<div class="snotes-sec-block snotes-block-example">
            <div class="snotes-sec-label">💡 典型例题 <span class="snotes-sec-count">${sec.examples.length} 题</span></div>
            ${sec.examples.map((ex, i) => `<div class="snotes-example">
              <div class="snotes-example-q"><strong>例 ${i + 1}：</strong>${this.escapeHtml(ex.q)}</div>
              <div class="snotes-example-a"><strong>解：</strong>${this.escapeHtml(ex.a)}</div>
            </div>`).join('')}
          </div>`;
        }
        if (sec.pitfalls && sec.pitfalls.length) {
          bodyHtml += `<div class="snotes-sec-block snotes-block-pitfall">
            <div class="snotes-sec-label">⚠️ 常见误区 <span class="snotes-sec-count">${sec.pitfalls.length} 项</span></div>
            <ul class="snotes-pitfall-list">${sec.pitfalls.map(p => `<li>${this.escapeHtml(p)}</li>`).join('')}</ul>
          </div>`;
        }
        bodyHtml += `</article>`;
      });
      bodyHtml += `</section>`;
    });

    const modal = document.createElement('div');
    modal.className = 'snotes-modal';
    modal.id = 'snotes-modal';
    modal.innerHTML = `
      <div class="snotes-header">
        <div class="snotes-header-left">
          <div class="snotes-header-title">📖 学习笔记</div>
          <div class="snotes-header-breadcrumb" id="snotes-breadcrumb">本知识体系自编摘要 · ${kb.chapters.length} 章 · ${totalSections} 个知识点</div>
        </div>
        <div class="snotes-header-actions">
          <button class="snotes-btn snotes-btn-toggle-toc" id="snotes-toggle-toc" title="显示/隐藏目录" aria-label="切换目录">☰</button>
          <button class="snotes-btn snotes-btn-copy" onclick="App._snotesCopyCurrent()" title="复制当前章节为 Markdown">📋 复制本章</button>
          <button class="snotes-btn snotes-btn-more" id="snotes-more-btn" title="更多导出选项" aria-label="更多">⬇ 导出 ▾</button>
          <div class="snotes-dropdown" id="snotes-dropdown">
            <button onclick="App.downloadStudyNotes('html')">📄 导出 HTML（带样式）</button>
            <button onclick="App.downloadStudyNotes('md')">📝 导出 Markdown</button>
            <button onclick="App.downloadStudyNotes('txt')">📃 导出纯文本</button>
            <button onclick="App._snotesPrint()">🖨 打印 / 导出 PDF</button>
          </div>
          <button class="snotes-btn snotes-btn-close" onclick="App.closeStudyNotes()" aria-label="关闭" title="关闭">×</button>
        </div>
      </div>
      <div class="snotes-progress"><div class="snotes-progress-bar" id="snotes-progress-bar"></div></div>
      <div class="snotes-layout">
        <aside class="snotes-toc" id="snotes-toc">${tocHtml}</aside>
        <main class="snotes-content" id="snotes-content">${bodyHtml}</main>
      </div>`;
    document.body.appendChild(modal);
    document.body.classList.add('snotes-open');

    // ── 章节/知识点跳转 ──
    const activeSection = (ci, si) => {
      modal.querySelectorAll('.snotes-toc-item').forEach(b => b.classList.toggle('active', b.dataset.ci == ci && b.dataset.si == si));
      const target = modal.querySelector(`.snotes-section[data-ci="${ci}"][data-si="${si}"]`);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      this._snotesCurrentCi = +ci; this._snotesCurrentSi = +si;
      this._snotesUpdateBreadcrumb();
    };

    modal.querySelectorAll('.snotes-toc-item').forEach(b => {
      b.addEventListener('click', () => activeSection(b.dataset.ci, b.dataset.si));
    });

    // 章节标题：点击折叠/展开子知识点
    modal.querySelectorAll('.snotes-toc-chapter-title').forEach(b => {
      b.addEventListener('click', () => {
        const chapter = b.closest('.snotes-toc-chapter');
        chapter.classList.toggle('collapsed');
        const arrow = b.querySelector('.snotes-toc-chap-arrow');
        if (arrow) arrow.textContent = chapter.classList.contains('collapsed') ? '▸' : '▾';
      });
    });

    // ── 搜索过滤 ──
    const searchInput = modal.querySelector('#snotes-search-input');
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      modal.querySelectorAll('.snotes-toc-chapter').forEach(ch => {
        const ci = ch.dataset.ci;
        const items = ch.querySelectorAll('.snotes-toc-item');
        let visible = 0;
        items.forEach(it => {
          const text = it.querySelector('.snotes-toc-item-text').textContent.toLowerCase();
          const match = !q || text.includes(q);
          it.style.display = match ? '' : 'none';
          if (match) visible++;
        });
        ch.style.display = visible > 0 ? '' : 'none';
        if (q) ch.classList.remove('collapsed'); // 搜索时强制展开
      });
    });

    // ── TOC 抽屉切换（移动端主要入口，桌面端辅助） ──
    modal.querySelector('#snotes-toggle-toc').addEventListener('click', () => {
      modal.classList.toggle('snotes-toc-visible');
    });
    // 内容区点击时自动收起抽屉（移动端体验）
    modal.querySelector('#snotes-content').addEventListener('click', (e) => {
      if (window.innerWidth <= 768 && modal.classList.contains('snotes-toc-visible')) {
        // 只在用户点击非链接时才收起
        if (!e.target.closest('a, button, .kb-step-scroll')) {
          modal.classList.remove('snotes-toc-visible');
        }
      }
    });

    // ── 导出下拉菜单 ──
    const moreBtn = modal.querySelector('#snotes-more-btn');
    const dropdown = modal.querySelector('#snotes-dropdown');
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('show');
    });
    modal.addEventListener('click', (e) => {
      if (!e.target.closest('#snotes-dropdown') && !e.target.closest('#snotes-more-btn')) {
        dropdown.classList.remove('show');
      }
    });

    // ── 滚动联动：高亮当前可见的知识点 + 更新进度条 + 面包屑 ──
    const content = modal.querySelector('#snotes-content');
    const progressBar = modal.querySelector('#snotes-progress-bar');
    this._snotesCurrentCi = 0; this._snotesCurrentSi = 0;
    const updateScroll = () => {
      // 进度条
      const max = content.scrollHeight - content.clientHeight;
      const pct = max > 0 ? (content.scrollTop / max) * 100 : 0;
      progressBar.style.width = pct + '%';
      // 当前可见知识点
      const sections = Array.from(modal.querySelectorAll('.snotes-section'));
      const contentTop = content.getBoundingClientRect().top;
      let bestIdx = 0;
      let bestDist = Infinity;
      sections.forEach((sec, i) => {
        const top = sec.getBoundingClientRect().top - contentTop;
        if (top <= 80 && top > -Infinity) {
          const dist = Math.abs(top);
          if (dist < bestDist) { bestDist = dist; bestIdx = i; }
        }
      });
      const cur = sections[bestIdx];
      if (cur) {
        const ci = cur.dataset.ci, si = cur.dataset.si;
        if (this._snotesCurrentCi !== +ci || this._snotesCurrentSi !== +si) {
          this._snotesCurrentCi = +ci; this._snotesCurrentSi = +si;
          modal.querySelectorAll('.snotes-toc-item').forEach(b => b.classList.toggle('active', b.dataset.ci == ci && b.dataset.si == si));
          this._snotesUpdateBreadcrumb();
        }
      }
    };
    content.addEventListener('scroll', updateScroll, { passive: true });
    setTimeout(updateScroll, 100);

    // ── 键盘快捷键：↑↓ 切换知识点、Home/End 跳首末、Esc 关闭 ──
    const onKey = (e) => {
      if (e.key === 'Escape') {
        this.closeStudyNotes();
        document.removeEventListener('keydown', onKey);
        return;
      }
      // 避免在输入框中触发
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const idx = allItems.findIndex(it => it.ci == this._snotesCurrentCi && it.si == this._snotesCurrentSi);
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        const next = allItems[Math.min(idx + 1, allItems.length - 1)];
        if (next) activeSection(next.ci, next.si);
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        const prev = allItems[Math.max(idx - 1, 0)];
        if (prev) activeSection(prev.ci, prev.si);
      } else if (e.key === 'Home') {
        // v=20260926 空列表保护:allItems 为空时 allItems[0] 是 undefined,
        // 读 .ci 直接抛 TypeError(按 Home 键即报错)
        if (!allItems.length) return;
        e.preventDefault();
        activeSection(allItems[0].ci, allItems[0].si);
      } else if (e.key === 'End') {
        // v=20260926 同上:空列表时 allItems[length-1] 为 undefined
        if (!allItems.length) return;
        e.preventDefault();
        const last = allItems[allItems.length - 1];
        activeSection(last.ci, last.si);
      }
    };
    document.addEventListener('keydown', onKey);
    this._snotesKeyHandler = onKey;

    // ── 关闭逻辑 ──
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.closeStudyNotes();
    });
    this._snotesAllItems = allItems;

    // LaTeX 二次渲染
    requestAnimationFrame(() => this.renderLatexInElement(modal));
  };

  /** v=20260909m 更新顶部面包屑显示当前章节/知识点 */
App._snotesUpdateBreadcrumb = function _snotesUpdateBreadcrumb() {
    const modal = document.getElementById('snotes-modal');
    if (!modal) return;
    const crumb = modal.querySelector('#snotes-breadcrumb');
    if (!crumb) return;
    const kb = (typeof KnowledgeBase !== 'undefined') ? KnowledgeBase : null;
    if (!kb) return;
    const ch = kb.chapters[this._snotesCurrentCi];
    const sec = ch?.sections?.[this._snotesCurrentSi];
    if (ch && sec) {
      crumb.innerHTML = `${this.escapeHtml(ch.title)} <span class="snotes-crumb-sep">›</span> <strong>${this.escapeHtml(sec.title)}</strong>`;
    }
  };

  /** v=20260909m 复制当前章节为 Markdown */
App._snotesCopyCurrent = function _snotesCopyCurrent() {
    const kb = (typeof KnowledgeBase !== 'undefined') ? KnowledgeBase : null;
    if (!kb) return;
    const ci = this._snotesCurrentCi || 0;
    const si = this._snotesCurrentSi || 0;
    const ch = kb.chapters[ci];
    const sec = ch?.sections?.[si];
    if (!sec) { this._shotToast('当前无可复制章节', 'warn'); return; }
    let md = `# ${sec.title}\n\n`;
    if (sec.summary) md += `> ${sec.summary}\n\n`;
    if (sec.content) md += `${sec.content}\n\n`;
    if (sec.formulas?.length) md += `## 📐 关键公式\n${sec.formulas.map(f => `- ${f}`).join('\n')}\n\n`;
    if (sec.examples?.length) md += `## 💡 典型例题\n${sec.examples.map((ex, i) => `**例 ${i + 1}：**${ex.q}\n\n**解：**${ex.a}`).join('\n\n')}\n\n`;
    if (sec.pitfalls?.length) md += `## ⚠️ 常见误区\n${sec.pitfalls.map(p => `- ${p}`).join('\n')}\n`;
    md += `\n---\n*来自「秩研 Agent」自编学习笔记 · 参考同济《线性代数》第六版*`;
    // 使用 navigator.clipboard 或 fallback
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(md).then(
        () => this._shotToast('已复制到剪贴板', 'ok'),
        () => this._snotesCopyFallback(md)
      );
    } else {
      this._snotesCopyFallback(md);
    }
  };

  /** v=20260909m 复制降级（execCommand） */
App._snotesCopyFallback = function _snotesCopyFallback(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); this._shotToast('已复制到剪贴板', 'ok'); }
    catch (e) { this._shotToast('复制失败，请手动复制', 'warn'); }
    document.body.removeChild(ta);
  };

  /** v=20260909m 打印/导出 PDF（用浏览器原生打印） */
App._snotesPrint = function _snotesPrint() {
    const modal = document.getElementById('snotes-modal');
    if (!modal) return;
    document.body.classList.add('snotes-printing');
    setTimeout(() => {
      window.print();
      setTimeout(() => document.body.classList.remove('snotes-printing'), 200);
    }, 100);
  };

App.closeStudyNotes = function closeStudyNotes() {
    const modal = document.getElementById('snotes-modal');
    if (modal) modal.remove();
    document.body.classList.remove('snotes-open', 'snotes-printing');
    if (this._snotesKeyHandler) {
      document.removeEventListener('keydown', this._snotesKeyHandler);
      this._snotesKeyHandler = null;
    }
  };

App.downloadStudyNotes = function downloadStudyNotes(format = 'html') {
    const kb = (typeof KnowledgeBase !== 'undefined') ? KnowledgeBase : null;
    if (!kb || !kb.chapters || !kb.chapters.length) { this._shotToast('学习笔记数据尚未加载。', 'info'); return; }
    const citation = '本学习笔记为「秩研 Agent」自编内容摘要，参考同济大学《线性代数》第六版章节编排（ISBN 978-7-04-039661-4），非出版社原文。';
    // v=20260909m 时间戳文件名,避免重复下载冲突
    const ts = new Date().toISOString().slice(0, 10);
    if (format === 'txt') {
      let txt = '线性代数 · 学习笔记\n' + citation + '\n\n';
      kb.chapters.forEach(ch => {
        txt += `\n${'='.repeat(50)}\n${ch.title}\n${'='.repeat(50)}\n`;
        (ch.sections || []).forEach(sec => {
          txt += `\n### ${sec.title}\n${sec.summary || ''}\n`;
          if (sec.content) txt += `\n${sec.content}\n`;
          if (sec.formulas && sec.formulas.length) txt += `\n[关键公式]\n${sec.formulas.map(f => '· ' + f).join('\n')}\n`;
          if (sec.examples && sec.examples.length) txt += `\n[典型例题]\n${sec.examples.map((ex, i) => `例${i + 1}：${ex.q}\n解：${ex.a}`).join('\n')}\n`;
          if (sec.pitfalls && sec.pitfalls.length) txt += `\n[常见误区]\n${sec.pitfalls.map(p => '· ' + p).join('\n')}\n`;
        });
      });
      this._downloadBlob(txt, `线性代数学习笔记-${ts}.txt`, 'text/plain;charset=utf-8');
    } else if (format === 'md') {
      // v=20260909m Markdown 导出:保留 $...$ / $$...$$ 公式语法,纯文本友好
      let md = `# 线性代数 · 学习笔记\n\n> ${citation}\n`;
      kb.chapters.forEach(ch => {
        md += `\n## ${ch.title}\n`;
        (ch.sections || []).forEach(sec => {
          md += `\n### ${sec.title}\n`;
          if (sec.summary) md += `\n*${sec.summary}*\n`;
          if (sec.content) md += `\n${sec.content}\n`;
          if (sec.formulas?.length) md += `\n#### 📐 关键公式\n${sec.formulas.map(f => `- ${f}`).join('\n')}\n`;
          if (sec.examples?.length) md += `\n#### 💡 典型例题\n${sec.examples.map((ex, i) => `- **例 ${i + 1}：** ${ex.q}\n  - **解：** ${ex.a}`).join('\n')}\n`;
          if (sec.pitfalls?.length) md += `\n#### ⚠️ 常见误区\n${sec.pitfalls.map(p => `- ${p}`).join('\n')}\n`;
        });
      });
      md += `\n---\n*导出时间：${new Date().toLocaleString('zh-CN')} · 来自「秩研 Agent」*`;
      this._downloadBlob(md, `线性代数学习笔记-${ts}.md`, 'text/markdown;charset=utf-8');
    } else {
      // 自包含 HTML，内联基本样式，便于本地打开
      let body = '';
      kb.chapters.forEach(ch => {
        body += `<h1>${this.escapeHtml(ch.title)}</h1>`;
        (ch.sections || []).forEach(sec => {
          body += `<h2>${this.escapeHtml(sec.title)}</h2>`;
          if (sec.summary) body += `<p class="sum">${this.escapeHtml(sec.summary)}</p>`;
          if (sec.content) body += `<div class="body">${this.markdownToHtml(sec.content)}</div>`;
          if (sec.formulas && sec.formulas.length) body += `<h3>📐 关键公式</h3><ul>${sec.formulas.map(f => `<li>${this.escapeHtml(f)}</li>`).join('')}</ul>`;
          if (sec.examples && sec.examples.length) body += `<h3>💡 典型例题</h3>${sec.examples.map((ex, i) => `<p><strong>例${i + 1}：</strong>${this.escapeHtml(ex.q)}<br><strong>解：</strong>${this.escapeHtml(ex.a)}</p>`).join('')}`;
          if (sec.pitfalls && sec.pitfalls.length) body += `<h3>⚠️ 常见误区</h3><ul>${sec.pitfalls.map(p => `<li>${this.escapeHtml(p)}</li>`).join('')}</ul>`;
        });
      });
      const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>线性代数 · 学习笔记</title>
<style>body{font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;max-width:820px;margin:0 auto;padding:24px;line-height:1.7;color:#1f2937}h1{border-bottom:2px solid #4f46e5;padding-bottom:8px;color:#4f46e5}h2{margin-top:28px;color:#1e1b4b}h3{margin-top:20px;color:#4f46e5}.sum{color:#64748b;font-size:14px}.body{background:#f8fafc;padding:12px 16px;border-radius:8px}ul{padding-left:22px}code{background:#eef2ff;padding:1px 6px;border-radius:4px}</style></head><body>
<p style="color:#94a3b8;font-size:12px">${citation}</p>${body}
<p style="margin-top:32px;color:#94a3b8;font-size:12px;border-top:1px solid #e2e8f0;padding-top:12px">AI 生成内容 · 仅供参考 · 由「秩研 Agent」自编整理</p></body></html>`;
      this._downloadBlob(html, `线性代数学习笔记-${ts}.html`, 'text/html;charset=utf-8');
    }
  };

