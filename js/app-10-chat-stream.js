/* app-10-chat-stream.js —— 原 js/app.v3.19.js 第 5335–6072 行拆分（2026-09-11 模块化）。
 * 成员以 App.xxx 赋值形式挂载到全局 App 对象，加载顺序见 index.html。*/
App._downloadBlob = function _downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // ============ 聊天模块 ============

App.showChat = function showChat() {
    this.switchView('chat');
  };

App.sendMessage = function sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    // v=20260926 未就绪附件不再直接发送:只把 state === 'ready' 且已读到 dataUrl 的图片
    // 交给渲染与上传。原逻辑把 loading(空 dataUrl)/error 的附件一并塞进请求,
    // 会向后端发一个 src 为空的图片(视觉模型报错或整条请求失败)。
    const allAtts = this.chatAttachments || [];
    const atts = allAtts.filter(a => a.state === 'ready' && a.dataUrl);
    const loading = allAtts.filter(a => a.state === 'loading');
    const failed = allAtts.filter(a => a.state === 'error');
    // 无文字、无就绪图片、也没有正在读取的图片 → 无需发送
    if (!text && atts.length === 0 && loading.length === 0) return;
    // 还有图片在读 → 提示稍候,本次不发送(避免发出空图片/漏图的消息)
    if (loading.length) {
      if (this._shotToast) this._shotToast('图片仍在读取，请稍候', 'warn');
      return;
    }
    // 无文字且无可发送图片(只剩读取失败的图片)→ 不发送
    if (!text && atts.length === 0) return;

    // 游客试用限制
    if (!Auth.isLoggedIn && !Auth.guestTick()) {
      document.getElementById('limit-overlay').style.display = 'flex';
      return;
    }

    // 读取失败的图片:提示并跳过该项(不阻塞其余图文发送)
    if (failed.length && this._shotToast) {
      this._shotToast(failed.length + ' 张图片读取失败，已跳过', 'warn');
    }

    // 渲染用户消息(多图 + 文字)
    const imageUrls = atts.length ? atts.map(a => a.dataUrl) : null;
    this.addUserMessage(text, imageUrls);
    input.value = '';
    this.autoResize(input);
    this.chatAttachments = [];
    this._renderChatAttachment();
    // 首次提问后隐藏示例问题卡片,释放聊天空间
    const qq = document.getElementById('quick-questions');
    if (qq && !qq.classList.contains('hidden')) qq.classList.add('hidden');
    // v=20260903e 移动端快捷 chips 同样在发送后隐藏
    const chips = document.getElementById('chat-quick-chips');
    if (chips && !chips.classList.contains('hidden')) chips.classList.add('hidden');
    // v=20260908c 发送后收起底部两栏(仅移动端)
    this._collapseChatBars();
    this.showTyping();
    if (atts.length) {
      // v=20260824d 区分视觉模型 vs OCR:未配 LLM_VISION_* 时后端走 OCR 降级,
      // toast 文案按真实路径显示(避免"正在用视觉模型识别"误导)
      this._detectVisionMode().then(mode => {
        const tag = mode === 'vision' ? '视觉模型' : 'OCR 提取文字';
        this._shotToast(`正在用 ${tag} 识别 ${atts.length} 张图片…`);
      });
    }

    const mode = this.currentChatMode || 'direct';
    this.callTutor(text, mode, atts);
  };

  // 调用后端大模型(多轮上下文);v=20260922o 支持图片数组 → 后端多模态视觉模型
App.callTutor = async function callTutor(text, mode, imageAtts) {
    // v=20260873 记录最后一次提问(供兜底标签"重试"使用)
    this._lastQuestion = text;
    this._lastMode = mode;
    // v=20260922o 图片问答:直接把图片 dataURL 数组传给后端,由后端 vision 模型识别 + 按模式输出
    // 不再走本地 OCR 提取文字(用户原话:"禁止使用纯文本大模型" → 由后端视觉识别)
    const images = (imageAtts && imageAtts.length) ? imageAtts.map(a => a.dataUrl) : [];

    // 维护多轮对话历史(不含 system),供后端拼接上下文
    this.chatHistory = this.chatHistory || [];
    this.chatHistory.push({ role: 'user', content: text });
    // 发送最近 20 条以维持上下文,同时避免超出模型上下文窗口
    const payload = this.chatHistory.slice(-20);
    const profile = this.buildPersonalAskProfile();
    // 优先走流式接口(低感知延迟);失败则回退非流式;v=20260922o 携带 images 数组(后端走 vision 分支)
    try {
      const streamed = await this._streamAsk(payload, mode, text, images, profile);
      if (streamed) return;
    } catch (e) {
      console.warn('流式回答失败，回退非流式：', e);
    }
    // ---- 回退：非流式 ----
    // v=20260824k 修复:fallback 路径也必须把 images 一并传给后端,否则视觉模型分支永远走不到
    try {
      const fallbackBody = { messages: payload, mode, system: this._buildModeSystemPrompt(mode) };
      if (images && images.length) fallbackBody.images = images;
      fallbackBody.profile = profile;
      const res = await Auth.fetchWithAuth('/api/ask', {
        method: 'POST',
        body: JSON.stringify(fallbackBody)
      });
      if (!res.ok) throw new Error('backend status ' + res.status);
      const data = await res.json();
      const answer = data.answer || '';
      const citations = data.citations || [];
      const sources = data.sources || [];
      // 溯源：出处 + RAG 命中（以结构化卡片呈现，见 _appendRagCards）
      let display = answer;
      if (citations.length) {
        display += '\n\n参考出处：\n' + citations.map(c => '• ' + c).join('\n');
      }
      this.chatHistory.push({ role: 'assistant', content: answer });
      this.hideTyping();
      // v=20260903h 快捷追问:非流式回退路径同样要把后端 followups 透传
      this.addBotMessage(display, 'llm', {
        sources, rag_used: data.rag_used,
        engine_verified: data.engine_verified, engine_task: data.engine_task,
        fallback: !!data.fallback, fallback_reason: data.fallback_reason || '',
        lastQuestion: text,
        followups: Array.isArray(data.followups) ? data.followups : []
      });
      // 会话式持久化：新建/追加到当前 session
      this._persistSessionTurn(text, answer, { mode, citations, sources, rag_used: data.rag_used });
    } catch (e) {
      const { intent, response } = ChatEngine.process(text, mode);
      this.chatHistory.push({ role: 'assistant', content: response });
      this.hideTyping();
      this.addBotMessage(response, intent);
      this._persistSessionTurn(text, response, { mode, citations: [], sources: [], rag_used: false });
    }
  };

  /**
   * 开启新对话：清空当前聊天区 + chatHistory + 重置 sessionId（下次首条消息会自动建新会话）
   */
App.chatStartNewSession = function chatStartNewSession() {
    this.currentSessionId = null;
    this.chatHistory = [];
    const messages = document.getElementById('chat-messages');
    if (messages) messages.innerHTML = '';
    const input = document.getElementById('chat-input');
    if (input) { input.value = ''; input.focus(); }
    // 显示空状态欢迎
    if (typeof this.showChatWelcome === 'function') this.showChatWelcome();
    this._adminToast && this._adminToast('🆕 已开启新对话', 'ok');
  };

  /** v=20260873 从兜底标签跳转到可验证求解引擎,并预选对应任务 */
App._taskFromQuestion = function _taskFromQuestion(q) {
    const t = String(q || '').toLowerCase();
    if (t.includes('逆') || t.includes('inverse')) return 'inverse';
    if (t.includes('行列式') || t.includes('det')) return 'det';
    if (t.includes('特征') || t.includes('eigen')) return 'eigen';
    if (t.includes('秩')) return 'rank';
    if (t.includes('对角')) return 'diagonalize';
    if (t.includes('qr')) return 'qr';
    if (t.includes('svd') || t.includes('奇异')) return 'svd';
    if (t.includes('零空间')) return 'nullspace';
    if (t.includes('方程') || t.includes('解')) return 'solve_linear';
    return 'inverse';
  };

  /** v=20260873 从兜底标签跳转到可验证求解引擎,并预选对应任务 */
App.goEngineTask = function goEngineTask(task) {
    this.switchView('engine');
    setTimeout(() => {
      const sel = document.getElementById('eng-task');
      if (!sel) return;
      // 任务 key 映射(兼容中文/简称)
      const map = {
        inverse: 'inverse', det: 'det', eigen: 'eigen', eigenvalues: 'eigen',
        rank: 'rank', diagonalize: 'diagonalize', qr: 'qr', svd: 'svd',
        nullspace: 'nullspace', solve_linear: 'solve_linear'
      };
      const key = map[task] || task || 'inverse';
      if ([...sel.options].some(o => o.value === key)) {
        sel.value = key;
        sel.dispatchEvent(new Event('change'));
      }
      const mx = document.getElementById('eng-matrix');
      if (mx) { mx.focus(); mx.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    }, 260);
  };

  /** v=20260873 重试上一次提问(LLM 恢复后一键重发) */
App.retryLastAsk = async function retryLastAsk() {
    const q = this._lastQuestion;
    if (!q) { this._adminToast && this._adminToast('暂无上次提问', 'warn'); return; }
    this._adminToast && this._adminToast('🔄 正在重试…', 'ok');
    await this.callTutor(q, this._lastMode || 'direct');
  };

  /**
   * 把当前轮 (user + ai) 追加到当前会话；无 session 则先创建（用首条提问作为标题来源）。
   * 静默失败，不影响聊天 UX。
   */
App._persistSessionTurn = async function _persistSessionTurn(userText, aiText, opts = {}) {
    try {
      if (!Auth.isLoggedIn) return;
      const citations = opts.citations || [];
      const sources = opts.sources || [];
      // v=20260824 修复 [object Object]:source 元素可能是对象(含 source/name 字段)或字符串,
      // 统一取字符串值,对象取 source||name,都不是则丢弃,避免 "对象.toString()" 序列化进库
      const relate = sources
        .map(s => (typeof s === 'string' ? s : ((s && (s.source || s.name)) || '')))
        .map(x => String(x).trim())
        .filter(Boolean)
        .slice(0, 8);
      // 1) 没有 sessionId → 先创建（用首条提问生成标题）
      if (!this.currentSessionId) {
        const cr = await Auth.fetchWithAuth('/api/chat/session/new', {
          method: 'POST',
          body: JSON.stringify({ first_question: userText })
        });
        if (cr.ok) {
          const d = await cr.json();
          this.currentSessionId = d.sessionId;
        }
      }
      // 2) 追加 user + ai 消息到当前会话
      if (!this.currentSessionId) return;
      await Auth.fetchWithAuth('/api/chat/session/' + this.currentSessionId + '/append', {
        method: 'POST',
        body: JSON.stringify({
          messages: [
            { role: 'user', content: userText, mode: opts.mode || 'direct' },
            { role: 'ai', content: aiText, mode: opts.mode || 'direct',
              rag_used: !!opts.rag_used, citations: citations.join('; ') }
          ],
          relate_knowledge: relate.join(',')
        })
      });
      // 3) 提问驱动掌握度：把本次涉及的知识点记为一次主动学习（静默失败）
      if (relate.length > 0) {
        try {
          Auth.fetchWithAuth('/api/student/record_question', {
            method: 'POST',
            body: JSON.stringify({ knowledge_points: relate, question: userText })
          }).catch(() => {});
        } catch (e) { /* 静默 */ }
      }
    } catch (e) { /* 静默：会话保存失败不影响聊天 */ }
  };

  // 流式回答消费：SSE 逐步渲染；出错则移除临时气泡并抛错，由 callTutor 回退
App._streamAsk = async function _streamAsk(payload, mode, text, images, profile) {
    // v=20260922o images 非空时,后端走多模态视觉模型分支(/_ask_stream_with_images)
    const body = { messages: payload, mode };
    if (images && images.length) body.images = images;
    if (profile) body.profile = profile;
    // v=20260824zf 三模式 system 提示词注入:确保后端大模型按用户当前模式输出
    // (解决"UI 选了分步讲解但后端仍走普通问答"的边界问题)
    body.system = this._buildModeSystemPrompt(mode);
    const bubbleEl = this._createStreamBubble();
    const bodyEl = bubbleEl.querySelector('.stream-body');
    const cursorEl = bubbleEl.querySelector('.stream-cursor');
    this.hideTyping();
    // v=20260920 超时提示:8s 未收到任何数据(冷启动/prefill)时显示"思考中"提示,避免用户以为卡死
    let gotData = false;
    const waitTipId = setTimeout(() => {
      if (gotData) return;
      if (!bodyEl) return;
      let tip = bodyEl.querySelector('.stream-wait-tip');
      if (!tip) {
        tip = document.createElement('div');
        tip.className = 'stream-wait-tip';
        tip.textContent = '⏳ AI 正在思考，首次回答可能需要一点时间（正在预热模型连接）…';
        bodyEl.appendChild(tip);
      }
    }, 8000);
    try {
      // v=20260824k 修复:原先缺少 fetch 调用,直接 throw 'resp is not defined' ReferenceError,
      // 触发外层 fallback 走 /api/ask(无 images 字段),RAG 命中「我无法看图」知识卡。
      // 补全 fetch → /api/ask/stream(带 images),让后端真正走多模态视觉模型分支。
      const resp = await Auth.fetchWithAuth('/api/ask/stream', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      if (!resp.ok) throw new Error('stream status ' + resp.status);
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let full = '';
      let finalEvt = null;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const raw = buf.slice(0, idx); buf = buf.slice(idx + 2);
          const dataLine = raw.split('\n').find(l => l.startsWith('data:'));
          if (!dataLine) continue;
          let evt; try { evt = JSON.parse(dataLine.slice(5).trim()); } catch (_) { continue; }
          if (evt.type === 'delta') {
            gotData = true;
            clearTimeout(waitTipId);
            const tip = bodyEl.querySelector('.stream-wait-tip');
            if (tip) tip.remove();
            full += evt.content;
            // v=20260828ui 状态机分段:已闭合 LaTeX 块立即渲染,未闭合块隐藏(避免半截 \begin 闪烁)
            const { closed, pending } = this.splitLatexByState(full);
            const safeText = pending
              ? closed + '<span class="latex-pending" data-pending-len="' + pending.length + '"></span>'
              : closed;
            bodyEl.innerHTML = this.markdownToHtml(safeText, { wrapCard: false });
            this.renderLatexInElement(bodyEl);
            this.scrollToBottom();
          } else if (evt.type === 'done') {
            finalEvt = evt;
          } else if (evt.type === 'error') {
            throw new Error(evt.message || '流式生成出错');
          }
        }
      }
      if (cursorEl) cursorEl.remove();
      clearTimeout(waitTipId);
      const citations = (finalEvt && finalEvt.citations) || [];
      const rawSources = (finalEvt && finalEvt.sources) || [];
      // v=20260921 P1 数据预校验:sources 必须为数组,且每条至少有一项非空白字段才算"有效来源"
      // 去除空字符串/空对象/无意义占位,防止后端遗漏输出空 entry
      const sources = Array.isArray(rawSources)
        ? rawSources.filter(s => s && typeof s === 'object' && (
            (s.chapter || s.source || s.section || s.snippet || '').toString().trim()
          )).map(s => ({
            chapter: (s.chapter || s.source || '').toString().trim(),
            section: (s.section || '').toString().trim(),
            snippet: (s.snippet || '').toString().trim(),
            kp: (s.kp || s.knowledge_point || '').toString().trim()
          }))
        : [];
      let display = full;
      // v=20260902j 后端 done 事件中的 answer 已经过 _flatten_matrix_to_latex 兜底(把压扁纯文本 → LaTeX 环境);
      // 优先采用后端 answer 覆盖流式累积,避免前端忽略了后端兜底导致压扁形式残留
      if (finalEvt && typeof finalEvt.answer === 'string' && finalEvt.answer.trim()) {
        display = finalEvt.answer;
      }
      if (citations.length) display += '\n\n参考出处：\n' + citations.map(c => '• ' + c).join('\n');
      const bubble = bubbleEl.querySelector('.bot-bubble');
      // v=20260872 流式降级标签;v=20260873 可点击展开详情/操作
      const _escA = s => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const fbHtml = (finalEvt && finalEvt.fallback)
        ? `<div class="chat-fallback-tag" title="${_escA(finalEvt.fallback_reason || '')}">⚠️ 离线兜底回答 · 大模型暂不可用 <span class="fb-more">详情 ▾</span></div>
           <div class="chat-fallback-panel" style="display:none">
             <div class="fbp-row">🔍 原因：${_escA(finalEvt.fallback_reason || '大模型服务未响应')}</div>
             <div class="fbp-actions">
               <button class="fbp-btn" data-fb-act="engine" data-fb-task="${_escA(this._taskFromQuestion(text || ''))}">🧮 用可验证引擎重算</button>
               <button class="fbp-btn" data-fb-act="retry">🔄 重试提问</button>
             </div>
           </div>`
        : '';
      bubble.innerHTML = fbHtml + this.markdownToHtml(display) + '<div class="ai-gen-tag">AI 生成</div>';
      this.renderLatexInElement(bubble);
      // 兜底标签交互
      if (finalEvt && finalEvt.fallback) {
        const tag = bubble.querySelector('.chat-fallback-tag');
        if (tag) tag.addEventListener('click', () => {
          const panel = bubble.querySelector('.chat-fallback-panel');
          if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        });
        bubble.querySelectorAll('.fbp-btn').forEach(btn => btn.addEventListener('click', e => {
          e.stopPropagation();
          if (btn.dataset.fbAct === 'engine') this.goEngineTask(btn.dataset.fbTask || 'inverse');
          if (btn.dataset.fbAct === 'retry') this.retryLastAsk();
        }));
      }
      // RAG 来源卡片 + 引擎徽标（流式路径）
      if (sources.length || (finalEvt && (finalEvt.engine_verified || finalEvt.engine_task))) {
        this._appendRagCards(bubbleEl, {
          sources, rag_used: finalEvt ? finalEvt.rag_used : false,
          engine_verified: finalEvt ? finalEvt.engine_verified : false,
          engine_task: finalEvt ? finalEvt.engine_task : ''
        });
      }
      // v=20260915 三模式通用后处理:所有模式都生成 目录 / 来源 / 拓展(短回答无目录,长回答自动生成)
      this._enrichStreamBubble(bubbleEl, text, sources);
      this.scrollToBubbleTop(bubbleEl);
      // v=20260915 引导学习模式:解析 AI 回复中的约定标记,渲染多轮交互 UI
      if (mode === 'guided') {
        this._applyGuidedMarks(bubbleEl, text);
      }
      // v=20260903h 快捷追问:SSE done 事件后调(流式过程不显示,符合约束)
      // 后端已在 done.answer 中剥离【快捷追问】原始标记,followups 是结构化数组
      let _fol = (finalEvt && Array.isArray(finalEvt.followups)) ? finalEvt.followups : [];
      // v=20260904 引导学习中间轮(AI 在引导提问/给提示)不显示追问按钮,避免与引导提问打架
      const _ansForFol = (finalEvt && finalEvt.answer) || full || '';
      const _isGuidedAsking = (mode === 'guided') && this._isGuidedPrompt(_ansForFol);
      if (!_fol.length && !_isGuidedAsking) {
        // v=20260903k 前端兜底:若后端未提供追问,前端根据用户问题+回答启发式生成,保证按钮必渲染
        try { _fol = this._heuristicFollowups(text, _ansForFol) || []; } catch (e) { console.warn('[followup-front-fallback]', e); }
      }
      // v=20260903p 追问去重:过滤掉与已问问题(含当前问题)相同/近似的追问,宁缺毋滥
      if (_fol.length) { try { _fol = this._filterDuplicateFollowups(_fol, text); } catch (e) { console.warn('[followup-dedup]', e); } }
      if (_fol.length && !_isGuidedAsking) { this._bindFollowups(bubbleEl, _fol); }
      // v=20260902m 流式完成 → 挂载底部操作栏(text/mode 来自 _streamAsk 闭包)
      this._bindActionBar(bubbleEl, {
        msgQuestion: text,
        msgMode: mode,
        msgAnswer: (finalEvt && finalEvt.answer) || full,
        msgId: bubbleEl.dataset.msgId || ('s' + Date.now().toString(36))
      });
      const answer = (finalEvt && finalEvt.answer) || full;
      this.chatHistory.push({ role: 'assistant', content: answer });
      this._persistSessionTurn(text, answer, { mode, citations, sources, rag_used: finalEvt ? finalEvt.rag_used : false });
      return true;
    } catch (e) {
      if (bubbleEl && bubbleEl.parentNode) bubbleEl.parentNode.removeChild(bubbleEl);
      throw e;
    }
  };

App._createStreamBubble = function _createStreamBubble() {
    const messages = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'message bot-message';
    // v=20260902m 临时 msgId,流式完成后操作栏绑定用
    div.dataset.msgId = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    div.innerHTML = '<div class="message-avatar bot-avatar">AI</div><div class="bot-bubble"><div class="stream-body"></div><span class="stream-cursor">▋</span></div>';
    messages.appendChild(div);
    return div;
  };

  /**
   * v=20260824zf 三种教学模式的 system 提示词
   * 强制后端大模型按当前按钮状态输出:
   *   direct   - 直接解答:简短思路+结果,不拆分大量步骤
   *   detailed - 分步讲解:严格编号步骤,每个步骤配套标准 LaTeX 公式
   *   guided   - 引导学习:不给完整答案,用提问/提示引导用户思考
   * 这样即使后端原本没有按模式分支,前端也会保证 mode 参数对齐 UI 选中状态
   */
App._buildModeSystemPrompt = function _buildModeSystemPrompt(mode) {
    const base = '你是一个自然、直接、像真人一样交流的 DeepSeek 助手，擅长线性代数、矩阵、行列式、特征值、向量空间等数学问题。';
    const common = '\n\n请像真人聊天一样自然表达：不要套模板，不要添加“出处/来源/知识库/参考文献”，不要强行加固定小标题。';
    if (mode === 'detailed') {
      return base + common + '\n\n当前是详细讲解：自然展开，把来龙去脉讲清楚；需要时用 LaTeX（行内 $...$，独立公式 $$...$$），但不要机械编号。';
    }
    if (mode === 'guided') {
      return base + common + '\n\n当前是引导学习：像助教一样一步步引导，先问一句再给提示，不要直接扔答案。';
    }
    return base + common + '\n\n当前是直接解答：先给核心结论，再自然补充关键思路，不要太长。';
  };

  // 静默保存问答历史（已被 _persistSessionTurn 会话式取代）
App._saveHistory = async function _saveHistory() { /* deprecated: see _persistSessionTurn */ };

App.addUserMessage = function addUserMessage(text, imageUrl) {
    const messages = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'message user-message';
    // v=20260922o 支持多图(imageUrl 可以是字符串或字符串数组)
    let imgHtml = '';
    if (imageUrl) {
      const imgs = Array.isArray(imageUrl) ? imageUrl : [imageUrl];
      if (imgs.length === 1) {
        imgHtml = `<img class="chat-msg-image" src="${imgs[0]}" alt="图片消息" loading="lazy" />`;
      } else if (imgs.length > 1) {
        imgHtml = `<div class="chat-msg-images">${imgs.map((u, i) => `<img class="chat-msg-image" src="${u}" alt="图片消息 ${i+1}" loading="lazy" />`).join('')}</div>`;
      }
    }
    const textHtml = text ? `<div class="message-text">${this.escapeHtml(text)}</div>` : '';
    div.innerHTML = `<div class="message-avatar user-avatar">你</div><div class="message-bubble user-bubble">${imgHtml}${textHtml}</div>`;
    messages.appendChild(div);
    // 渲染用户消息中的 LaTeX 公式
    const ub = div.querySelector('.user-bubble');
    if (ub) this.renderLatexInElement(ub);
    this.scrollToBottom();
  };

App.addBotMessage = function addBotMessage(text, intent, opts) {
    const messages = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'message bot-message';
    const htmlContent = this.markdownToHtml(text);
    // v=20260872 离线兜底标签;v=20260873 可点击展开详情/操作
    const _escA = s => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const fbHtml = (opts && opts.fallback)
      ? `<div class="chat-fallback-tag" title="${_escA(opts.fallback_reason || '')}">⚠️ 离线兜底回答 · 大模型暂不可用 <span class="fb-more">详情 ▾</span></div>
         <div class="chat-fallback-panel" style="display:none">
           <div class="fbp-row">🔍 原因：${_escA(opts.fallback_reason || '大模型服务未响应')}</div>
           <div class="fbp-actions">
             <button class="fbp-btn" data-fb-act="engine" data-fb-task="${_escA(this._taskFromQuestion(opts.lastQuestion || ''))}">🧮 用可验证引擎重算</button>
             <button class="fbp-btn" data-fb-act="retry">🔄 重试提问</button>
           </div>
         </div>`
      : '';
    div.innerHTML = `<div class="message-avatar bot-avatar">助</div><div class="message-bubble bot-bubble">${fbHtml}${htmlContent}<div class="ai-gen-tag">AI 生成</div></div>`;
    messages.appendChild(div);

    // 兜底标签交互:点击展开/收起 + 面板按钮动作
    if (opts && opts.fallback) {
      const tag = div.querySelector('.chat-fallback-tag');
      if (tag) tag.addEventListener('click', () => {
        const panel = div.querySelector('.chat-fallback-panel');
        if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      });
      div.querySelectorAll('.fbp-btn').forEach(btn => btn.addEventListener('click', e => {
        e.stopPropagation();
        if (btn.dataset.fbAct === 'engine') this.goEngineTask(btn.dataset.fbTask || 'inverse');
        if (btn.dataset.fbAct === 'retry') this.retryLastAsk();
      }));
    }

    // 渲染 LaTeX 公式
    const bubble = div.querySelector('.bot-bubble');
    if (bubble) this.renderLatexInElement(bubble);

    // RAG 知识来源卡片 + 引擎计算徽标（可视化呈现检索/工具调用）
    if (opts && (opts.sources?.length || opts.engine_verified || opts.engine_task)) {
      this._appendRagCards(div, opts);
    }

    this.scrollToBottom();

    // v=20260902m 挂载底部操作栏（7 个按钮:复制/朗读/点赞/点踩/分享/重新生成/更多）
    // greeting / fallback 等无 user question 的场景跳过(opts.noActionBar 或 msgQuestion 空)
    const _msgQ = (opts && opts.lastQuestion) || this._lastQuestion || '';
    if (_msgQ && (!opts || !opts.noActionBar)) {
      // v=20260903h 快捷追问(非流式回退路径同样支持)
      let _fol2 = (opts && Array.isArray(opts.followups)) ? opts.followups : [];
      const _m = this._lastMode || 'direct';
      const _isGuidedAsking2 = (_m === 'guided') && this._isGuidedPrompt(text || '');
      // v=20260903k 前端兜底
      if (!_fol2.length && !_isGuidedAsking2) {
        try { _fol2 = this._heuristicFollowups(_msgQ, text) || []; } catch (e) { console.warn('[followup-front-fallback]', e); }
      }
      // v=20260903p 追问去重
      if (_fol2.length) { try { _fol2 = this._filterDuplicateFollowups(_fol2, _msgQ); } catch (e) { console.warn('[followup-dedup]', e); } }
      if (_fol2.length && !_isGuidedAsking2) { this._bindFollowups(div, _fol2); }
      this._bindActionBar(div, {
        msgQuestion: _msgQ,
        msgMode: this._lastMode || 'direct',
        msgAnswer: text,
        msgId: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
      });
    }

    if (intent === 'calculate') {
      this.addVisualizationHint(div, text);
    }
  };

/** v=20260922 知识库溯源:RAG 知识库引用(右上角浮动按钮 + 弹窗)
   *  - 数据预校验:无有效来源时整个组件隐藏
   *  - 弹窗双向开关 / 点空白关闭 / 滚动关闭 / 绑定气泡定位
   *  - 弹窗内 LaTeX 正常渲染(KaTeX)、跳转拓扑图谱按钮
   *  - 仅保留引擎徽标(底部列表已迁移到 _enrichStreamBubble 之外)
   */
App._appendRagCards = function _appendRagCards(msgEl, opts) {
    const esc = (s) => { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; };
    // 1) 引擎计算徽标(保留原行为,不渲染 sources 列表)
    if (opts.engine_verified || opts.engine_task) {
      const badge = document.createElement('div');
      badge.className = 'rag-engine-badge';
      badge.innerHTML = `🧮 可验证求解引擎 ${opts.engine_task ? '· ' + esc(opts.engine_task) : ''}<span class="rag-engine-verified">✓ 已符号计算校验</span>`;
      msgEl.appendChild(badge);
    }
    // 2) 数据预校验:sources 必须为数组且至少一条有效
    const raw = (opts && opts.sources) || [];
    const validSources = Array.isArray(raw)
      ? raw.filter(s => s && typeof s === 'object' && (s.chapter || s.section || s.snippet || s.kp || s.source))
      : [];
    if (validSources.length === 0) return;  // 空数据 → 不渲染按钮(杜绝空弹窗)

    // 3) 确保 message 容器是 position: relative(弹窗定位锚)
    if (getComputedStyle(msgEl).position === 'static') {
      msgEl.style.position = 'relative';
    }
    // 4) 构造右上角 RAG 按钮(独占,不与已有 .rag-sources 冲突)
    const fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'rag-fab';
    fab.title = '查看本次回答的知识库来源';
    fab.innerHTML = `<span class="rag-fab-icon"><svg class="ic-inline" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><use href="#ic-book"/></svg></span><span class="rag-fab-label">RAG 知识库引用</span><span class="rag-fab-count">（${validSources.length}）</span>`;
    msgEl.appendChild(fab);

    // 5) 构造弹窗(默认隐藏,定位锚在按钮附近/卡片右上角)
    const pop = document.createElement('div');
    pop.className = 'rag-pop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', '知识库引用');
    pop.style.display = 'none';
    // 分组(弹窗内标题"知识库原文片段(N)";章节单独一个分组)
    const snippets = validSources.filter(s => s.snippet);
    const chapters = validSources.filter(s => !s.snippet && (s.chapter || s.section || s.kp || s.source));
    // 注意:弹窗内 LaTeX 渲染需要把片段作为"原始文本"放进 <span data-latex>,稍后统一 render
    // 片段里的 $...$ / $$...$$ 让 KaTeX auto-render 处理
    const _escAttr = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const renderItem = (s) => {
      const chapter = s.chapter || s.source || '相关章节';
      const section = s.section || '';
      const kp = s.kp || s.knowledge_point || s.chapter || '';
      // 片段用 <span data-latex-source> 保留原文,append 后单独 render(避免 esc 误伤 $ 符号)
      return `
        <div class="rag-pop-item" data-kp="${_escAttr(kp)}">
          <div class="rag-pop-item-head">
            <span class="rag-pop-chapter">${esc(chapter)}</span>
            ${section ? `<span class="rag-pop-section">${esc(section)}</span>` : ''}
            <button type="button" class="rag-pop-jump" data-kp="${_escAttr(kp)}" title="在知识点拓扑图谱中查看">🗺️ 拓扑图谱</button>
          </div>
          ${s.snippet ? `<div class="rag-pop-snippet" data-latex-source>${_escAttr(s.snippet)}</div>` : ''}
        </div>`;
    };
    let body = '';
    if (snippets.length) {
      body += `<div class="rag-pop-group">
        <div class="rag-pop-group-title">📖 知识库原文片段（${snippets.length}）</div>
        ${snippets.map(renderItem).join('')}
      </div>`;
    }
    if (chapters.length) {
      body += `<div class="rag-pop-group">
        <div class="rag-pop-group-title">📘 教材参考章节（${chapters.length}）</div>
        ${chapters.map(renderItem).join('')}
      </div>`;
    }
    pop.innerHTML = `
      <div class="rag-pop-head">
        <span class="rag-pop-title">🔍 知识库来源</span>
        <span class="rag-pop-count">共 ${validSources.length} 条</span>
        <button type="button" class="rag-pop-close" aria-label="关闭">✕</button>
      </div>
      <div class="rag-pop-body">${body}</div>`;
    msgEl.appendChild(pop);

    // 6) 弹窗定位(在按钮正下方偏左/卡片右上角):使用 position: absolute 相对 msgEl
    pop.style.position = 'absolute';
    pop.style.top = '12px';
    pop.style.right = '12px';
    pop.style.zIndex = '50';

    // 7) 双向开关:点击按钮切换显示;点 ✕ 关闭;点弹窗外关闭;滚动关闭
    // v=20260926 关闭时同时解绑文档级监听(_close 见下方定义,运行期一定已挂上)
    const closePop = () => {
      pop.style.display = 'none';
      fab.setAttribute('aria-expanded', 'false');
      if (pop._close) pop._close();
    };
    const togglePop = () => {
      const isOpen = pop.style.display !== 'none';
      if (isOpen) closePop();
      else {
        pop.style.display = 'block';
        fab.setAttribute('aria-expanded', 'true');
        // v=20260926 打开时才绑定"点空白/滚动关闭",保证关闭→再次打开后仍然生效
        if (pop._bindDismiss) pop._bindDismiss();
        // 渲染 LaTeX(弹窗刚显示,需要等 DOM 就绪)
        try {
          if (typeof this.renderLatexInElement === 'function') {
            this.renderLatexInElement(pop);
          } else if (window.renderMathInElement) {
            window.renderMathInElement(pop, { delimiters: [
              { left: '$$', right: '$$', display: true },
              { left: '\\[', right: '\\]', display: true },
              { left: '$', right: '$', display: false },
              { left: '\\(', right: '\\)', display: false }
            ], throwOnError: false });
          }
        } catch (e) { /* 静默 */ }
      }
    };
    fab.addEventListener('click', (e) => { e.stopPropagation(); togglePop(); });
    // ✕ 关闭
    const closeBtn = pop.querySelector('.rag-pop-close');
    if (closeBtn) closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closePop(); });
    // 点弹窗内不冒泡关闭
    pop.addEventListener('click', (e) => e.stopPropagation());
    // 弹窗内拓扑跳转按钮
    pop.querySelectorAll('.rag-pop-jump').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const kp = btn.getAttribute('data-kp');
        if (!kp) return;
        try { sessionStorage.setItem('la_topo_focus', kp); } catch (_) {}
        if (typeof this.switchView === 'function') this.switchView('topology');
        else if (typeof App !== 'undefined' && App.switchView) App.switchView('topology');
        closePop();
      });
    });
    // v=20260824 滚动关闭:仅弹窗外部滚动才关闭
    // 弹窗内 wheel/touchmove → stopPropagation + 内置 overflow-y auto 自己滚;
    // 弹窗外 wheel/touchmove → 关闭。
    // 注意:scroll 事件本身不冒泡,无法靠 stopPropagation 拦截,所以用 wheel/touchmove 替代
    const onOutsideScroll = (e) => {
      if (pop.style.display === 'none') return;
      // wheel/touchmove target 在 pop 内或 fab 内 → 不关
      if (pop.contains(e.target) || fab.contains(e.target)) return;
      closePop();
    };
    // 弹窗内滚 → 阻止冒泡到 document(避免外部误判)
    pop.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    pop.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: true });
    // 弹窗内点击 → 阻止冒泡(避免触发"点空白关闭")
    pop.addEventListener('click', (e) => e.stopPropagation());
    // v=20260926 根因修复:文档级监听改为"打开时绑定、关闭时解绑"。
    // 原来只在创建时注册、从不解绑(定义了 pop._close 却没人调用):每条回答都会在
    // document 上永久残留 3 个监听器(长会话内存泄漏),关闭后仍持续收到 wheel/touchmove。
    // bindDocDismiss 用 _dismissBound 做幂等保护,重复打开不会重复注册。
    const bindDocDismiss = () => {
      if (pop._dismissBound) return;
      pop._dismissBound = true;
      document.addEventListener('wheel', onOutsideScroll, { passive: true });
      document.addEventListener('touchmove', onOutsideScroll, { passive: true });
      // 文档级 click(点弹窗以外空白)关闭 — 延迟到下一个宏任务注册,
      // 避免"打开弹窗的那次点击"冒泡到 document 后立刻把它关掉
      setTimeout(() => {
        if (!pop._dismissBound) return;   // 期间已关闭 → 不再注册
        const onDocClick = (e) => {
          if (pop.style.display === 'none') return;
          if (pop.contains(e.target) || fab.contains(e.target)) return;
          closePop();
        };
        document.addEventListener('click', onDocClick);
        // 把监听器句柄挂到 pop 上,关闭时主动解绑(避免泄漏)
        pop._docClickHandler = onDocClick;
      }, 0);
    };
    // 关闭时解绑(幂等:未绑定直接返回,不会误删别人的监听)
    pop._close = () => {
      if (!pop._dismissBound) return;
      pop._dismissBound = false;
      document.removeEventListener('wheel', onOutsideScroll);
      document.removeEventListener('touchmove', onOutsideScroll);
      if (pop._docClickHandler) {
        document.removeEventListener('click', pop._docClickHandler);
        pop._docClickHandler = null;
      }
    };
    // 弹窗初始是隐藏的 → 创建时不注册监听,首次打开(togglePop)时才绑定
    pop._bindDismiss = bindDocDismiss;
  };

App.addVisualizationHint = function addVisualizationHint(msgEl, text) {
    const matrixMatch = text.match(/```\n\[\s*(-?[\d.]+),\s*(-?[\d.]+)\]\n\[\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\n```/);
    if (matrixMatch) {
      const hint = document.createElement('div');
      hint.className = 'viz-hint';
      hint.innerHTML = `<button class="viz-link" onclick="App.openMatrixViz(${matrixMatch[1]},${matrixMatch[2]},${matrixMatch[3]},${matrixMatch[4]})">📊 查看矩阵几何可视化</button>`;
      msgEl.appendChild(hint);
    }
  };

App.openMatrixViz = function openMatrixViz(a, b, c, d) {
    this.switchView('visualizer');
    document.getElementById('viz-matrix-a').value = a;
    document.getElementById('viz-matrix-b').value = b;
    document.getElementById('viz-matrix-c').value = c;
    document.getElementById('viz-matrix-d').value = d;
    this.updateTransformViz();
  };

App.showTyping = function showTyping() {
    const messages = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'message bot-message typing-indicator';
    div.id = 'typing';
    div.innerHTML = `<div class="message-avatar bot-avatar">AI</div><div class="message-bubble bot-bubble"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>`;
    messages.appendChild(div);
    this.scrollToBottom();
  };

App.hideTyping = function hideTyping() {
    document.getElementById('typing')?.remove();
  };

App.scrollToBottom = function scrollToBottom() {
    const messages = document.getElementById('chat-messages');
    messages.scrollTop = messages.scrollHeight;
    // v=20260903e 移动端回到底部按钮状态同步
    if (typeof this._chatUpdateBack === 'function') this._chatUpdateBack();
  };

  /* ═══ v=20260908c 移动端底部栏自动收起 ═══ */
  // 收起底部两栏(教学模式栏 + 快捷问题条)
