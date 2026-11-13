/* app-02-admin.js —— 原 js/app.v3.19.js 第 586–1678 行拆分（2026-09-11 模块化）。
 * 成员以 App.xxx 赋值形式挂载到全局 App 对象，加载顺序见 index.html。*/
App.initEngine = function initEngine() {
    App.Engine.init();
  };

  // ═══════════ 管理后台（仅 admin） ═══════════
App.adminLoadStats = async function adminLoadStats() {
    const box = document.getElementById('admin-stats');
    if (!box) return;
    try {
      const resp = await Auth.fetchWithAuth('/api/admin/stats');
      if (!resp.ok) throw new Error('权限不足');
      const d = await resp.json();
      const cards = [
        { icon: '👥', label: '注册用户', value: d.total_users, badge: '今日 +' + (d.new_users_today || 0), tip: '平台累计注册用户总数；"今日 +N" 为当天 0 点起新增注册人数', accent: true },
        { icon: '💬', label: '累计问答', value: d.total_chats, badge: '今日 ' + (d.chats_today || 0), tip: '用户与 AI 助手累计问答次数（含游客试用）' },
        { icon: '📝', label: '错题记录', value: d.total_mistakes, badge: '已入库', tip: '统计用户错题入库数量，即测试中心收录的错题总数' },
        { icon: '🔢', label: 'AI Token 消耗', value: ((d.prompt_tokens || 0) + (d.completion_tokens || 0)).toLocaleString(), badge: '积分消耗 ' + (d.cost_tokens || 0), tip: '调用大模型累计消耗的 Token 数（输入 + 输出）' },
        { icon: '🎫', label: '积分池', value: d.credits_total, badge: '已消费 ' + (d.credits_consumed || 0), tip: '平台所有用户积分余额总和；"已消费" 为累计消耗' },
        { icon: '🟢', label: '活跃用户 / 封禁用户', value: '【' + d.active_users + ' / ' + d.banned_users + '】', badge: '今日活跃 ' + (d.today_active_users || 0), tip: '活跃用户 = 状态正常、可正常登录的账号数；封禁用户 = 被管理员封禁的账号数；今日活跃 = 今天有登录记录的账号数' },
      ];
      box.innerHTML = cards.map(c => `
        <div class="admin-stat-card" data-tip="${c.tip}">
          <div class="admin-stat-head">
            <span class="admin-stat-icon">${c.icon}</span>
            ${c.badge ? `<span class="admin-stat-badge${c.accent ? ' accent' : ''}">${c.badge}</span>` : ''}
          </div>
          <div class="admin-stat-value">${c.value}</div>
          <div class="admin-stat-label">${c.label}</div>
          <div class="admin-stat-tip">${c.tip}</div>
        </div>`).join('');
    } catch (e) {
      box.innerHTML = '<div style="color:var(--error);font-size:14px;padding:12px;">⚠️ 加载统计失败（' + (e.message || e) + '）</div>';
    }
  };

  // ═══════════ 管理后台 Tab 切换 ═══════════
App.adminSwitchTab = function adminSwitchTab(tab) {
    document.querySelectorAll('#admin-tabs .admin-tab').forEach(t => t.classList.toggle('active', t.dataset.adminTab === tab));
    const overview = document.getElementById('admin-tab-overview');
    const users = document.getElementById('admin-tab-users');
    const dev = document.getElementById('admin-tab-dev');
    if (overview) overview.style.display = tab === 'overview' ? '' : 'none';
    if (users) users.style.display = tab === 'users' ? '' : 'none';
    if (dev) dev.style.display = tab === 'dev' ? '' : 'none';
    if (tab === 'overview' && typeof this.adminLoadStats === 'function') this.adminLoadStats();
    if (tab === 'users' && typeof this.adminLoadUsers === 'function') this.adminLoadUsers(1);
    if (tab === 'dev' && typeof this.devLoadDashboard === 'function') this.devLoadDashboard();
  };

  // ═══════════ 开发者控制台（Dev Console）═══════════
App.devLoadDashboard = async function devLoadDashboard() {
    const box = document.getElementById('dev-content');
    if (!box) return;
    box.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-tertiary);">⏳ 加载开发者控制台…</div>';
    try {
      const resp = await Auth.fetchWithAuth('/api/dev/dashboard');
      if (!resp.ok) throw new Error('权限不足或接口异常');
      const d = await resp.json();
      const _esc = s => String(s ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const c = d.config || {};
      const t = d.token_usage || {};
      const tables = d.tables || [];
      const tr = d.train || {};
      // 近 7 天最大 token 数(用于柱状图比例)
      const days = t.last_7_days || [];
      const maxDay = Math.max(1, ...days.map(x => x.tokens || 0));
      const tokTotal = (t.total_prompt || 0) + (t.total_completion || 0);

      box.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:14px;margin-bottom:12px;align-items:center;">
        <h2 style="font-size:16px;font-weight:700;margin:0;">🧪 开发者控制台</h2>
        <span style="font-size:12px;color:var(--text-tertiary);">管理员专属 · 在线更换 API · Token 监控 · 自进化训练控制 · 数据库浏览</span>
        <button onclick="App.devLoadDashboard()" style="margin-left:auto;padding:7px 14px;border:1px solid var(--border);border-radius:8px;background:var(--surface-elevated);color:var(--text);cursor:pointer;font-size:13px;transition:all .15s;" onmouseover="this.style.background='var(--primary-light)';this.style.color='var(--primary)';" onmouseout="this.style.background='var(--surface-elevated)';this.style.color='var(--text)';">🔄 全部刷新</button>
      </div>

      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;padding:10px 14px;background:var(--primary-light);border-radius:10px;align-items:center;font-size:12.5px;">
        <b style="color:var(--primary);font-size:13px;">⚡ 快速操作</b>
        <button onclick="App.devTestLLM()" style="padding:5px 12px;border:1px solid var(--primary);border-radius:6px;background:var(--surface);color:var(--primary);cursor:pointer;font-size:12px;">🔗 ping LLM</button>
        <button onclick="App.devBalance()" style="padding:5px 12px;border:1px solid var(--primary);border-radius:6px;background:var(--surface);color:var(--primary);cursor:pointer;font-size:12px;">💰 刷新余额</button>
        <button onclick="App.devExportTable('token_usage')" style="padding:5px 12px;border:1px solid var(--primary);border-radius:6px;background:var(--surface);color:var(--primary);cursor:pointer;font-size:12px;">📥 导出用量</button>
        <button onclick="App.adminExportCSV()" style="padding:5px 12px;border:1px solid var(--primary);border-radius:6px;background:var(--surface);color:var(--primary);cursor:pointer;font-size:12px;">📥 导出用户</button>
        <button onclick="App.devShowSnapshots()" style="padding:5px 12px;border:1px solid var(--primary);border-radius:6px;background:var(--surface);color:var(--primary);cursor:pointer;font-size:12px;">📦 查看快照</button>
        <button onclick="App.devToggleLog()" style="padding:5px 12px;border:1px solid var(--primary);border-radius:6px;background:var(--surface);color:var(--primary);cursor:pointer;font-size:12px;">📜 训练日志</button>
        <span style="margin-left:auto;color:var(--text-tertiary);font-size:11px;">⚠ 所有操作均不影响训练进程与历史数据</span>
      </div>

      <div class="dev-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px;">
        <!-- ① 模型与密钥配置 -->
        <div class="admin-card" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:18px;">
          <h3 style="font-size:14px;font-weight:700;margin-bottom:12px;">🔑 模型与密钥配置</h3>
          <div style="display:flex;flex-direction:column;gap:8px;font-size:13px;">
            <div style="display:flex;justify-content:space-between;gap:8px;"><span style="color:var(--text-secondary);">问答模型</span><b>${_esc(c.llm_model)}</b></div>
            <div style="display:flex;justify-content:space-between;gap:8px;"><span style="color:var(--text-secondary);">Base URL</span><b style="word-break:break-all;text-align:right;">${_esc(c.llm_base_url || '默认')}</b></div>
            <div style="display:flex;justify-content:space-between;gap:8px;"><span style="color:var(--text-secondary);">API Key</span><b>${_esc(c.llm_api_key_masked || '未配置')}</b></div>
            <div style="display:flex;justify-content:space-between;gap:8px;"><span style="color:var(--text-secondary);">视觉模型</span><b style="color:${c.vision_status && c.vision_status.indexOf('✅')>=0 ? '#10b981' : '#f59e0b'};">${_esc(c.vision_status || '⚠️ 未配置')}</b></div>
            <div style="display:flex;justify-content:space-between;gap:8px;"><span style="color:var(--text-secondary);">视觉引擎</span><b>${_esc(c.vision_engine || '-')}</b></div>
            <div style="display:flex;justify-content:space-between;gap:8px;"><span style="color:var(--text-secondary);">视觉模型名</span><b>${_esc(c.vision_model || '未配置')}</b></div>
            <div style="display:flex;justify-content:space-between;gap:8px;"><span style="color:var(--text-secondary);">视觉 Base URL</span><b style="word-break:break-all;text-align:right;font-size:11px;">${_esc(c.vision_base_url || '未配置')}</b></div>
            ${c.spark_configured ? `
            <div style="display:flex;justify-content:space-between;gap:8px;"><span style="color:var(--text-secondary);">Spark APPID</span><b>${_esc(c.spark_appid_masked || '未配置')}</b></div>
            <div style="display:flex;justify-content:space-between;gap:8px;"><span style="color:var(--text-secondary);">Spark APIKey</span><b>${_esc(c.spark_api_key_masked || '未配置')}</b></div>
            <div style="display:flex;justify-content:space-between;gap:8px;"><span style="color:var(--text-secondary);">Spark Secret</span><b>${_esc(c.spark_secret_masked || '未配置')}</b></div>
            <div style="display:flex;justify-content:space-between;gap:8px;"><span style="color:var(--text-secondary);">Spark Domain</span><b>${_esc(c.spark_domain || 'image')}</b></div>
            ` : ''}
            <div style="display:flex;justify-content:space-between;gap:8px;"><span style="color:var(--text-secondary);">本地 OCR</span><b>${c.ocr_available ? '✅ RapidOCR 就绪' : '⚠️ ' + (c.ocr_engine || '未加载')}</b></div>
            <div style="display:flex;justify-content:space-between;gap:8px;"><span style="color:var(--text-secondary);">Few-shot 样例</span><b>${c.fewshot_count ?? 0} 条</b></div>
            <div style="display:flex;justify-content:space-between;gap:8px;"><span style="color:var(--text-secondary);">RAG 引擎</span><b>${c.rag_available ? '✅ 可用' : '❌ 未加载'}</b></div>
          </div>
          <div style="margin-top:12px;border-top:1px dashed var(--border);padding-top:12px;display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;gap:8px;"><input id="dev-llm-model" placeholder="模型 (如 deepseek-chat)" value="${_esc(c.llm_model)}" style="flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;"></div>
            <div style="display:flex;gap:8px;"><input id="dev-llm-url" placeholder="Base URL (留空=不修改)" style="flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;"></div>
            <div style="display:flex;gap:8px;"><input id="dev-llm-key" type="password" placeholder="新 API Key (留空=不修改)" style="flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;"></div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button onclick="App.devTestLLM()" style="flex:1;min-width:120px;padding:9px;border:1px solid var(--primary);border-radius:8px;background:var(--surface);color:var(--primary);cursor:pointer;font-size:13px;font-weight:600;">🔗 测试连接</button>
              <button onclick="App.devTestVision()" style="flex:1;min-width:120px;padding:9px;border:1px solid #7c3aed;border-radius:8px;background:var(--surface);color:#7c3aed;cursor:pointer;font-size:13px;font-weight:600;">🖼️ 测试视觉</button>
              <button onclick="App.devSaveLLM()" style="flex:2;min-width:180px;padding:9px;border:none;border-radius:8px;background:var(--primary);color:#fff;cursor:pointer;font-size:13px;font-weight:600;">💾 在线保存并生效（写 .env + 热更新，无需重启）</button>
            </div>
            <div id="dev-llm-msg" style="font-size:11.5px;margin-top:4px;"></div>
            <div id="dev-vision-msg" style="font-size:11.5px;margin-top:4px;"></div>
          </div>
        </div>

        <!-- ② Token 用量与余额监控 -->
        <div class="admin-card" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:18px;">
          <h3 style="font-size:14px;font-weight:700;margin-bottom:12px;">🔢 Token 用量 & 剩余额度
            <button onclick="App.devBalance()" style="margin-left:8px;padding:3px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface-elevated);color:var(--primary);cursor:pointer;font-size:11px;">🔄 实时查询余额</button>
          </h3>
          <div id="dev-balance-box" style="margin-bottom:12px;font-size:12px;color:var(--text-tertiary);">⏳ 正在查询 API 剩余额度…</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
            <div style="background:var(--primary-light);border-radius:10px;padding:12px;text-align:center;">
              <div style="font-size:20px;font-weight:800;color:var(--primary);">${(tokTotal).toLocaleString()}</div>
              <div style="font-size:12px;color:var(--text-secondary);">累计消耗 Token</div>
            </div>
            <div style="background:var(--surface-elevated);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center;">
              <div style="font-size:20px;font-weight:800;color:var(--primary);">${((t.today_prompt || 0) + (t.today_completion || 0)).toLocaleString()}</div>
              <div style="font-size:12px;color:var(--text-secondary);">今日消耗</div>
            </div>
          </div>
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;">近 7 天趋势 · 共 ${(t.last_7_days || []).reduce((a, x) => a + (x.tokens || 0), 0).toLocaleString()} tokens</div>
          <div style="display:flex;align-items:flex-end;gap:4px;height:70px;">
            ${days.map((x, i) => {
              const isToday = i === days.length - 1;
              const h = Math.max(4, Math.round((x.tokens || 0) / maxDay * 100));
              const grad = isToday
                ? 'linear-gradient(180deg,var(--primary-light),var(--primary))'
                : 'linear-gradient(180deg,var(--primary-light),var(--primary-dark))';
              const shadow = isToday ? '0 0 8px var(--primary-glow);' : '';
              return `<div title="${x.date}: ${(x.tokens || 0).toLocaleString()} tokens${isToday ? ' (今天)' : ''}" style="flex:1;background:${grad};border-radius:4px 4px 0 0;height:${h}%;min-width:18px;box-shadow:${shadow};transition:all .3s ease;position:relative;"></div>`;
            }).join('')}
          </div>
          <div style="display:grid;grid-template-columns:repeat(${days.length},1fr);gap:4px;margin-top:6px;">
            ${days.map((x, i) => {
              const isToday = i === days.length - 1;
              return `<div style="font-size:10px;color:${isToday ? 'var(--primary)' : 'var(--text-tertiary)'};text-align:center;font-weight:${isToday ? '700' : '400'};">${x.date.slice(5)}${isToday ? '★' : ''}</div>`;
            }).join('')}
          </div>
          <div style="font-size:12px;color:var(--text-secondary);margin:10px 0 4px;">按模型分组</div>
          ${(t.by_model || []).length ? (t.by_model || []).map(m => `
            <div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px dashed var(--border);">
              <span>${_esc(m.model)}</span><b>${((m.prompt || 0) + (m.completion || 0)).toLocaleString()} tokens</b>
            </div>`).join('') : '<div style="font-size:12px;color:var(--text-tertiary);">暂无用量记录（提问后自动统计）</div>'}
        </div>

        <!-- ③ 自进化训练控制(升级版: 进度/时长/异常/成果) -->
        <div class="admin-card" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:18px;">
          <h3 style="font-size:14px;font-weight:700;margin-bottom:12px;">🤖 离线挂机自进化训练
            <span style="font-size:11px;color:var(--text-tertiary);font-weight:400;">· 实时监测(ms 级轮询)</span>
          </h3>
          <!-- 状态横幅 -->
          <div id="dev-train-banner" style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:10px;margin-bottom:12px;font-weight:700;font-size:14px;
            ${tr.running ? 'background:var(--success-light);color:var(--success);' : 'background:var(--error-light);color:var(--error);'}">
            <span style="font-size:20px;">${tr.running ? '🟢' : '⏸️'}</span>
            <span>${tr.running ? '训练运行中' : '训练已停止'}</span>
            <span style="margin-left:auto;font-size:12px;font-weight:400;opacity:.85;" id="dev-train-banner-sub">${tr.running ? '每 ' + (tr.interval || 600) + 's 一轮' : '点击 ▶ 启动离线挂机训练'}</span>
          </div>
          <!-- 突发异常 -->
          <div id="dev-train-error" style="display:none;background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;border-radius:8px;padding:8px 12px;font-size:12px;margin-bottom:10px;font-weight:600;"></div>
          <!-- 进度区 -->
          <div style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary);margin-bottom:4px;">
              <span id="dev-train-round-label">第 <b style="color:var(--primary);">${tr.current_round || 0}</b> 轮 ${tr.target_rounds ? '/ 共 ' + tr.target_rounds + ' 轮' : '(无限)'}</span>
              <span id="dev-train-timer" style="font-variant-numeric:tabular-nums;">已执行 ${tr.elapsed || '00:00:00'} · 本轮 ${tr.round_elapsed || '00:00:00'}</span>
            </div>
            <div style="position:relative;height:24px;background:linear-gradient(180deg,var(--border-light),var(--surface));border-radius:8px;overflow:hidden;box-shadow:inset 0 1px 2px rgba(0,0,0,0.06);">
              <div id="dev-train-progress" style="height:100%;width:${tr.target_rounds ? Math.min(100, (tr.current_round / tr.target_rounds) * 100) : 4}%;background:var(--primary-gradient);border-radius:8px;transition:width .9s cubic-bezier(.4,0,.2,1);position:relative;overflow:hidden;">
                <div style="position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.35),transparent);animation:devShine 2.4s linear infinite;"></div>
              </div>
              <div id="dev-train-progress-label" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:13.5px;font-weight:800;color:var(--primary);letter-spacing:.5px;text-shadow:0 1px 2px rgba(255,255,255,0.9),0 0 4px rgba(255,255,255,0.8);font-variant-numeric:tabular-nums;">0.0%</div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-tertiary);margin-top:4px;">
              <span id="dev-train-total">预计总时长 ${tr.expected_total || '∞'}</span>
              <span id="dev-train-remain">剩余 ${tr.remaining_rounds ?? 0} 轮</span>
            </div>
          </div>
          <!-- 统计卡 -->
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">
            <div style="text-align:center;background:var(--surface-elevated);border:1px solid var(--border);border-radius:10px;padding:10px;">
              <div style="font-size:16px;font-weight:800;color:var(--primary);">${tr.self_trained_count || 0}</div>
              <div style="font-size:11px;color:var(--text-secondary);">自进化 few-shot</div>
            </div>
            <div style="text-align:center;background:var(--surface-elevated);border:1px solid var(--border);border-radius:10px;padding:10px;">
              <div style="font-size:16px;font-weight:800;color:var(--primary);">${tr.self_corpus_count || 0}</div>
              <div style="font-size:11px;color:var(--text-secondary);">自进化语料</div>
            </div>
            <div style="text-align:center;background:var(--surface-elevated);border:1px solid var(--border);border-radius:10px;padding:10px;">
              <div style="font-size:16px;font-weight:800;color:var(--primary);">${tr.training_count || 0} / ${tr.corpus_count || 0}</div>
              <div style="font-size:11px;color:var(--text-secondary);">训练库 / 语料库</div>
            </div>
          </div>
          <!-- v=20260891 环境诊断(回答"为何无法训练") -->
          <div id="dev-train-env" style="display:none;margin-bottom:10px;background:#f8fafc;border:1px solid var(--border-light);border-radius:10px;padding:10px 12px;font-size:12px;line-height:1.9;"></div>
          <!-- v=20260891 累计统计: 入库/通过/拒绝/通过率 -->
          <div id="dev-train-totals" style="display:none;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px;"></div>
          <!-- 训练成果(最近一轮) -->
          <div id="dev-train-result" style="display:none;font-size:12px;color:var(--text-secondary);background:var(--primary-light);border-radius:8px;padding:8px 12px;margin-bottom:10px;line-height:1.8;"></div>
          <!-- v=20260866 训练效果曲线(语料增长 + 每轮入库) -->
          <div id="dev-train-chart-wrap" style="display:none;margin-bottom:12px;background:var(--surface-elevated);border:1px solid var(--border-light);border-radius:12px;padding:12px 14px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:12.5px;font-weight:700;color:var(--text);">
              📈 训练效果曲线
              <span style="font-size:11px;color:var(--text-tertiary);font-weight:400;">语料库总量随轮次增长</span>
              <div style="margin-left:auto;display:flex;gap:10px;font-size:11px;font-weight:500;flex-wrap:wrap;">
                <span><span style="display:inline-block;width:10px;height:3px;background:var(--primary);border-radius:2px;vertical-align:middle;margin-right:4px;"></span>语料总量</span>
                <span><span style="display:inline-block;width:10px;height:3px;background:#10b981;border-radius:2px;vertical-align:middle;margin-right:4px;"></span>每轮入库</span>
                <span><span style="display:inline-block;width:10px;height:3px;background:#f59e0b;border-radius:2px;vertical-align:middle;margin-right:4px;"></span>每轮通过</span>
                <span><span style="display:inline-block;width:10px;height:3px;background:#ef4444;border-radius:2px;vertical-align:middle;margin-right:4px;opacity:.65;"></span>每轮拒绝</span>
              </div>
            </div>
            <canvas id="dev-train-chart" width="640" height="160" style="width:100%;height:auto;display:block;"></canvas>
          </div>
          <!-- 控制按钮: 启停醒目 -->
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
            <button onclick="App.devTrainStart()" style="flex:1;min-width:110px;padding:11px 16px;border:none;border-radius:10px;background:var(--success);color:#fff;cursor:pointer;font-size:14px;font-weight:800;box-shadow:0 4px 12px rgba(22,163,74,.35);">▶ 开始训练</button>
            <button onclick="App.devTrainStop()" style="flex:1;min-width:110px;padding:11px 16px;border:none;border-radius:10px;background:var(--error);color:#fff;cursor:pointer;font-size:14px;font-weight:800;box-shadow:0 4px 12px rgba(220,38,38,.35);">⏹ 停止训练</button>
            <select id="dev-train-speed" style="padding:9px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);font-size:13px;">
              <option value="300">🚀 快速（5 分钟/轮）</option>
              <option value="600" selected>🚗 标准（10 分钟/轮）</option>
              <option value="1800">🐢 省流（30 分钟/轮）</option>
            </select>
            <button onclick="App.devTrainSpeed()" style="padding:9px 16px;border:1px solid var(--border);border-radius:10px;background:var(--surface-elevated);color:var(--text);cursor:pointer;font-size:13px;">调节速度</button>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button onclick="App.devToggleLog()" style="padding:7px 14px;border:1px solid var(--border);border-radius:8px;background:var(--surface-elevated);color:var(--text);cursor:pointer;font-size:12px;">📜 查看训练日志</button>
            <button onclick="App.devShowSnapshots()" style="padding:7px 14px;border:1px solid var(--border);border-radius:8px;background:var(--surface-elevated);color:var(--text);cursor:pointer;font-size:12px;">📦 查看快照历史</button>
            <span style="font-size:11px;color:var(--text-tertiary);align-self:center;">最近快照: <b>${_esc(tr.last_version || '—')}</b></span>
          </div>
          <pre id="dev-train-log" style="display:none;margin-top:8px;max-height:240px;overflow:auto;background:var(--primary-light);color:var(--text);border:1px solid var(--border-light);border-radius:10px;padding:14px 16px;font-size:12.5px;line-height:1.7;font-family:'SF Mono','Menlo','Consolas',monospace;box-shadow:inset 0 1px 0 rgba(255,255,255,0.4);"></pre>
          <div id="dev-train-msg" style="font-size:12px;color:var(--text-tertiary);margin-top:8px;"></div>
        </div>

        <!-- ④ 数据库浏览器 -->
        <div class="admin-card" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:18px;">
          <h3 style="font-size:14px;font-weight:700;margin-bottom:12px;">🗄️ 数据库浏览器 <span style="font-size:11px;color:var(--text-tertiary);font-weight:400;">敏感列已自动脱敏</span></h3>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">
            ${tables.map(x => `<button data-name="${_esc(x.table)}" onclick="App.devOpenTable('${x.table}')" class="dev-db-table-btn" style="padding:5px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface-elevated);color:var(--text);cursor:pointer;font-size:12px;transition:all .15s;">${_esc(x.table)}<b style="margin-left:6px;color:var(--primary);">${x.rows}</b></button>`).join('')}
          </div>
          <div id="dev-db-view"><div style="font-size:12px;color:var(--text-tertiary);">点击上方表名查看数据</div></div>
        </div>
      </div>`;
      // 渲染完成后:立即拉一次实时状态(避免初始 00:00:00 闪烁)+ 查询余额 + 启动 ms 级训练轮询
      this.devUpdateTrainStatus();
      this.devBalance();
      this.devStartTrainPolling();
    } catch (e) {
      box.innerHTML = '<div style="color:var(--error);padding:20px;">⚠️ 开发者控制台加载失败：' + this.escapeHtml(e.message || e) + '</div>';
    }
  };

  /** 实时查询 API 账户剩余额度(DeepSeek /user/balance) */
App.devBalance = async function devBalance() {
    const box = document.getElementById('dev-balance-box');
    if (!box) return;
    box.innerHTML = '<span>⏳ 正在查询 API 剩余额度…</span>';
    try {
      const resp = await Auth.fetchWithAuth('/api/dev/balance');
      const d = await resp.json();
      if (d.supported && d.balance_infos && d.balance_infos.length) {
        const b = d.balance_infos[0];
        box.innerHTML = `
          <div style="display:flex;align-items:center;gap:12px;background:var(--success-light);border:1px solid #a7f3d0;border-radius:10px;padding:10px 14px;flex-wrap:wrap;">
            <span style="font-size:18px;">💰</span>
            <div>
              <div style="font-size:18px;font-weight:800;color:var(--success);">¥ ${b.total_balance || '0.00'}</div>
              <div style="font-size:11px;color:var(--text-secondary);">API 账户剩余额度(${b.currency || 'CNY'}${d.is_available ? '' : ' · 不可用'})</div>
            </div>
            <div style="margin-left:auto;font-size:11px;color:var(--text-tertiary);">
              充值 ${b.topped_up_balance || '0.00'} · 赠送 ${b.granted_balance || '0.00'}
              <div>查询时间 ${new Date().toLocaleTimeString('zh-CN')}</div>
            </div>
          </div>`;
      } else {
        box.innerHTML = `<div style="background:var(--surface-elevated);border:1px dashed var(--border);border-radius:10px;padding:10px 14px;font-size:12px;color:var(--text-secondary);">
          ⚠️ ${this.escapeHtml(d.message || '该 API 不支持官方余额查询')}<br>
          <span style="color:var(--text-tertiary);">提示:可用「累计消耗 Token」估算;或在下方设置「总额度」手动估算剩余。</span>
        </div>`;
      }
    } catch (e) {
      box.innerHTML = '<span style="color:var(--error);">⚠️ 余额查询失败:' + this.escapeHtml(e.message || e) + '</span>';
    }
  };

  /** 启动 1s 级训练状态轮询(只更新动态字段,不重绘整页) */
App.devStartTrainPolling = function devStartTrainPolling() {
    if (this._devTrainTimer) clearInterval(this._devTrainTimer);
    this._devTrainTimer = setInterval(() => {
      // 仅在开发者控制台可见时轮询
      if (!document.getElementById('admin-tab-dev') || document.getElementById('admin-tab-dev').style.display === 'none') return;
      this.devUpdateTrainStatus();
    }, 1000);
  };

  /** 更新训练卡动态字段(轮次/时长/异常/成果) */
App.devUpdateTrainStatus = async function devUpdateTrainStatus() {
    try {
      const resp = await Auth.fetchWithAuth('/api/dev/train/status');
      if (!resp.ok) return;
      const s = await resp.json();
      // 横幅
      const banner = document.getElementById('dev-train-banner');
      if (banner) {
        banner.style.background = s.running ? 'var(--success-light)' : 'var(--error-light)';
        banner.style.color = s.running ? 'var(--success)' : 'var(--error)';
        banner.innerHTML = `<span style="font-size:20px;">${s.running ? '🟢' : '⏸️'}</span>
          <span>${s.running ? '训练运行中' : '训练已停止'}</span>
          <span style="margin-left:auto;font-size:12px;font-weight:400;opacity:.85;">${s.running ? '每 ' + (s.interval || 600) + 's 一轮' : '点击 ▶ 启动离线挂机训练'}</span>`;
      }
      // 轮次与时长
      const rl = document.getElementById('dev-train-round-label');
      if (rl) rl.innerHTML = `第 <b style="color:var(--primary);">${s.current_round || 0}</b> 轮 ${s.target_rounds ? '/ 共 ' + s.target_rounds + ' 轮' : '(无限)'}`;
      const tm = document.getElementById('dev-train-timer');
      if (tm) tm.textContent = `已执行 ${s.elapsed || '00:00:00'} · 本轮 ${s.round_elapsed || '00:00:00'}`;
      const tl = document.getElementById('dev-train-total');
      if (tl) tl.textContent = `预计总时长 ${s.expected_total || '∞'}`;
      const rm = document.getElementById('dev-train-remain');
      if (rm) rm.textContent = `剩余 ${s.remaining_rounds ?? 0} 轮`;
      const pg = document.getElementById('dev-train-progress');
      const pl = document.getElementById('dev-train-progress-label');
      if (pg) {
        let pct;
        if (s.target_rounds) {
          // 有目标轮次:总进度(已完成 / 目标)
          pct = Math.min(100, ((s.current_round || 0) / s.target_rounds) * 100);
        } else {
          // 无限模式:本轮进度(已耗时 / 间隔)
          const interval = Math.max(60, parseInt(s.interval) || 600);
          const cur = parseFloat((s.round_elapsed || '00:00:00').split(':').reduce((a, t) => a * 60 + parseFloat(t), 0));
          pct = Math.min(100, (cur / interval) * 100);
        }
        pg.style.width = pct.toFixed(2) + '%';
        // 只渲染粗体主题色百分比数字,不带"本轮"文案
        if (pl) {
          pl.textContent = pct.toFixed(1) + '%';
          pl.style.color = 'var(--primary)';
        }
      }
      // 突发异常
      const err = document.getElementById('dev-train-error');
      if (err) {
        if (s.last_error) {
          err.style.display = 'block';
          err.textContent = '🚨 突发异常：' + s.last_error;
        } else {
          err.style.display = 'none';
        }
      }
      // 训练成果(最近一轮)
      const res = document.getElementById('dev-train-result');
      if (res && s.last_round_result && s.last_round_result.round) {
        const r = s.last_round_result;
        res.style.display = 'block';
        res.innerHTML = `📈 最近一轮成果(第 ${r.round} 轮):入库 <b style="color:var(--primary);">${r.added}</b> · 通过 <b style="color:var(--success);">${r.passed}</b> · 拒绝 <b style="color:var(--error);">${r.rejected}</b> · 完成于 ${(r.finished_at || '').slice(5, 19).replace('T', ' ')}`;
      } else if (res) {
        res.style.display = 'none';
      }
      // v=20260866 训练效果曲线(history 折线图)
      this.devDrawTrainChart(s.history || []);
      // v=20260891 环境诊断 + 累计统计
      this.devRenderTrainEnv(s);
      this.devRenderTrainTotals(s);
    } catch (e) { /* 静默:轮询失败不影响 */ }
  };

  /** v=20260891 环境诊断:LLM key / 引擎状态 / 日志尾部(回答"为何无法训练") */
App.devRenderTrainEnv = function devRenderTrainEnv(s) {
    const el = document.getElementById('dev-train-env');
    if (!el) return;
    const env = s.env || {};
    const keyOk = !!env.llm_key_configured;
    const log = s.train_log_tail || [];
    const lastErrLine = log.filter(l => /失败|error|Error|Traceback/i.test(l)).slice(-1)[0] || '';
    const _esc2 = x => String(x || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    el.style.display = 'block';
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;font-weight:700;margin-bottom:4px;">
        <span style="font-size:15px;">🔧</span> 环境诊断
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px 18px;">
        <span>大模型密钥(LLM_API_KEY)：<b style="color:${keyOk ? 'var(--success)' : 'var(--error)'};">${keyOk ? '✅ 已配置' : '❌ 未配置'}</b></span>
        <span>模型：<b style="color:var(--text-secondary);">${_esc2(env.llm_model || '未设置')}</b></span>
        <span>接口地址：<b style="color:var(--text-secondary);">${_esc2(env.llm_base_url || '未设置')}</b></span>
        <span>训练进程：<b style="color:${s.running ? 'var(--success)' : 'var(--error)'};">${s.running ? '🟢 运行中' : '⏸️ 已停止'}</b></span>
      </div>
      ${!keyOk ? `<div style="margin-top:6px;padding:8px 10px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#b91c1c;font-weight:600;">
        ⚠️ 未配置大模型密钥 → 训练引擎无法生成训练数据。请在部署环境设置 <b>LLM_API_KEY</b>（讯飞星火 APIPassword / DeepSeek / OpenAI 等），然后点击「▶ 开始训练」。
      </div>` : ''}
      ${lastErrLine ? `<div style="margin-top:6px;font-size:11px;color:var(--text-tertiary);font-family:'SF Mono',Menlo,Consolas,monospace;">最近日志：${_esc2(lastErrLine)}</div>` : ''}
    `;
  };

  /** v=20260891 累计统计: 入库/通过/拒绝/通过率 */
App.devRenderTrainTotals = function devRenderTrainTotals(s) {
    const el = document.getElementById('dev-train-totals');
    if (!el) return;
    const t = s.totals || {};
    const added = t.added || 0, passed = t.passed || 0, rejected = t.rejected || 0;
    const total = added + rejected;
    const rate = total ? Math.round((added / total) * 100) : 0;
    el.style.display = 'grid';
    const card = (num, label, color) => `<div style="text-align:center;background:var(--surface-elevated);border:1px solid var(--border);border-radius:10px;padding:9px;">
      <div style="font-size:15px;font-weight:800;color:${color};">${num}</div>
      <div style="font-size:10.5px;color:var(--text-secondary);">${label}</div></div>`;
    el.innerHTML = card(added, '累计入库', 'var(--primary)') + card(passed, '累计通过', 'var(--success)') + card(rejected, '累计拒绝', 'var(--error)') + card(rate + '%', '入库通过率', rate >= 40 ? 'var(--success)' : 'var(--warning, #f59e0b)');
  };

  /** 画训练效果折线图(语料增长 + 每轮入库),原生 Canvas 绘制 */
App.devDrawTrainChart = function devDrawTrainChart(history) {
    const wrap = document.getElementById('dev-train-chart-wrap');
    const cv = document.getElementById('dev-train-chart');
    if (!wrap || !cv) return;
    if (!history || history.length < 2) {
      wrap.style.display = 'none';
      return;
    }
    wrap.style.display = 'block';
    const dpr = window.devicePixelRatio || 1;
    const W = cv.width / dpr, H = cv.height / dpr;
    cv.style.width = '100%';
    const rect = cv.getBoundingClientRect();
    const cssW = Math.max(200, rect.width);
    const cssH = cssW * H / W;
    cv.width = Math.floor(cssW * dpr);
    cv.height = Math.floor(cssH * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    const padL = 34, padR = 12, padT = 10, padB = 20;
    const iw = cssW - padL - padR, ih = cssH - padT - padB;

    const rounds = history.map(h => h.round || 0);
    const corpus = history.map(h => h.corpus_count || 0);
    const added = history.map(h => h.added || 0);
    const passed = history.map(h => h.passed || 0);
    const rejected = history.map(h => h.rejected || 0);
    const maxR = Math.max(...rounds);
    const maxC = Math.max(...corpus);
    const maxA = Math.max(...added, ...passed, ...rejected);
    const cMax = Math.max(1, Math.ceil(maxC / 20) * 20);
    const aMax = Math.max(2, Math.ceil(maxA / 2) * 2);

    const X = r => padL + (maxR ? (r / maxR) * iw : 0);
    const Yc = v => padT + ih - (v / cMax) * ih;
    const Ya = v => padT + ih - (v / aMax) * ih;

    // 网格 + Y 轴刻度
    ctx.strokeStyle = 'rgba(120,120,140,0.15)';
    ctx.fillStyle = 'rgba(120,120,140,0.8)';
    ctx.font = '10px sans-serif';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padT + (ih / 4) * i;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(cssW - padR, y); ctx.stroke();
      const label = Math.round(cMax * (1 - i / 4));
      ctx.textAlign = 'right';
      ctx.fillText(label, padL - 6, y + 3);
    }
    ctx.textAlign = 'center';
    ctx.fillText('0', padL - 6, cssH - padB + 3);
    ctx.fillText(maxR + ' 轮', cssW - padR, cssH - padB + 3);

    // 语料总量线(主色)
    ctx.strokeStyle = 'rgba(99,102,241,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    corpus.forEach((v, i) => {
      const x = X(rounds[i]), y = Yc(v);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    // 语料点
    ctx.fillStyle = 'rgba(99,102,241,0.9)';
    corpus.forEach((v, i) => {
      ctx.beginPath(); ctx.arc(X(rounds[i]), Yc(v), 2.5, 0, Math.PI * 2); ctx.fill();
    });

    // 每轮入库线(绿色,细)
    ctx.strokeStyle = 'rgba(16,185,129,0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    added.forEach((v, i) => {
      const x = X(rounds[i]), y = Ya(Math.max(1, v));
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = 'rgba(16,185,129,0.9)';
    added.forEach((v, i) => {
      ctx.beginPath(); ctx.arc(X(rounds[i]), Ya(Math.max(1, v)), 2, 0, Math.PI * 2); ctx.fill();
    });

    // v=20260891 每轮通过线(橙色虚线) + 每轮拒绝线(红色虚线)
    const dashLine = (vals, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      vals.forEach((v, i) => {
        const x = X(rounds[i]), y = Ya(Math.max(0.5, v));
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      vals.forEach((v, i) => {
        ctx.beginPath(); ctx.arc(X(rounds[i]), Ya(Math.max(0.5, v)), 1.8, 0, Math.PI * 2); ctx.fill();
      });
    };
    dashLine(passed, 'rgba(245,158,11,0.8)');
    dashLine(rejected, 'rgba(239,68,68,0.65)');
  };

  /** v=20260866 复现验证:把引擎代码发到后端真实执行 */
App.engineRunCode = async function engineRunCode(code) {
    const resp = await Auth.fetchWithAuth('/api/engine/run', {
      method: 'POST',
      body: JSON.stringify({ code, timeout: 15 })
    });
    if (!resp.ok) {
      let detail = '';
      try { detail = (await resp.json()).detail || ''; } catch (e) {}
      throw new Error(detail || '执行失败(' + resp.status + ')');
    }
    return resp.json();
  };

  /** 在线保存模型/密钥配置 */
App.devSaveLLM = async function devSaveLLM() {
    const model = document.getElementById('dev-llm-model')?.value?.trim() || '';
    const url = document.getElementById('dev-llm-url')?.value?.trim() || '';
    const key = document.getElementById('dev-llm-key')?.value?.trim() || '';
    if (!model && !url && !key) { this._shotToast('请至少填写一项修改内容', 'warn'); return; }
    const btn = document.querySelector('button[onclick="App.devSaveLLM()"]');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 保存并测活中…'; }
    try {
      const resp = await Auth.fetchWithAuth('/api/dev/update_llm', {
        method: 'POST',
        body: JSON.stringify({ model, base_url: url, api_key: key })
      });
      const d = await resp.json();
      const msg = document.getElementById('dev-llm-msg');
      if (msg) {
        const cls = d.ping_ok === true ? 'color:var(--success);background:var(--success-light);' : (d.ping_ok === false ? 'color:var(--error);background:var(--error-light);' : 'color:var(--text-secondary);');
        msg.style.cssText = `font-size:12px;margin-top:8px;padding:6px 10px;border-radius:6px;${cls}`;
        msg.textContent = (d.message || (d.ok ? '已保存' : '失败')) + (d.ping_ok === true ? ' ✓' : (d.ping_ok === false ? ' — 请检查密钥/网络' : ''));
        setTimeout(() => { msg.textContent = ''; msg.style.cssText = 'font-size:11.5px;margin-top:8px;'; }, 6000);
      }
      if (d.ok) {
        this._shotToast('✅ ' + (d.message || '配置已更新'), 'ok');
        const k = document.getElementById('dev-llm-key'); if (k) k.value = '';
        const u = document.getElementById('dev-llm-url'); if (u) u.value = '';
        this.devLoadDashboard();
      }
    } catch (e) {
      this._shotToast('⚠️ 保存失败:' + (e.message || e), 'warn');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '💾 在线保存并生效（写 .env + 热更新，无需重启）'; }
    }
  };

  /** 测试当前 LLM 连通性 */
App.devTestLLM = async function devTestLLM() {
    const btn = document.querySelector('button[onclick="App.devTestLLM()"]');
    if (btn) { btn.disabled = true; const t0 = Date.now(); btn.textContent = '⏳ ping...'; }
    const msg = document.getElementById('dev-llm-msg');
    if (msg) { msg.style.cssText = 'font-size:12px;margin-top:8px;color:var(--text-secondary);'; msg.textContent = '正在 ping...'; }
    try {
      const resp = await Auth.fetchWithAuth('/api/dev/test_llm', { method: 'POST' });
      const d = await resp.json();
      if (msg) {
        if (d.ok) {
          msg.style.cssText = 'font-size:12px;margin-top:8px;color:var(--success);background:var(--success-light);padding:6px 10px;border-radius:6px;';
          msg.innerHTML = `✓ 连接成功 <b>${d.ms}ms</b> · 模型 ${this.escapeHtml(d.model || '—')} · 回复:"${this.escapeHtml(d.reply || '')}"`;
        } else {
          msg.style.cssText = 'font-size:12px;margin-top:8px;color:var(--error);background:var(--error-light);padding:6px 10px;border-radius:6px;';
          msg.textContent = '✗ ' + (d.error || '连接失败');
        }
      }
    } catch (e) {
      if (msg) { msg.style.cssText = 'font-size:12px;margin-top:8px;color:var(--error);'; msg.textContent = '✗ ' + (e.message || e); }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🔗 测试连接'; }
    }
  };

  /**
   * v=20260824i 独立测试视觉模型 — 调后端 /api/dev/test_vision 真实发请求,
   * 一次性返回 spark / openai_vision / ocr 三引擎实测结果
   */
App.devTestVision = async function devTestVision() {
    const btn = document.querySelector('button[onclick="App.devTestVision()"]');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 测试中...'; }
    const msg = document.getElementById('dev-vision-msg');
    if (msg) { msg.style.cssText = 'font-size:11.5px;margin-top:6px;color:var(--text-secondary);'; msg.textContent = '⏳ 正在发起真实测试(可能需 10-30s)...'; }
    try {
      const resp = await Auth.fetchWithAuth('/api/dev/test_vision', { method: 'POST' });
      const d = await resp.json();
      if (msg) {
        const r = d.results || {};
        const lines = [];
        for (const [k, v] of Object.entries(r)) {
          if (v.skipped) lines.push(`<span style="color:#94a3b8;">⏭ ${k}: ${this.escapeHtml(v.reason || 'skipped')}</span>`);
          else if (v.ok) lines.push(`<span style="color:#10b981;">✅ ${k} (${v.ms || 0}ms)</span>: ${this.escapeHtml((v.reply || v.text || '').slice(0, 50))}`);
          else lines.push(`<span style="color:#ef4444;">❌ ${k} (${v.ms || 0}ms)</span>: ${this.escapeHtml((v.error || '').slice(0, 80))}`);
        }
        msg.style.cssText = `font-size:11.5px;margin-top:6px;padding:8px 10px;border-radius:8px;${d.ok ? 'background:#f0fdf4;color:#166534;' : 'background:#fef2f2;color:#991b1b;'}`;
        msg.innerHTML = `<b>${d.ok ? '✅ 至少一个引擎可用' : '❌ 全部引擎失败'}</b> · 当前实际: <b>${this.escapeHtml(d.active_engine || 'none')}</b><br>${lines.join('<br>')}`;
      }
    } catch (e) {
      if (msg) { msg.style.cssText = 'font-size:11.5px;margin-top:6px;color:var(--error);'; msg.textContent = '✗ ' + (e.message || e); }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🖼️ 测试视觉'; }
    }
  };

  /** 启动自进化训练 */
App.devTrainStart = async function devTrainStart() {
    const speed = parseInt(document.getElementById('dev-train-speed')?.value || '600');
    try {
      const resp = await Auth.fetchWithAuth('/api/dev/train/start', {
        method: 'POST', body: JSON.stringify({ interval: speed })
      });
      const d = await resp.json();
      const m = document.getElementById('dev-train-msg');
      if (m) m.textContent = d.message || '';
      this._shotToast('▶ ' + (d.message || '已启动'), 'ok');
      this.devLoadDashboard();
    } catch (e) { this._shotToast('⚠️ 启动失败', 'warn'); }
  };

  /** 停止自进化训练 */
App.devTrainStop = async function devTrainStop() {
    try {
      const resp = await Auth.fetchWithAuth('/api/dev/train/stop', { method: 'POST', body: '{}' });
      const d = await resp.json();
      const m = document.getElementById('dev-train-msg');
      if (m) m.textContent = d.message || '';
      this._shotToast('⏹ ' + (d.message || '已停止'), 'ok');
      this.devLoadDashboard();
    } catch (e) { this._shotToast('⚠️ 停止失败', 'warn'); }
  };

  /** 调节训练速度 */
App.devTrainSpeed = async function devTrainSpeed() {
    const speed = parseInt(document.getElementById('dev-train-speed')?.value || '600');
    try {
      const resp = await Auth.fetchWithAuth('/api/dev/train/speed', {
        method: 'POST', body: JSON.stringify({ interval: speed })
      });
      const d = await resp.json();
      const m = document.getElementById('dev-train-msg');
      if (m) m.textContent = d.message || '';
      this._shotToast('⚙️ ' + (d.message || '已调节'), 'ok');
      this.devLoadDashboard();
    } catch (e) { this._shotToast('⚠️ 调节失败', 'warn'); }
  };

  /** 查看/收起训练日志 */
App.devToggleLog = async function devToggleLog() {
    const pre = document.getElementById('dev-train-log');
    if (!pre) return;
    if (pre.style.display === 'block') { pre.style.display = 'none'; return; }
    try {
      const resp = await Auth.fetchWithAuth('/api/dev/train/log?lines=60');
      const d = await resp.json();
      const lines = (d.lines || []);
      if (!lines.length) { pre.textContent = '（暂无日志）'; pre.style.display = 'block'; return; }
      // 浅主题色高亮:✅/✓ 绿,⚠/❌/🚨/异常 红,第N轮 / 蓝,耗时 灰,时间戳 黄
      pre.innerHTML = lines.map(raw => {
        let cls = 'log-line';
        const low = raw.toLowerCase();
        if (/^\[.*\] (✅|✓|入库|快照)/.test(raw) || /入库 \d|通过 \d|拒绝 0/.test(raw)) cls += ' log-ok';
        else if (/^\[.*\] (⚠|❌|🚨|异常)/.test(raw) || /本轮异常|error/.test(low)) cls += ' log-err';
        else if (/^\[.*\] =+ 第 \d+ 轮/.test(raw)) cls += ' log-round';
        else if (/^\[.*\] (📈|📦|🚀|⏱)/.test(raw)) cls += ' log-info';
        return `<div class="${cls}">${this.escapeHtml(raw)}</div>`;
      }).join('');
      pre.style.display = 'block';
      // 自动滚到日志底部(最新内容)
      pre.scrollTop = pre.scrollHeight;
    } catch (e) { pre.textContent = '日志加载失败'; pre.style.display = 'block'; }
  };

  /** v=20260904b 提示词日志接口已下线（后端无 /api/dev/prompt_logs），入口移除 */
App.devOpenPromptLogs = function devOpenPromptLogs() {
    this._adminToast('提示词日志已下线', 'warn');
  };

  /** 打开数据库表 */
App.devOpenTable = async function devOpenTable(name, offset = 0, search = '') {
    const view = document.getElementById('dev-db-view');
    if (!view) return;
    view.innerHTML = '<div style="font-size:12px;color:var(--text-tertiary);padding:14px;text-align:center;">⏳ 加载中…</div>';
    // 高亮当前选中的表名按钮
    document.querySelectorAll('.dev-db-table-btn').forEach(b => {
      const active = b.dataset.name === name;
      b.style.background = active ? 'var(--primary)' : 'var(--surface-elevated)';
      b.style.color = active ? '#fff' : 'var(--text)';
      b.style.borderColor = active ? 'var(--primary)' : 'var(--border)';
    });
    try {
      const qs = `?name=${encodeURIComponent(name)}&limit=15&offset=${offset}&q=${encodeURIComponent(search)}`;
      const resp = await Auth.fetchWithAuth(`/api/dev/db/table${qs}`);
      if (!resp.ok) { view.innerHTML = '<div style="color:var(--error);font-size:12px;padding:14px;">❌ 读取失败</div>'; return; }
      const d = await resp.json();
      const _esc = s => String(s ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      // 当前检索状态保留到 input
      const curSearch = search || '';
      let html = `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:12px;color:var(--text-secondary);margin-bottom:8px;">
        <span>📋 <b style="color:var(--primary);">${_esc(name)}</b> · 共 <b>${d.total}</b> 行</span>
        ${curSearch ? `<span style="background:var(--primary-light);color:var(--primary);padding:2px 8px;border-radius:999px;font-size:11px;">筛选:"${_esc(curSearch)}"</span>` : ''}
        <input type="text" id="dev-db-search" placeholder="🔍 模糊搜索(任意列)" value="${_esc(curSearch)}"
          onkeydown="if(event.key==='Enter')App.devOpenTable('${name}', 0, this.value.trim())"
          style="margin-left:auto;padding:5px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font-size:12px;min-width:180px;">
        <button onclick="App.devOpenTable('${name}', 0, document.getElementById('dev-db-search').value.trim())" style="padding:5px 12px;border:none;border-radius:6px;background:var(--primary);color:#fff;cursor:pointer;font-size:12px;font-weight:600;">搜索</button>
        <button onclick="App.devExportTable('${name}', '${_esc(curSearch).replace(/'/g, "\\'")}')" style="padding:5px 12px;border:1px solid var(--border);border-radius:6px;background:var(--surface-elevated);color:var(--text);cursor:pointer;font-size:12px;">📥 导出 CSV</button>
      </div>`;
      // 表主体
      if (!d.rows || d.rows.length === 0) {
        html += `<div style="padding:24px;text-align:center;color:var(--text-tertiary);font-size:13px;background:var(--primary-light);border-radius:8px;">${curSearch ? '没有匹配 \"' + _esc(curSearch) + '\" 的记录' : '📭 该表为空'}</div>`;
      } else {
        html += `<div style="overflow-x:auto;border-radius:8px;border:1px solid var(--border-light);"><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="color:var(--text-secondary);background:var(--primary-light);">`;
        (d.cols || []).forEach(c => html += `<th style="padding:8px;text-align:left;white-space:nowrap;">${_esc(c)}</th>`);
        html += '</tr></thead><tbody>';
        d.rows.forEach((r, idx) => {
          html += `<tr style="border-bottom:1px dashed var(--border-light);background:${idx % 2 === 0 ? 'transparent' : 'rgba(99,102,241,0.04)'};">`;
          (d.cols || []).forEach(c => {
            let v = r[c];
            const s = v == null ? '' : String(v);
            const truncated = s.length > 50 ? s.slice(0, 50) + '…' : s;
            // 搜索关键字高亮
            const display = curSearch && s.toLowerCase().includes(curSearch.toLowerCase())
              ? _esc(truncated).replace(new RegExp(_esc(curSearch).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), m => `<mark style="background:var(--warning);color:var(--text);padding:0 2px;border-radius:2px;">${m}</mark>`)
              : _esc(truncated);
            html += `<td style="padding:7px 8px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${_esc(s)}">${display}</td>`;
          });
          html += '</tr>';
        });
        html += '</tbody></table></div>';
      }
      // 分页
      if (d.total > d.limit) {
        const totalPages = Math.max(1, Math.ceil(d.total / d.limit));
        const curPage = Math.floor(offset / d.limit) + 1;
        html += `<div style="display:flex;gap:8px;margin-top:10px;align-items:center;justify-content:flex-end;">
          <button onclick="App.devOpenTable('${name}', ${Math.max(0, offset - d.limit)}, '${_esc(curSearch).replace(/'/g, "\\'")}')" ${offset <= 0 ? 'disabled' : ''} style="padding:5px 12px;border:1px solid var(--border);border-radius:6px;background:var(--surface-elevated);color:var(--text);cursor:pointer;font-size:12px;${offset <= 0 ? 'opacity:.5;' : ''}">‹ 上一页</button>
          <span style="font-size:12px;color:var(--text-secondary);">第 <b>${curPage}</b> / ${totalPages} 页</span>
          <button onclick="App.devOpenTable('${name}', ${offset + d.limit}, '${_esc(curSearch).replace(/'/g, "\\'")}')" ${offset + d.limit >= d.total ? 'disabled' : ''} style="padding:5px 12px;border:1px solid var(--border);border-radius:6px;background:var(--surface-elevated);color:var(--text);cursor:pointer;font-size:12px;${offset + d.limit >= d.total ? 'opacity:.5;' : ''}">下一页 ›</button>
        </div>`;
      }
      view.innerHTML = html;
    } catch (e) {
      view.innerHTML = '<div style="color:var(--error);font-size:12px;padding:14px;">❌ 加载失败:' + this.escapeHtml(e.message || e) + '</div>';
    }
  };

  /** 导出数据库表为 CSV(支持当前搜索过滤) */
App.devExportTable = async function devExportTable(name, search = '') {
    try {
      const resp = await Auth.fetchWithAuth(`/api/dev/db/table?name=${encodeURIComponent(name)}&limit=1000&q=${encodeURIComponent(search)}`);
      if (!resp.ok) { this._shotToast('导出失败', 'warn'); return; }
      const d = await resp.json();
      if (!d.rows || !d.rows.length) { this._shotToast('该表为空,无可导出数据', 'warn'); return; }
      // BOM 头(Excel 中文兼容)+ 表头 + 行
      const lines = [d.cols.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')];
      d.rows.forEach(r => {
        lines.push(d.cols.map(c => {
          const v = r[c] == null ? '' : String(r[c]);
          return `"${v.replace(/"/g, '""')}"`;
        }).join(','));
      });
      const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${name}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      this._shotToast(`✓ 已导出 ${d.rows.length} 行(${name})`, 'ok');
    } catch (e) { this._shotToast('导出失败:' + (e.message || e), 'warn'); }
  };

App.adminSearch = function adminSearch() {
    this.adminLoadUsers(1);
  };

  /** 查看所有版本快照(只读) */
App.devShowSnapshots = async function devShowSnapshots() {
    if (this._devSnapshotsModal) { this._devSnapshotsModal.remove(); this._devSnapshotsModal = null; }
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:99999;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = `<div style="background:var(--surface);border-radius:14px;padding:0;max-width:880px;width:92%;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.25);">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid var(--border-light);">
        <div>
          <h3 style="font-size:17px;font-weight:700;margin:0;">📦 版本快照历史</h3>
          <p style="font-size:12px;color:var(--text-tertiary);margin:4px 0 0;">每轮训练产生的版本快照(只读,不影响训练进程)</p>
        </div>
        <button id="dev-snap-close" style="padding:6px 14px;border:1px solid var(--border);border-radius:8px;background:var(--surface-elevated);color:var(--text);cursor:pointer;font-size:14px;">✕ 关闭</button>
      </div>
      <div id="dev-snap-body" style="padding:20px;overflow:auto;flex:1;">⏳ 加载中…</div>
    </div>`;
    document.body.appendChild(modal);
    modal.id = '_devSnapshotsModal';
    this._devSnapshotsModal = modal;
    modal.querySelector('#dev-snap-close').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    try {
      const resp = await Auth.fetchWithAuth('/api/dev/snapshots');
      const d = await resp.json();
      const body = modal.querySelector('#dev-snap-body');
      if (!d.ok || !d.snapshots || !d.snapshots.length) {
        body.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-tertiary);">📭 暂无快照（首轮训练完成后将自动产生）</div>';
      } else {
        body.innerHTML = `<div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">共 <b>${d.count}</b> 个快照 · 按时间倒序</div>
          <div style="display:flex;flex-direction:column;gap:8px;">
          ${d.snapshots.map((s, i) => `
            <div style="background:${i === 0 ? 'var(--primary-light)' : 'var(--surface-elevated)'};border:1px solid ${i === 0 ? 'var(--primary)' : 'var(--border-light)'};border-radius:10px;padding:12px 14px;">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                <div style="font-weight:700;font-size:14px;color:var(--text);">
                  ${i === 0 ? '<span style="background:var(--primary);color:#fff;padding:1px 8px;border-radius:4px;font-size:11px;margin-right:6px;\">最新</span>' : ''}
                  ${this.escapeHtml(s.name)}
                </div>
                <div style="font-size:11px;color:var(--text-tertiary);">${this.escapeHtml((s.created_at || '').slice(0, 19).replace('T', ' '))} · ${s.size_kb} KB</div>
              </div>
              <div style="display:flex;gap:14px;margin-top:6px;font-size:12px;color:var(--text-secondary);flex-wrap:wrap;">
                <span>轮次: <b style="color:var(--primary);">${s.round}</b></span>
                <span>入库 <b>${s.added}</b> 条</span>
                <span>通过 <b style="color:var(--success);">${s.passed}</b></span>
                <span>拒绝 <b style="color:var(--error);">${s.rejected}</b></span>
              </div>
              <details style="margin-top:6px;">
                <summary style="cursor:pointer;color:var(--primary);font-size:11.5px;">📁 查看文件 (${s.files.length})</summary>
                <div style="margin-top:6px;padding:8px;background:var(--surface);border-radius:6px;font-size:11px;font-family:monospace;color:var(--text-secondary);">
                  ${s.files.map(f => '<div>· ' + this.escapeHtml(f) + '</div>').join('')}
                </div>
              </details>
            </div>
          `).join('')}
          </div>`;
      }
    } catch (e) {
      const body = modal.querySelector('#dev-snap-body');
      body.innerHTML = '<div style="color:var(--error);padding:20px;">❌ 加载失败:' + this.escapeHtml(e.message || e) + '</div>';
    }
  };

  /** 导出当前搜索条件下的用户列表为 CSV */
App.adminExportCSV = async function adminExportCSV() {
    try {
      const q = document.getElementById('admin-search')?.value?.trim() || '';
      const params = new URLSearchParams({ page: 1, page_size: 200 });
      if (q) params.set('q', q);
      const resp = await Auth.fetchWithAuth('/api/admin/users?' + params.toString());
      if (!resp.ok) throw new Error('权限不足');
      const d = await resp.json();
      const esc = (s) => '"' + String(s || '').replace(/"/g, '""') + '"';
      const header = ['ID', '用户名', '昵称', '角色', '状态', '提问数', '积分', '最后登录', '注册时间'];
      const rows = d.users.map(u => [
        u.id, u.username, u.nickname, u.role === 'admin' ? '管理员' : '普通用户',
        u.status === 'banned' ? '封禁' : '正常', u.questions, u.credits,
        (u.last_login || '').replace('T', ' ').slice(0, 16), (u.created || '').slice(0, 10)
      ].map(esc).join(','));
      const csv = '\uFEFF' + [header.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '用户列表_' + new Date().toISOString().slice(0, 10) + '.csv';
      a.click();
      URL.revokeObjectURL(a.href);
      this._adminToast('📥 已导出 ' + d.users.length + ' 条用户数据', 'ok');
    } catch (e) {
      alert('导出失败：' + (e.message || e));
    }
  };

App.adminLoadUsers = async function adminLoadUsers(page) {
    const tbody = document.getElementById('admin-users-tbody');
    if (!tbody) return;
    // ── v=20260926 安全修复(存储型 XSS):用户操作按钮不再用内联 onclick 拼 JS 字符串
    // (昵称含 ' 或 " 时可闭合字符串/属性注入任意脚本,且昵称是用户可控的存储型数据)。
    // 改为 data-* + 事件委托;#admin-users-tbody 是 index.html 静态节点,自身不会重建
    // (只有 innerHTML 被替换),所以只绑定一次,用标记防重复绑定避免一次点击触发多次。
    if (!tbody._adminActBound) {
      tbody._adminActBound = true;
      tbody.addEventListener('click', (e) => {
        const btn = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
        if (!btn || !tbody.contains(btn)) return;
        App.adminUserAction(btn.dataset.uid, btn.dataset.act, btn.dataset.nickname || '');
      });
    }
    page = page || this._adminPage || 1;
    this._adminPage = page;
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text-tertiary);">加载中…</td></tr>';
    try {
      const q = document.getElementById('admin-search')?.value?.trim() || '';
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      params.set('page', page);
      params.set('page_size', this._adminPageSize || 8);
      const resp = await Auth.fetchWithAuth('/api/admin/users?' + params.toString());
      if (!resp.ok) throw new Error('权限不足');
      const d = await resp.json();
      const label = document.getElementById('admin-total-label');
      if (label) label.textContent = q ? `（共 ${d.total} 条匹配结果）` : `（共 ${d.total} 位用户）`;
      if (!d.users || d.users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text-tertiary);">暂无用户</td></tr>';
        this._renderAdminPagination(d);
        return;
      }
      // v=20260926 本地 esc 补转义双引号:下面的昵称/用户名会写进 title="..."、data-*="..." 属性,
      // 不转义引号时昵称含 " 就能闭合属性注入(存储型 XSS)。与 App.escapeHtml 保持一致。
      const esc = (s) => { const div = document.createElement('div'); div.textContent = s || ''; return div.innerHTML.replace(/"/g, '&quot;'); };
      const fmtTime = (t) => { const s = (t || '').replace('T', ' '); return s ? s.slice(0, 16) : '—'; };
      tbody.innerHTML = d.users.map(u => `
        <tr style="border-bottom:1px solid var(--border-light);">
          <td style="padding:10px 8px;color:var(--text-tertiary);">${u.id}</td>
          <td style="padding:10px 8px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="width:28px;height:28px;border-radius:50%;background:var(--primary-light);color:var(--primary);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;">${esc(u.avatar || '?')}</div>
              <div>
                <div style="font-weight:600;">${esc(u.nickname)}</div>
                <div style="font-size:11px;color:var(--text-tertiary);">@${esc(u.username)}</div>
              </div>
            </div>
          </td>
          <td style="padding:10px 8px;">
            <span class="admin-role-tag ${u.role === 'admin' ? 'is-admin' : 'is-user'}">${u.role === 'admin' ? '✦ 管理员' : '普通用户'}</span>
          </td>
          <td style="padding:10px 8px;">
            <span class="admin-status-tag ${u.status === 'banned' ? 'is-banned' : 'is-active'}"><i></i>${u.status === 'banned' ? '封禁' : '正常'}</span>
          </td>
          <td style="padding:10px 8px;">${u.questions}</td>
          <td style="padding:10px 8px;">${u.credits}</td>
          <td style="padding:10px 8px;color:var(--text-secondary);font-size:12px;" title="${esc(fmtTime(u.last_login))}">${fmtTime(u.last_login)}</td>
          <td style="padding:10px 8px;color:var(--text-tertiary);font-size:12px;">${(u.created || '').slice(0, 10)}</td>
          <td style="padding:10px 8px;white-space:nowrap;">
            <button class="admin-op-btn indigo" title="设置该用户积分余额" data-uid="${u.id}" data-act="adjust_credits" data-nickname="${esc(u.nickname)}">积分</button>
            ${u.role === 'admin' ? '' : `
              <button class="admin-op-btn ${u.status === 'banned' ? 'green' : 'red'}" data-uid="${u.id}" data-act="${u.status === 'banned' ? 'unban' : 'ban'}" data-nickname="${esc(u.nickname)}">${u.status === 'banned' ? '解封' : '封禁'}</button>
              <button class="admin-op-btn orange" title="重置试用额度/积分/错题" data-uid="${u.id}" data-act="reset_quota" data-nickname="${esc(u.nickname)}">重置</button>
              <button class="admin-op-btn blue" title="重置用户密码并强制下线" data-uid="${u.id}" data-act="reset_password" data-nickname="${esc(u.nickname)}">改密</button>
              <button class="admin-op-btn purple" title="任命为管理员" data-uid="${u.id}" data-act="promote" data-nickname="${esc(u.nickname)}">设为管理员</button>
              <button class="admin-op-btn darkred" title="注销账号（不可恢复）" data-uid="${u.id}" data-act="delete" data-nickname="${esc(u.nickname)}">注销</button>
            `}
          </td>
        </tr>`).join('');
      this._renderAdminPagination(d);
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--error);">⚠️ 加载失败：' + (e.message || e) + '</td></tr>';
    }
  };

App._renderAdminPagination = function _renderAdminPagination(d) {
    const box = document.getElementById('admin-pagination');
    if (!box) return;
    if (!d || d.pages <= 1) { box.innerHTML = ''; return; }
    const page = d.page, pages = d.pages, total = d.total;
    let html = `<span class="admin-pager-info">第 ${page} / ${pages} 页 · 共 ${total} 条</span>`;
    html += `<button class="admin-pager-btn" ${page <= 1 ? 'disabled' : ''} onclick="App.adminLoadUsers(${page - 1})">‹ 上一页</button>`;
    const start = Math.max(1, page - 3), end = Math.min(pages, page + 3);
    for (let i = start; i <= end; i++) {
      html += `<button class="admin-pager-btn${i === page ? ' active' : ''}" onclick="App.adminLoadUsers(${i})">${i}</button>`;
    }
    html += `<button class="admin-pager-btn" ${page >= pages ? 'disabled' : ''} onclick="App.adminLoadUsers(${page + 1})">下一页 ›</button>`;
    box.innerHTML = html;
  };

App.adminUserAction = function adminUserAction(uid, action, nickname) {
    const cfgs = {
      ban: { title: '⚠️ 确认封禁用户', msg: `确定要封禁「${nickname}」吗？<br>封禁后该用户将被立即踢下线，且无法再登录。`, ok: '确认封禁', color: '#e11d48' },
      unban: { title: '确认解封用户', msg: `确定要解封「${nickname}」吗？<br>解封后该用户可恢复正常登录。`, ok: '确认解封', color: '#059669' },
      reset_quota: { title: '⚠️ 确认重置用户数据', msg: `确定要重置「${nickname}」的全部数据吗？<br><b>将重置试用额度（5 次）、积分归零、清空全部错题记录</b>，该操作<b>不可撤销</b>！`, ok: '确认重置', color: '#ea580c' },
      delete: { title: '⚠️⚠️ 确认注销账号', msg: `确定要<b>永久注销</b>用户「${nickname}」吗？<br>将删除其<b>全部数据</b>：问答历史、错题、积分、好友关系等，<b>不可恢复</b>！`, ok: '永久注销', color: '#b91c1c' },
      reset_password: { title: '🔑 重置用户密码', msg: `为「${nickname}」设置新密码：<br>设置后该用户将<b>强制下线</b>，需使用新密码重新登录。`, ok: '确认重置密码', color: '#7c3aed', input: { label: '新密码', placeholder: '至少 6 位', type: 'password' } },
      promote: { title: '👑 任命管理员', msg: `确定要将「${nickname}」设为管理员吗？<br>任命后该用户将立即可访问<b>管理后台</b>，并拥有全部管理权限。`, ok: '确认任命', color: '#7c3aed' },
      adjust_credits: { title: '💰 调整用户积分', msg: `为用户「${nickname}」设置积分余额：<br>输入新的积分值（0 - 999999），保存后立即生效。`, ok: '保存积分', color: '#6366f1', input: { label: '积分余额', placeholder: '例如 1000', type: 'number' } },
    };
    const c = cfgs[action];
    if (!c) return;
    this._adminConfirm(c, (inputVal) => {
      if (action === 'reset_password' && (!inputVal || inputVal.trim().length < 6)) {
        alert('新密码长度至少 6 位');
        return;
      }
      if (action === 'adjust_credits') {
        const v = parseInt(inputVal, 10);
        if (isNaN(v) || v < 0) {
          alert('请输入有效的非负整数积分值');
          return;
        }
        inputVal = String(v);
      }
      this._adminDoAction(uid, action, inputVal);
    });
  };

App._adminDoAction = async function _adminDoAction(uid, action, inputVal) {
    try {
      const body = { action };
      if (action === 'reset_password') body.password = inputVal;
      if (action === 'adjust_credits') body.credits = parseInt(inputVal, 10) || 0;
      const resp = await Auth.fetchWithAuth('/api/admin/users/' + uid + '/action', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}));
        throw new Error(e.detail || '操作失败');
      }
      this._adminToast(action === 'delete' ? '🗑️ 账号已注销' : action === 'reset_password' ? '🔑 密码已重置，用户已强制下线' : action === 'promote' ? '👑 已任命为管理员' : action === 'adjust_credits' ? '💰 积分已更新' : '✅ 操作成功', 'ok');
      // 成功后自动刷新当前页表格 + 统计（无需手动刷新）
      this.adminLoadUsers(this._adminPage || 1);
      this.adminLoadStats();
    } catch (e) {
      alert('操作失败：' + (e.message || e));
    }
  };

  /** v=20260904b P0 安全：明文密码已下线，查看密码入口已移除 */
App.adminViewPassword = async function adminViewPassword(uid, nickname) {
    this._adminToast('系统已下线明文密码，密码仅以单向哈希存储，无法查看', 'warn');
  };

  /** 管理后台自定义二次确认弹窗（支持可选输入框） */
App._adminConfirm = function _adminConfirm(cfg, onOk) {
    let mask = document.getElementById('admin-confirm-mask');
    if (!mask) {
      mask = document.createElement('div');
      mask.id = 'admin-confirm-mask';
      mask.className = 'admin-confirm-mask';
      mask.innerHTML = `
        <div class="admin-confirm-modal">
          <div class="admin-confirm-title" id="ac-title"></div>
          <div class="admin-confirm-msg" id="ac-msg"></div>
          <div class="admin-confirm-input-wrap" id="ac-input-wrap" style="display:none;margin-bottom:16px;">
            <label id="ac-input-label" style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:6px;"></label>
            <input type="password" id="ac-input" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);font-size:14px;box-sizing:border-box;">
          </div>
          <div class="admin-confirm-btns">
            <button class="admin-confirm-btn cancel" id="ac-cancel">取消</button>
            <button class="admin-confirm-btn ok" id="ac-ok">确定</button>
          </div>
        </div>`;
      document.body.appendChild(mask);
    }
    const title = mask.querySelector('#ac-title');
    const msg = mask.querySelector('#ac-msg');
    const okBtn = mask.querySelector('#ac-ok');
    const cancelBtn = mask.querySelector('#ac-cancel');
    const inputWrap = mask.querySelector('#ac-input-wrap');
    const inputLabel = mask.querySelector('#ac-input-label');
    const input = mask.querySelector('#ac-input');
    title.textContent = cfg.title;
    msg.innerHTML = cfg.msg;
    okBtn.textContent = cfg.ok || '确定';
    okBtn.style.background = cfg.color || 'var(--primary)';
    // 输入框支持（重置密码等）
    if (cfg.input) {
      inputWrap.style.display = '';
      inputLabel.textContent = cfg.input.label || '';
      input.placeholder = cfg.input.placeholder || '';
      input.type = cfg.input.type || 'text';
      input.value = '';
      setTimeout(() => input.focus(), 60);
    } else {
      inputWrap.style.display = 'none';
    }
    mask.style.display = 'flex';
    const close = () => { mask.style.display = 'none'; };
    cancelBtn.onclick = close;
    okBtn.onclick = () => { close(); onOk && onOk(input.value); };
    mask.onclick = (e) => { if (e.target === mask) close(); };
    // 回车提交
    input.onkeydown = (e) => { if (e.key === 'Enter') okBtn.click(); };
  };

  /** 管理后台轻提示 */
App._adminToast = function _adminToast(msg, type) {
    let t = document.getElementById('admin-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'admin-toast';
      t.className = 'admin-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = 'admin-toast show' + (type === 'warn' ? ' warn' : '');
    clearTimeout(this._adminToastTimer);
    this._adminToastTimer = setTimeout(() => { t.className = 'admin-toast'; }, 2600);
  };

