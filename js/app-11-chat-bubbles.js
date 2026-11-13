/* app-11-chat-bubbles.js —— 原 js/app.v3.19.js 第 6072–6997 行拆分（2026-09-11 模块化）。
 * 成员以 App.xxx 赋值形式挂载到全局 App 对象，加载顺序见 index.html。*/
App._collapseChatBars = function _collapseChatBars() {
    if (!document.body.classList.contains('mobile-mode')) return;
    document.body.classList.add('chat-bar-collapsed');
    const t = document.getElementById('chat-bar-toggle');
    if (t) t.textContent = '▼';
  };
  // 展开底部两栏
App._expandChatBars = function _expandChatBars() {
    if (!document.body.classList.contains('mobile-mode')) return;
    document.body.classList.remove('chat-bar-collapsed');
    const t = document.getElementById('chat-bar-toggle');
    if (t) t.textContent = '▲';
  };
  // 初始化:scroll 监听 + focus/blur + 手动箭头按钮
App._initChatBarAutoCollapse = function _initChatBarAutoCollapse() {
    if (this._chatBarInit) return;
    this._chatBarInit = true;
    const body = document.body;
    const viewChat = document.getElementById('view-chat');

    // 手动箭头按钮(兜底):点击切换收起/展开
    const toggle = document.getElementById('chat-bar-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        if (body.classList.contains('chat-bar-collapsed')) this._expandChatBars();
        else this._collapseChatBars();
      });
    }

    // 输入框聚焦/点击 → 展开(保持显示);blur 不做收起(用户可能还在读消息)
    const input = document.getElementById('chat-input');
    if (input) {
      input.addEventListener('focus', () => this._expandChatBars());
      // 点击也恢复:即使焦点已在输入框(如发送后焦点未移走),用户再次点击也展开
      input.addEventListener('click', () => this._expandChatBars());
    }

    // scroll 监听:在移动端 #view-chat 才是滚动容器(.view-panel.active 可滚动)
    if (viewChat) {
      let lastY = viewChat.scrollTop;
      viewChat.addEventListener('scroll', () => {
        if (!body.classList.contains('mobile-mode')) return;
        const y = viewChat.scrollTop;
        const nearBottom = viewChat.scrollHeight - y - viewChat.clientHeight < 80;
        // 向上滚动超过阈值(20px)→收起;滚回底部→展开
        if (!nearBottom && y > lastY && y - lastY > 8) {
          this._collapseChatBars();
        } else if (nearBottom) {
          this._expandChatBars();
        }
        lastY = y;
      }, { passive: true });
    }
  };


  /**
   * v=20260890 分步讲解:对单个流式回答卡做后处理
   * - 扫描 h2/h3 大标题,加锚点 id + 复制链接图标
   * - 把"定义/关键公式/典型例题/常见误区"等大模块包成独立卡片,视觉区分
   * - 与用户问题强相关的模块作为主内容;其余归入"拓展阅读"折叠
   * - 元数据(RAG 来源/AI 标识/引擎徽标/兜底标签)移入"查看知识库来源信息"折叠面板
   * - PC 端:右侧生成悬浮迷你目录 + 滚动 spy 高亮当前模块
   * - 添加"回到回答顶部"按钮(长内容滚动后出现)
   */
App._enrichStreamBubble = function _enrichStreamBubble(bubbleEl, userText, sources) {
    if (!bubbleEl) return;
    const bubble = bubbleEl.querySelector('.bot-bubble');
    if (!bubble) return;
    // ── v=20260926 修复 bubbleKey 作用域:原来它只在"modules.length >= 3"的 if 块内
    // 用 const 声明,而函数末尾(第 331 行)在块外引用它 → 模块数 < 3 的短回答直接
    // ReferenceError,后处理整体中断(目录/操作栏/回到顶部按钮全部丢失)。
    // 提升到函数作用域顶部,只声明一次,块内直接复用。
    const bubbleKey = bubbleEl.getAttribute('data-bubble-id') || (bubbleEl.id = 'bubble-' + Date.now(), bubbleEl.id);
    // ── v=20260908 内容清洗层:在解析模块前先做脏文本清洗 ──
    this._sanitizeBubbleContent(bubble);
    // 1) 收集所有 h2/h3,给它们打 id + 锚点复制按钮
    const headings = Array.from(bubble.querySelectorAll('h2, h3'));
    if (headings.length === 0) return;  // 没有大标题的短回答不做处理
    headings.forEach((h, i) => {
      // 生成稳定 id:去掉原文本里的 emoji/特殊字符
      const text = (h.textContent || '').trim();
      const id = 'strmod-' + i + '-' + (text || '').replace(/[^\w\u4e00-\u9fa5]+/g, '-').slice(0, 32).replace(/^-|-$/g, '');
      h.id = id || ('strmod-' + i);
      // 添加锚点复制图标(放在标题末尾,不破坏原排版)
      const anchor = document.createElement('a');
      anchor.className = 'stream-anchor-link';
      anchor.href = '#' + h.id;
      anchor.title = '复制该模块链接';
      anchor.innerHTML = '🔗';
      anchor.addEventListener('click', (e) => {
        e.preventDefault();
        const url = location.origin + location.pathname + '#' + h.id;
        try { history.pushState(null, '', '#' + h.id); } catch (_) {}
        const t = h.getBoundingClientRect();
        const messages = document.getElementById('chat-messages');
        messages.scrollTo({ top: messages.scrollTop + t.top - 120, behavior: 'smooth' });
        if (navigator.clipboard) navigator.clipboard.writeText(url).catch(() => {});
        this._adminToast('🔗 已复制模块链接', 'ok');
      });
      h.appendChild(anchor);
    });

    // 2) 识别模块类型,把每个 h2/h3 后面到下一个 h2/h3 之前的内容包成卡片
    // 注意:markdownToHtml 输出会包一层 .knowledge-card,h2/h3 是其内部子代 → 递归查找
    const modules = [];   // { title, type, contentEls: [DOM], matched: bool }
    const allHeadings = Array.from(bubble.querySelectorAll('h2, h3'));
    // 先把元数据元素从 main 中剥离(后处理再添加)
    // v=20260922 拆分:尾部必保留项(ai-gen-tag / 流式降级标签) 与 模块化后注入项(其余元数据)
    const metaSelectors = '.rag-sources, .rag-engine-badge, .ai-gen-tag, .chat-fallback-tag, .chat-fallback-panel, .fbp-actions';
    const metaEls = Array.from(bubble.querySelectorAll(metaSelectors));
    metaEls.forEach(el => el.remove());

    if (allHeadings.length === 0) {
      // 没有任何大标题 → 不做卡片化,直接交给默认渲染
      return;
    }

    // 2.1 前言:h2/h3 之前的兄弟节点(段落/导语)
    const preContentEls = [];
    {
      // 找到第一个 heading,在它之前的所有 bubble 子代都是前言
      const firstH = allHeadings[0];
      let node = bubble.firstElementChild;
      while (node && node !== firstH) {
        // 排除掉包裹层(若整篇是单个 knowledge-card 包含 h2,把容器内除 h2 之外的内容作为前言)
        if (node.classList && (node.classList.contains('knowledge-card') || node.classList.contains('rag-sources') ||
            node.classList.contains('rag-engine-badge') || node.classList.contains('ai-gen-tag'))) {
          // knowledge-card 内部 h2 之前的元素作为前言
          let inner = node.firstElementChild;
          while (inner && inner.tagName && inner.tagName.toLowerCase() === 'p') {
            preContentEls.push(inner);
            inner = inner.nextElementSibling;
          }
        } else {
          preContentEls.push(node);
        }
        node = node.nextElementSibling;
      }
    }
    if (preContentEls.length) {
      // v=20260926 概览(导语)模块:skipCard = 只保留内容、不渲染模块卡片外壳,也不参与空模块剔除
      modules.push({ title: '概览', type: 'default', anchorEl: null, contentEls: preContentEls, skipCard: true });
    }

    // 2.2 主模块:每个 h2/h3 + 后续兄弟到下一个 heading
    for (let i = 0; i < allHeadings.length; i++) {
      const h = allHeadings[i];
      const nextH = allHeadings[i + 1] || null;
      const contentEls = [];
      // 找 h 之后到 nextH 之前的所有兄弟(递归跨嵌套容器)
      const collected = this._collectSiblingsUntil(bubble, h, nextH);
      const text = (h.textContent || '').replace(/🔗$/, '').trim();
      modules.push({ title: text, type: this._classifyModule(text), anchorEl: h, contentEls: collected });
    }

    // ── v=20260908 空模块过滤:任何"标题存在但内容为空"的模块直接剔除 ──
    // 判空标准: contentEls 经去空元素/清洗后没有任何有效文字/公式
    const nonempty = modules.filter(m => m.skipCard || this._moduleHasContent(m));
    if (nonempty.length !== modules.length) {
      // 把被剔除的模块对应的 anchorEl 也从 DOM 中移除,避免锚点残留
      modules.forEach(m => {
        if (!nonempty.includes(m) && m.anchorEl && m.anchorEl.parentNode) {
          m.anchorEl.parentNode.removeChild(m.anchorEl);
        }
      });
      modules.length = 0;
      modules.push(...nonempty);
      // 重新同步 allHeadings 引用(matched 计算和后续渲染依赖 anchorEl)
      // 注意:_collectSiblingsUntil 仍然可以工作,因为 heading 是查询选择器
    }
    // ── v=20260926 概览(前言)不再做"空则删除"处理 ──
    // 原逻辑:概览一旦被判定为空 → 删除其全部 DOM 节点并 modules.shift()。
    // 而 _moduleHasContent 对 '概览' 无条件 return false,导致回答第一段导语
    // 每次都被整段删掉(markdownToHtml 后 bubble 里只剩标题卡片)。
    // 现改为:概览始终保留在 modules 中(标了 skipCard),内容元素照常 append 回 bubble。
    const headingModCount = modules.filter(m => !m.skipCard).length;

    // 3) 计算与用户问题的相关度(标题包含用户问题关键词,或反之)
    //    v=20260892 增强: AI 输出的模块标题如果包含通用模块关键词
    //    (定义/公式/例题/误区/理解/推导/结论/思考/总结/验证/反思/直觉/严格),
    //    默认算"主模块"(避免被全归入拓展阅读)。
    const keywords = this._extractKeywords(userText || '');
    const COMMON_MODULE_WORDS = ['定义', '公式', '例题', '误区', '理解', '推导', '结论', '思考', '总结', '验证', '反思', '直觉', '严格', '性质', '定理', '方法', '步骤'];
    modules.forEach(m => {
      // v=20260926 概览(导语)永远算主内容:它必须出现在回答最前面,
      // 不能被归入"拓展阅读"折叠区(否则用户看不到首段导语)。
      if (m.skipCard) { m.matched = true; return; }
      const t = (m.title || '').toLowerCase();
      if (!t) { m.matched = true; return; }
      // 关键词匹配 OR 通用模块词匹配
      const kwMatch = keywords.length === 0 ? true : keywords.some(kw => {
        const k = kw.toLowerCase();
        return t.includes(k) || k.includes(t);
      });
      const commonMatch = COMMON_MODULE_WORDS.some(w => t.includes(w));
      m.matched = kwMatch || commonMatch;
    });

    // 4) 重建 bubble 内容(已剥离元数据),把每个模块包成卡片
    bubble.innerHTML = '';
    // ── 顶部:主模块(按 matched 排序:matched 优先)──
    const mainMods = modules.filter(m => m.matched);
    const extraMods = modules.filter(m => !m.matched);
    // 保持原顺序(matched 也按原序)
    // v=20260926 根因修复:渲染函数显式接收目标父节点 parent,
    // 取代原先"临时改写 bubble.appendChild 指向 folderBody"的猴子补丁
    // (补丁会在异常中断时把 bubble.appendChild 永久改坏,导致后续操作栏挂不上气泡)。
    const renderModules = (mods, parent) => {
      mods.forEach(m => {
        // 概览(导语):不渲染卡片外壳,内容元素直接挂到目标父节点,原样可见
        if (m.skipCard) {
          m.contentEls.forEach(c => parent.appendChild(c));
          return;
        }
        const card = document.createElement('div');
        card.className = 'stream-module-card stream-module-' + m.type;
        card.id = m.anchorEl ? m.anchorEl.id : '';
        // 标题区(只对有 anchorEl 的模块加标题条;否则是前言段落)
        if (m.anchorEl) {
          const head = document.createElement('div');
          head.className = 'stream-module-head';
          const titleText = (m.title || '').trim();
          const titleEl = document.createElement(m.anchorEl.tagName.toLowerCase());
          titleEl.id = m.anchorEl.id;
          titleEl.className = 'stream-module-title';
          const _hasEmoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(titleText);
          titleEl.innerHTML = (_hasEmoji ? '' : this._moduleIcon(m.type) + ' ') + this.escapeHtml(titleText);
          const anchor = document.createElement('a');
          anchor.className = 'stream-anchor-link';
          anchor.href = '#' + m.anchorEl.id;
          anchor.title = '复制该模块链接';
          anchor.innerHTML = '🔗';
          anchor.addEventListener('click', (e) => {
            e.preventDefault();
            const url = location.origin + location.pathname + '#' + m.anchorEl.id;
            try { history.pushState(null, '', '#' + m.anchorEl.id); } catch (_) {}
            // v=20260922m 跳到标题元素,留 24px 安全留白 + 导航栏高度
            const t = titleEl.getBoundingClientRect();
            const NAV = this._getChatNavHeight();
            const messages = document.getElementById('chat-messages');
            const target = messages.scrollTop + t.top - NAV - 24;
            messages.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
            if (navigator.clipboard) navigator.clipboard.writeText(url).catch(() => {});
            this._adminToast('🔗 已复制模块链接', 'ok');
          });
          titleEl.appendChild(anchor);
          head.appendChild(titleEl);
          card.appendChild(head);
          // v=20260922m 每个模块渲染完成,记录最新 titleEl 供 toc/resize 刷新使用
          m._renderedAnchorEl = titleEl;
        }
        m.contentEls.forEach(c => card.appendChild(c));
        parent.appendChild(card);
      });
    };
    renderModules(mainMods, bubble);
    // ── 拓展阅读:当非匹配模块 >= 1 且模块总数 >= 3 时折叠 ──
    // v=20260926 模块数口径沿用旧行为:不把"概览"导语算作章节(headingModCount)
    if (extraMods.length >= 1 && headingModCount >= 3) {
      const folder = document.createElement('details');
      folder.className = 'stream-extra-folder';
      folder.innerHTML = `<summary>📚 拓展阅读（${extraMods.length} 个相关章节）</summary>`;
      const folderBody = document.createElement('div');
      folderBody.className = 'stream-extra-body';
      bubble.appendChild(folder);
      // 额外模块直接渲染进 folderBody(显式传父节点,不再猴子补丁)
      renderModules(extraMods, folderBody);
      folder.appendChild(folderBody);
    } else {
      renderModules(extraMods, bubble);
    }
    // v=20260922 删除 v20260921 注入的 stream-meta-folder。
    // 知识库来源展示统一迁移到 _appendRagCards 生成的「右上角 RAG 按钮 + 弹窗」,
    // 不再在回答内(底部或拓展阅读)渲染任何来源 details,避免重复展示。

    // 5.0) 必保留项补回:AI 标识小字 / 流式降级标签(用户需求"底部小字保留")
    {
      const mustKeep = metaEls.filter(el =>
        el.classList && (el.classList.contains('ai-gen-tag') ||
                         el.classList.contains('chat-fallback-tag') ||
                         el.classList.contains('chat-fallback-panel') ||
                         el.classList.contains('fbp-actions'))
      );
      mustKeep.forEach(el => bubble.appendChild(el));
    }

    // 5) 回答目录(headingModCount >= 3 生成; v=20260922n 取消 isMobile 限制,移动端为回答顶部折叠块)
    if (headingModCount >= 3) {
      const toc = document.createElement('div');
      toc.className = 'stream-toc';
      // v=20260824 实时锚点缓存:每个目录项映射到 mainMod.anchorEl 元素
      if (!this._tocAnchorMap) this._tocAnchorMap = new Map();
      const anchorMap = this._tocAnchorMap;
      if (!anchorMap.has(bubbleKey)) anchorMap.set(bubbleKey, new Map());
      const localMap = anchorMap.get(bubbleKey);
      localMap.clear();
      // v=20260926 目录只收录"有标题锚点"的模块:概览(导语)无锚点,不进目录,
      // 否则会渲染出一个点了没反应的死条目,并且抢走首项的 active 高亮。
      const tocMods = mainMods.filter(m => m.anchorEl);
      toc.innerHTML = `<div class="stream-toc-head">📑 目录</div><ul class="stream-toc-list">${
        tocMods.map((m, i) => {
          const id = m.anchorEl ? m.anchorEl.id : '';
          // v=20260922m 用最新 titleEl 优先(模块标题 DOM),保证映射准确
          const latestEl = (m._renderedAnchorEl && m._renderedAnchorEl.isConnected)
            ? m._renderedAnchorEl
            : (id ? document.getElementById(id) : null) || m.anchorEl;
          if (id && latestEl) localMap.set(id, latestEl);
          return `<li class="stream-toc-item${i === 0 ? ' active' : ''}" data-target="${id}" data-bubble="${bubbleKey}">${this.escapeHtml(m.title)}</li>`;
        }).join('') +
        (extraMods.length ? `<li class="stream-toc-extra" data-extra="1" data-bubble="${bubbleKey}">📚 拓展阅读（${extraMods.length}）</li>` : '')
      }</ul>`;
      bubbleEl.appendChild(toc);
      // 目录点击跳转 v=20260824 重写:
      // 1) 用 anchorMap 实时取元素(不依赖 querySelector,避免流式未渲染完空查)
      // 2) 实时测量顶部导航栏高度 + 20px 安全上边距
      // 3) 优先 messages.scrollTo(PC 内嵌滚动),备选 window.scrollTo
      const _self = this;
      toc.querySelectorAll('.stream-toc-item').forEach(li => {
        li.addEventListener('click', () => {
          const id = li.dataset.target;
          if (!id) return;
          _self._scrollToAnchor(id, localMap);
        });
      });
      // 拓展阅读点击展开 details
      const extraLi = toc.querySelector('.stream-toc-extra');
      if (extraLi) {
        extraLi.addEventListener('click', () => {
          const f = bubble.querySelector('.stream-extra-folder');
          if (f) { f.open = true; _self._scrollToElement(f); }
        });
      }
      // resize 时刷新:重新计算顶部导航栏高度缓存,验证 anchorMap 元素仍在 DOM
      // (v=20260824: 不主动重算,点击时实时测量,避免频繁布局抖动)
      // scroll spy:高亮当前正在阅读的模块
      this._setupStreamTocSpy(bubble, toc);
      // v=20260909 目录固定悬浮跟随:滚出视口后切换 .sticky-fixed(PC 端)
      this._setupStreamTocFloat(bubbleEl, toc);
    }

    // v=20260922m 流式全部输出完毕,刷新该 bubble 的全部锚点映射
    this._refreshTocAnchorsForBubble(bubbleKey);
    this._setupTocResizeListener();

    // 6) 回到回答顶部按钮(PC + 移动端)
    const backTop = document.createElement('button');
    backTop.className = 'stream-back-top';
    backTop.title = '回到回答顶部';
    backTop.innerHTML = '↑';
    backTop.addEventListener('click', () => this.scrollToBubbleTop(bubbleEl));
    bubbleEl.appendChild(backTop);
    // 滚动到 bubble 之外时不显示(只看 bubble 顶是否已滚出视口)
    const messages = document.getElementById('chat-messages');
    messages.addEventListener('scroll', () => {
      const r = bubbleEl.getBoundingClientRect();
      const mr = messages.getBoundingClientRect();
      // bubble 顶已滚出视口顶 → 显示按钮
      const bubbleTopInView = r.top >= mr.top - 4;
      backTop.classList.toggle('visible', !bubbleTopInView);
    });
    // 初始若 bubble 较短,也不显示
    backTop.classList.remove('visible');
  };

  /** v=20260890 收集从 startEl 到 stopBeforeEl(不含)之间的所有兄弟元素(跨嵌套容器) */
App._collectSiblingsUntil = function _collectSiblingsUntil(bubble, startEl, stopBeforeEl) {
    const out = [];
    const container = startEl.parentElement;
    if (!container) return out;
    const inRange = (node) => {
      if (!node) return false;
      if (node === stopBeforeEl) return true;
      if (stopBeforeEl && node.contains && node.contains(stopBeforeEl)) return true;
      return false;
    };
    // 阶段1:在 container 内,从 startEl 之后到 stopBeforeEl 之前
    let node = startEl.nextSibling;   // v=20260908 改用 nextSibling,识别纯文本节点
    while (node && !inRange(node)) {
      // 跳过纯空文本节点(只剩空白字符)
      if (node.nodeType === Node.TEXT_NODE) {
        if ((node.nodeValue || '').trim() === '') {
          node = node.nextSibling;
          continue;
        }
      }
      // 跳过空元素(如 <p></p>)
      if (node.nodeType === Node.ELEMENT_NODE &&
          (!node.children || node.children.length === 0) &&
          !(node.textContent || '').trim()) {
        node = node.nextSibling;
        continue;
      }
      out.push(node);
      node = node.nextSibling;
    }
    // 阶段2:在 container 之后继续(直到 stopBeforeEl 或 bubble 末尾)
    if (container !== bubble) {
      node = container.nextSibling;
      while (node && !inRange(node)) {
        if (node.nodeType === Node.TEXT_NODE) {
          if ((node.nodeValue || '').trim() === '') {
            node = node.nextSibling;
            continue;
          }
        }
        if (node.nodeType === Node.ELEMENT_NODE &&
            (!node.children || node.children.length === 0) &&
            !(node.textContent || '').trim()) {
          node = node.nextSibling;
          continue;
        }
        out.push(node);
        node = node.nextSibling;
      }
    }
    return out;
  };

  /**
   * v=20260824 实时测量 chat 视图顶部导航栏高度
   * 优先用 .page-header 元素实际高度,fallback 60px
   */
App._getChatNavHeight = function _getChatNavHeight() {
    const header = document.querySelector('#view-chat .page-header');
    if (header) {
      const r = header.getBoundingClientRect();
      return Math.max(48, r.height);  // 最小 48px 保护
    }
    return 60;
  };

  /** v=20260922m 通用滚动:禁用 scrollIntoView,用 messages.scrollTo / window.scrollTo
   * scrollY = 滚动根.scrollTop + target.getBoundingClientRect().top - 导航栏真实高 - 24px
   */
App._scrollToElement = function _scrollToElement(el) {
    if (!el || !el.isConnected) return;
    const rect = el.getBoundingClientRect();
    const NAV = this._getChatNavHeight();
    const SAFE = 24;
    const messages = document.getElementById('chat-messages');
    const isMsgScroller = messages && messages.scrollHeight > messages.clientHeight + 1;
    if (isMsgScroller) {
      const target = messages.scrollTop + rect.top - NAV - SAFE;
      messages.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    } else {
      const target = window.pageYOffset + rect.top - NAV - SAFE;
      window.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    }
  };

  /**
   * v=20260824 锚点跳转:优先用 anchorMap(实时缓存)取元素,fallback 用 id
   * 流式输出每渲染完一个模块就更新 anchorMap,避免 id 存在但元素未渲染
   * v=20260925 修复:bubble.innerHTML='' 重建后,anchorMap 缓存的原 anchorEl 已脱离 DOM,
   *  getBoundingClientRect 返回 0,导致 click 无反应。优先用当前 DOM 中的元素。
   */
  /** v=20260922m 目录锚点跳转:绑定【模块标题 DOM】,禁用 scrollIntoView
   * 容错:DOM 不存在时静默返回,不执行滚动、不抛控制台报错
   */
App._scrollToAnchor = function _scrollToAnchor(id, anchorMap) {
    if (!id) return;
    let target = document.getElementById(id) || null;
    if (target && !target.isConnected) target = null;
    if (!target && anchorMap) {
      target = anchorMap.get(id) || null;
      if (target && !target.isConnected) target = null;
    }
    if (!target) return; // 容错:不执行滚动、不报错
    this._scrollToElement(target); // 直接跳【模块标题 DOM】
  };

  /** v=20260922m 刷新指定 bubble 的全部锚点映射:重新查 DOM */
App._refreshTocAnchorsForBubble = function _refreshTocAnchorsForBubble(bubbleKey) {
    if (!this._tocAnchorMap || !bubbleKey) return;
    const localMap = this._tocAnchorMap.get(bubbleKey);
    if (!localMap) return;
    for (const [id] of localMap) {
      const el = document.getElementById(id);
      if (el && el.isConnected) localMap.set(id, el);
      else localMap.delete(id);
    }
  };

  /** v=20260922m resize 时刷新所有 bubble 的锚点映射 */
App._refreshAllTocAnchors = function _refreshAllTocAnchors() {
    if (!this._tocAnchorMap) return;
    for (const key of this._tocAnchorMap.keys()) {
      this._refreshTocAnchorsForBubble(key);
    }
  };

  /** v=20260922m 注册窗口 resize 监听,去抖刷新锚点 */
App._setupTocResizeListener = function _setupTocResizeListener() {
    if (this._tocResizeBound) return;
    this._tocResizeBound = true;
    let timer = null;
    window.addEventListener('resize', () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => this._refreshAllTocAnchors(), 120);
    });
  };

  /** v=20260922m 旧接口保留(语义从"清空"改为"刷新"):resize 时重新刷新所有锚点映射 */
App._invalidateTocAnchors = function _invalidateTocAnchors() {
    this._refreshAllTocAnchors();
  };

  // 旧的 _scrollToBubbleTop 保留(分步讲解首次进入时滚到回答开头用)
App.scrollToBubbleTop = function scrollToBubbleTop(bubbleEl) {
    if (!bubbleEl) return this.scrollToBottom();
    this._scrollToElement(bubbleEl);
  };


  /** v=20260890 根据标题文字识别模块类型(用于视觉区分卡片) */
App._classifyModule = function _classifyModule(title) {
    const t = (title || '').toLowerCase();
    if (/(定义|概念|含义|是什么)/.test(t)) return 'def';
    if (/(公式|推导|证明|性质|定理|关系|充要|等价)/.test(t)) return 'formula';
    if (/(例题|例\s|例:|典型例|举例)/.test(t)) return 'example';
    if (/(误区|陷阱|易错|注意|常见错|不要|避免)/.test(t)) return 'warning';
    if (/(相关|扩展|延伸|进一步|应用|小结|总结|归纳|回顾|练习)/.test(t)) return 'extra';
    return 'default';
  };

  /** v=20260908 清洗 bubble 内文本:剔除无意义乱码/孤立字符/残留 ID/HTML 残留 */
App._sanitizeBubbleContent = function _sanitizeBubbleContent(bubble) {
    if (!bubble) return;
    // 1) 清理 Markdown/HTML 残留: <br>、<p></p>、碎片化标签
    const removeSelectors = [
      'p:empty', 'p:only-of-type:empty',
      'span:empty', 'div:empty:not(.katex-display):not(.katex)',
      // 剥离纯技术残留元信息(如 la_tutor_xxx 之类的临时 ID)
      'script', 'style'
    ];
    removeSelectors.forEach(sel => {
      bubble.querySelectorAll(sel).forEach(el => {
        // 保留 katex 容器
        if (el.closest && el.closest('.katex')) return;
        el.remove();
      });
    });
    // 2) 清理文本节点:孤立单字母 / 孤立符号 / 碎片化 ID
    const walker = document.createTreeWalker(bubble, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        // 不处理 katex 内部文本(数学公式)
        if (n.parentElement && n.parentElement.closest('.katex')) return NodeFilter.FILTER_REJECT;
        // 不处理 code/pre(代码片段可能含 ID)
        if (n.parentElement && (n.parentElement.tagName === 'CODE' || n.parentElement.tagName === 'PRE')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const toClean = [];
    let n;
    while ((n = walker.nextNode())) toClean.push(n);
    toClean.forEach(node => {
      const txt = node.nodeValue || '';
      // 清洗规则:剔除孤立的"<!-- -->"、"~~~"、"???"、"id:xxx" 等技术残留
      const cleaned = txt
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/^[~`]+|[~`]+$/g, '')
        .replace(/(?:^|[\s,，;；])id\s*[:：]\s*\S+/gi, '')
        .replace(/(?:^|[\s,，;；])chunk[_-]?id\s*[:：]\s*\S+/gi, '')
        .replace(/<\/?[a-z][^>]*>/gi, m => {
          // 把残留 HTML 标签转义(防御性,虽然前一步应已删)
          return m.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        });
      if (cleaned !== txt) node.nodeValue = cleaned;
    });
    // 3) 清理后再次清扫空标签(可能因清洗产生)
    bubble.querySelectorAll('p:empty, div:empty, span:empty').forEach(el => {
      if (el.closest && el.closest('.katex')) return;
      el.remove();
    });
  };

  /** v=20260908 判断模块是否有实质内容(contentEls 经合并去空后文字量 ≥ 阈值或含独立公式) */
App._moduleHasContent = function _moduleHasContent(m) {
    if (!m) return false;
    // v=20260926 删除"标题 === 概览 一律判空"的特例:
    // 该特例让带导语的首段模块永远被剔除+删 DOM(回答第一段导语丢失的根因)。
    // 概览改用通用判空规则;是否渲染卡片外壳由 m.skipCard 控制,与判空解耦。
    const els = m.contentEls || [];
    if (!els.length) return false;
    // 合并所有 contentEl 的文字
    const allText = els.map(el => (el.textContent || '').trim()).join('').trim();
    // 合并后文字字符数(中文按 1,英文/数字按 0.5 估算)
    let chars = 0;
    for (const ch of allText) {
      chars += (/[\u4e00-\u9fa5]/.test(ch)) ? 1 : 0.5;
    }
    // 公式:有 KaTeX 节点 → 也算有内容
    const hasKatex = els.some(el => el.querySelector && el.querySelector('.katex'));
    // 阈值:>= 12 字符(等同 12 个中文字 或 24 个英文字母)才算有内容;或含公式即算
    if (chars >= 12) return true;
    if (hasKatex && chars >= 4) return true;   // 公式至少配 4 字文字
    return false;
  };

  /** v=20260890 模块卡片左侧 icon */
App._moduleIcon = function _moduleIcon(type) {
    const icons = { def: '📘', formula: '🧮', example: '✏️', warning: '⚠️', extra: '🔗', default: '📄' };
    return icons[type] || icons.default;
  };

  /** v=20260890 提取用户问题关键词(简易中文分词:按 2~4 字切片 + 原始词) */
App._extractKeywords = function _extractKeywords(text) {
    if (!text) return [];
    const s = String(text).trim();
    // 去除标点
    const cleaned = s.replace(/[，。、；:：？！!?,.\s]+/g, ' ');
    const tokens = [];
    cleaned.split(/\s+/).forEach(w => {
      if (w.length >= 2) tokens.push(w);
      // 2~4 字滑动窗口
      for (let n = 2; n <= Math.min(4, w.length); n++) {
        for (let i = 0; i + n <= w.length; i++) {
          const sub = w.slice(i, i + n);
          if (sub.length >= 2) tokens.push(sub);
        }
      }
    });
    // 去重,优先长的
    const seen = new Set();
    return tokens.filter(t => {
      if (seen.has(t)) return false;
      seen.add(t); return true;
    }).sort((a, b) => b.length - a.length).slice(0, 12);
  };

  /**
   * v=20260915 引导学习模式:解析 AI 回复中的约定标记并渲染多轮交互 UI
   * 标记:
   *   [NEED_HINT]        → 学生答错 ≥2 次,显示「查看完整解析」按钮(切换 detailed 重发)
   *   [CHECK_ANSWER]     → 学生接近答案,进入下一题(隐藏按钮)
   *   [COMPLETE]         → 引导完成,显示「总结卡」+ 再次显示「查看完整解析」
   *   [WEAK_KP:kp1;kp2]  → 知识点薄弱,渲染可点击跳转拓扑图谱的标签
   * 标记在 _enrichStreamBubble(markdownToHtml) 之后扫描 DOM 移除,避免污染正文
   */
App._applyGuidedMarks = function _applyGuidedMarks(bubbleEl, rawText) {
    const bubble = bubbleEl.querySelector('.bot-bubble');
    if (!bubble) return;
    const text = rawText || '';
    const needHint = /\[NEED_HINT\]/.test(text);
    const complete = /\[COMPLETE\]/.test(text);
    const kpMatch = text.match(/\[WEAK_KP:([^\]]+)\]/);
    const weakKps = kpMatch ? kpMatch[1].split(/[;,，；]/).map(s => s.trim()).filter(Boolean) : [];
    // 1) 从 DOM 中移除所有约定标记文本(正则替换 innerText 节点)
    const removeMarker = (regex) => {
      const walker = document.createTreeWalker(bubble, NodeFilter.SHOW_TEXT, null);
      const toClean = [];
      let n;
      while ((n = walker.nextNode())) toClean.push(n);
      toClean.forEach(node => {
        if (regex.test(node.nodeValue)) {
          node.nodeValue = node.nodeValue.replace(regex, '').replace(/\s{2,}/g, ' ').trim();
        }
      });
    };
    removeMarker(/\[NEED_HINT\]/g);
    removeMarker(/\[CHECK_ANSWER\]/g);
    removeMarker(/\[COMPLETE\]/g);
    removeMarker(/\[WEAK_KP:[^\]]+\]/g);
    // 2) 末尾追加:薄弱知识点标签
    if (weakKps.length) {
      const wrap = document.createElement('div');
      wrap.className = 'guided-weak-block';
      wrap.innerHTML = `<div class="guided-weak-head">🧭 检测到薄弱知识点,建议先复习:</div>
        <div class="guided-weak-tags">${
          weakKps.map((kp, i) => `<a href="#" class="guided-weak-kp" data-kp="${this.escapeHtml(kp)}" data-idx="${i}">📚 ${this.escapeHtml(kp)}</a>`).join('')
        }</div>`;
      bubble.appendChild(wrap);
      wrap.querySelectorAll('.guided-weak-kp').forEach(a => {
        a.addEventListener('click', e => {
          e.preventDefault();
          this._guidedJumpToTopology(a.dataset.kp);
        });
      });
    }
    // 3) 「查看完整解析」按钮(NEED_HINT 或 COMPLETE 时出现)
    if (needHint || complete) {
      const btnWrap = document.createElement('div');
      btnWrap.className = 'guided-actions';
      btnWrap.innerHTML = `<button class="guided-view-full-btn">
        ${complete ? '📋 查看完整解析(分步讲解)' : '💡 我卡住了,查看完整解析'}
      </button>`;
      bubble.appendChild(btnWrap);
      const btn = btnWrap.querySelector('.guided-view-full-btn');
      btn.addEventListener('click', () => this._guidedSwitchToDetailed(bubbleEl));
    }
    // 4) [COMPLETE] 时追加总结卡(浅金色,汇总最终结论)
    if (complete) {
      // 提取正文核心结论:取最后 200 字作为"最终结论",但跳过已被清空的标记
      const cleanedText = bubble.textContent.replace(/\s+/g, ' ').trim();
      const finalTail = cleanedText.length > 280 ? cleanedText.slice(-280) : cleanedText;
      const summary = document.createElement('div');
      summary.className = 'guided-summary';
      summary.innerHTML = `
        <div class="guided-summary-head">🏁 引导完成 · 最终结论</div>
        <div class="guided-summary-body">${this.escapeHtml(finalTail)}</div>
        <div class="guided-summary-foot">💡 想看完整推导?点击上方「查看完整解析」切到分步讲解模式</div>`;
      bubble.appendChild(summary);
      // 引导完成:在 chatHistory 标记完成,后续问题回到直接解答
      this.guidedSession = this.guidedSession || {};
      this.guidedSession.completed = true;
    }
  };

  /**
   * v=20260915 引导学习:点击薄弱知识点 → 跳转到拓扑图谱三级节点并预选
   */
App._guidedJumpToTopology = function _guidedJumpToTopology(kpName) {
    try {
      sessionStorage.setItem('la_topo_focus', kpName);
      sessionStorage.setItem('la_topo_trace', JSON.stringify({ from: 'guided', ts: Date.now() }));
    } catch (e) { /* 忽略 quota 错误 */ }
    if (typeof this.switchView === 'function') this.switchView('topology');
    this._adminToast && this._adminToast('📚 正在跳转拓扑图谱:' + kpName, 'info');
  };

  /**
   * v=20260915 引导学习:「查看完整解析」按钮 → 把当前问题以 detailed 重发
   * 复用 chatHistory + 临时切换 mode,避免重复请求
   */
App._guidedSwitchToDetailed = function _guidedSwitchToDetailed(bubbleEl) {
    const lastUser = [...this.chatHistory].reverse().find(m => m.role === 'user');
    if (!lastUser || !lastUser.content) {
      this._adminToast && this._adminToast('⚠️ 未找到原始问题', 'error');
      return;
    }
    // 标记引导完成,避免下次进入仍按 guided
    this.guidedSession = this.guidedSession || {};
    this.guidedSession.completed = true;
    // 切换到 detailed 模式并重发(用户气泡重复一次 + AI 详细回答)
    this.currentChatMode = 'detailed';
    document.querySelectorAll('.chat-mode-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === 'detailed');
    });
    this._adminToast && this._adminToast('🔄 已切换到分步讲解模式', 'ok');
    // 复用现有发送逻辑(_streamAsk 会把当前用户气泡追加)
    this._streamAsk({ messages: this.chatHistory.slice(0, -1) }, 'detailed', lastUser.content);
  };

  /** v=20260890 滚动时高亮当前正在阅读的模块(PC 端 TOC 联动) */
App._setupStreamTocSpy = function _setupStreamTocSpy(bubble, toc) {
    const items = Array.from(toc.querySelectorAll('.stream-toc-item'));
    const messages = document.getElementById('chat-messages');
    if (!items.length) return;
    const cards = items.map(li => bubble.querySelector('#' + li.dataset.target)).filter(Boolean);
    const onScroll = () => {
      const mr = messages.getBoundingClientRect();
      const lineY = mr.top + 120;  // 视口顶部往下 120px 作为"当前阅读位置"(与锚点偏移一致)
      let active = -1;
      for (let i = 0; i < cards.length; i++) {
        const r = cards[i].getBoundingClientRect();
        if (r.top - lineY <= 4) active = i;
        else break;
      }
      items.forEach((li, i) => li.classList.toggle('active', i === active));
    };
    messages.addEventListener('scroll', onScroll, { passive: true });
    // 初次调用一次
    setTimeout(onScroll, 50);
  };

  /**
   * v=20260909 目录固定悬浮跟随(仅 PC 端)
   * - toc 在文档流中位于回答气泡右侧;当滚出视口顶部边界后,切换 .sticky-fixed 固定到屏幕右侧
   * - 回滚到原文档流位置时,恢复普通流式布局
   * - 滚动超过回答气泡底部时,取消固定(随气泡一起滚出)
   */
App._setupStreamTocFloat = function _setupStreamTocFloat(bubbleEl, toc) {
    if (this.isMobile) return;   // 移动端不启用(且 CSS 已隐藏 toc)
    const messages = document.getElementById('chat-messages');
    if (!messages) return;
    // 记录 toc 在文档流中的绝对位置:相对 messages 内容顶部的偏移(px)
    // (用 getBoundingClientRect 换算,避免 offsetTop 相对 offsetParent 的基准错乱)
    const mr0 = messages.getBoundingClientRect();
    const docTop = toc.getBoundingClientRect().top - mr0.top + messages.scrollTop;
    const bubble = bubbleEl;     // .message
    const onScroll = () => {
      if (!toc.isConnected) { messages.removeEventListener('scroll', onScroll); return; }
      const mr = messages.getBoundingClientRect();
      // toc 文档流位置在当前视口中的坐标
      const tocViewTop = docTop - messages.scrollTop + mr.top;
      // 回答气泡底部是否仍在视口内
      const bubbleBottom = bubble.getBoundingClientRect().bottom;
      const FLOAT_TOP = 100;
      const shouldFloat = tocViewTop < FLOAT_TOP && bubbleBottom > mr.top + 40;
      toc.classList.toggle('sticky-fixed', shouldFloat);
    };
    messages.addEventListener('scroll', onScroll, { passive: true });
    // resize 时重新校验(布局变化)
    window.addEventListener('resize', onScroll);
    setTimeout(onScroll, 80);
  };

App.autoResize = function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  };

App.escapeHtml = function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    // v=20260926 根因修复:textContent → innerHTML 只转义 & < >,不转义引号。
    // 本函数的输出大量用于 data-*="..." / title="..." 属性,昵称等含 " 时会
    // 直接闭合属性并注入新属性(如 onmouseover=)。此处补转义双引号。
    // 说明:单引号在 HTML 文本节点中无需转义,属性侧统一使用双引号包裹,
    // 故只处理 ";dataset/getAttribute 读取时浏览器会自动把 &quot; 解码回 ",
    // 故 data-* 写回读取的语义不变(仅显示层多一层实体)。
    return div.innerHTML.replace(/"/g, '&quot;');
  };

  /** 清洗标题/字符串末尾多余的中英文标点（避免"什么是施密特正交化》"） */
App._cleanTrailingPunct = function _cleanTrailingPunct(text) {
    if (!text) return '';
    // 末尾反复出现的:空白 / 中英文标点 / 表情 / 引号
    return String(text).replace(/[\s\u3000。，；：、？！?!\.,;:…'"''""`~～\-—_+=|\\\/]{1,12}$/, '').trim();
  };

  /**
   * v=20260909p 知识详情公式/例题/误区 LaTeX 自动包裹:
   * - 若文本已含 $...$ / $$...$$ / \(...\) / \[...\] / \begin{...}\end{...} 定界符则原样返回
   * - 若纯文本里含 LaTeX 命令(如 \times, \lambda, A_2, E_{ij}, a_{ij})且无定界符,则整体用 $...$ 包裹
   * - 检测条件:文本内出现 \command、_{...}、^{...} 或 \begin{...} 中任一即视为含 LaTeX
   * - 例外:含纯中英文标点为主的自然语言,即使出现 \times 等也可能是描述(如"包含 \times"),跳过
   */
App._wrapLatexDelimiters = function _wrapLatexDelimiters(text) {
    if (!text) return '';
    const s = String(text);
    // 已有定界符,直接返回
    if (/\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]|\\begin\{[\s\S]+?\\end\{/.test(s)) return s;
    // 含 LaTeX 命令?
    const hasLatexCmd = /\\(?:times|lambda|mu|alpha|beta|gamma|delta|theta|pi|sigma|omega|phi|psi|rho|infty|sum|prod|int|sqrt|frac|begin|end|left|right|cdot|times|div|pm|mp|le|ge|neq|approx|equiv|to|cap|cup|subset|supset|in|notin|cup|vee|wedge|neg|forall|exists|partial|nabla|triangle|langle|rangle|lceil|rceil|lfloor|rfloor|binom|overrightarrow|overline|underline|hat|tilde|bar|vec|dot|ddot|widehat|widetilde|mathrm|mathbf|mathit|mathcal|mathbb|mathfrak|mathsf|textstyle|displaystyle|quad|qquad|cdots|ldots|vdots|ddots|space|hspace|hspace\*)/.test(s)
      || /[a-zA-Z]_\{?[a-zA-Z0-9]+\}?/.test(s)
      || /[a-zA-Z]\^\{?[a-zA-Z0-9]+\}?/.test(s);
    if (!hasLatexCmd) return s;
    // 整体包 $...$
    return '$' + s + '$';
  };

  /**
   * 公式归一化与容错：
   * - 后端/AI 返回的转义反斜杠 \\ → 单个 \
   * - AI 笔误 vmatrix → vmatrix
   * - 去掉行尾可能残存的孤立 $ \[ \] 等定界符字符
   * - 矩阵单元格中可能被编码成 \\& 的 LaTeX & → 还原 &
   */
App._normalizeFormula = function _normalizeFormula(formula) {
    if (!formula) return '';
    let f = String(formula);
    // v=20260902m 转义根治(行列式挤成一行的最高频根因):
    // 关键:LaTeX 换行 = 2 个连续反斜杠 \\,KaTeX 需要这 2 个反斜杠识别换行!
    // 旧逻辑 f.replace(/\\\\/g,'\\') 把 2 个反斜杠压成 1 个 → 换行失效 → 挤成一行(元凶!)
    // 正确做法:
    // ① 只把 4 个反斜杠 \\\\ 压成 2 个 \\\\(处理 JSON 二次转义),绝不动正常的 2 个反斜杠
    // ② 循环还原 HTML 实体 &amp; → &(列分隔符被 escapeHtml 转义后,KaTeX 识别不到分列)
    // ③ 还原 \\& → &(LaTeX 里被多余转义的列分隔符)
    f = f.replace(/\\\\\\\\/g, '\\\\');
    while (f.indexOf('&amp;') !== -1) f = f.replace(/&amp;/g, '&');
    f = f.replace(/\\&/g, '&');
    // 2. 笔误环境名兼容
    f = f.replace(/\\begin\{vmatrix\}/g, '\\begin{vmatrix}')
         .replace(/\\end\{vmatrix\}/g, '\\end{vmatrix}')
         .replace(/\\begin\{pmatrix\}/g, '\\begin{pmatrix}')
         .replace(/\\end\{pmatrix\}/g, '\\end{pmatrix}')
         .replace(/\\begin\{Vmatrix\}/g, '\\begin{Vmatrix}')
         .replace(/\\end\{Vmatrix\}/g, '\\end{Vmatrix}')
         .replace(/\\begin\{Bmatrix\}/g, '\\begin{Bmatrix}')
         .replace(/\\end\{Bmatrix\}/g, '\\end{Bmatrix}');
    // 3. 去掉行尾残留定界符(v=20260902m 加上 \) 支持,因新增识别 \(...\))
    f = f.replace(/[\$\\[\\]()]+$/g, '').trim();
    return f;
  };

  /**
   * v=20260828ui 状态机分段:扫描 LaTeX 开/闭标记,已闭合段并入 closed(立即可渲染),未闭合段并入 pending(隐藏)
   * 4 类开标记:$$ / \[ / $ / \begin{env};对应闭标记 $$ / \] / $ / \end{env}
   * 优先级:$$ > \begin{env} > \[ > $(最长匹配);\end{env} 须与栈顶 env 匹配才出栈
   */
App.splitLatexByState = function splitLatexByState(text) {
    if (!text) return { closed: '', pending: '' };
    const isOpen = (rest) => {
      if (rest.startsWith('$$')) return { kind: '$$', len: 2, env: '$$' };
      const bm = rest.match(/^\\begin\{([^}]+)\}/);
      if (bm) return { kind: 'begin', len: bm[0].length, env: bm[1] };
      if (rest.startsWith('\\[')) return { kind: '\\[', len: 2, env: '\\[' };
      // v=20260902m 新增识别 \( 行内 LaTeX,确保流式渲染检测到完整闭合
      if (rest.startsWith('\\(')) return { kind: '\\(', len: 2, env: '\\(' };
      if (rest.startsWith('$')) return { kind: '$', len: 1, env: '$' };
      return null;
    };
    const isClose = (rest, top) => {
      if (!top) return null;
      if (top.env === '$$' && rest.startsWith('$$')) return { len: 2 };
      if (top.env === '\\[' && rest.startsWith('\\]')) return { len: 2 };
      // v=20260902m 配对 \) 关闭 \(
      if (top.env === '\\(' && rest.startsWith('\\)')) return { len: 2 };
      if (top.env === '$' && rest.startsWith('$') && !rest.startsWith('$$')) return { len: 1 };
      const em = rest.match(/^\\end\{([^}]+)\}/);
      if (em && em[1] === top.env) return { len: em[0].length };
      return null;
    };
    let closed = '', pending = '', seg = 0, i = 0;
    const stack = [];
    while (i < text.length) {
      const rest = text.slice(i);
      // 优先匹配闭标记,避免栈顶 $$ 时把下一个 $$ 当作开标记再次入栈
      const cl = isClose(rest, stack[stack.length - 1]);
      if (cl) {
        stack.pop();
        i += cl.len;
        if (stack.length === 0) {
          pending += text.slice(seg, i);
          closed += pending;
          pending = '';
          seg = i;
        }
        continue;
      }
      const op = isOpen(rest);
      if (op) {
        if (stack.length === 0) {
          closed += text.slice(seg, i);
          seg = i;
        }
        stack.push(op);
        i += op.len;
        continue;
      }
      i++;
    }
    if (seg < text.length) {
      if (stack.length === 0) closed += text.slice(seg);
      else pending += text.slice(seg);
    }
    return { closed, pending };
  };

  /**
   * v=20260828ui 压扁纯文本矩阵 → LaTeX(前端最终兜底,与后端 _flatten_matrix_to_latex 同逻辑)
   * 试切:分号/竖线显式分行 → 按行重组;否则空格切 token,n>=4 且 n 为完全平方 → 按 k=int(sqrt(n)) 正方形切
   * 不匹配(|x|/|A| 绝对值等)原样保留
   */
