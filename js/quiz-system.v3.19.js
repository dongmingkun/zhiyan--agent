/**
 * 测试 / 练习 / 错题引擎
 * 管理测试流程、练习答题、错题记录与反思
 */

const QuizSystem = {

  // ============ 状态 ============
  state: {
    mode: null,           // 'quiz' | 'practice' | 'mistakes'
    questions: [],        // 当前题组
    currentIndex: 0,      // 当前题号
    answers: [],          // 用户答案记录
    graded: {},           // 已判分题目（key: 题目 id/下标 → 1 对 / -1 错），防止前后翻题重复判分
    startTime: null,      // 开始时间
    timerId: null,        // 计时器ID
    selectedChapter: 'all',
    selectedDifficulty: 0,
  },

  // 错题本（localStorage 持久化）
  mistakes: [],

  // 练习进度记录
  progress: {},

  // ============ 初始化 ============
  init() {
    this.loadMistakes();
    this.loadProgress();
    // 登录用户：从云端拉取错题合并（跨设备同步）
    this.syncMistakesFromCloud();
  },

  // ============ 错题本持久化 ============
  loadMistakes() {
    try {
      const data = localStorage.getItem('linalg_mistakes');
      this.mistakes = data ? JSON.parse(data) : [];
    } catch(e) {
      this.mistakes = [];
    }
  },

  saveMistakes() {
    try {
      localStorage.setItem('linalg_mistakes', JSON.stringify(this.mistakes));
    } catch(e) {}
    // 已登录 → 标脏并防抖推送云端（跨设备同步）
    if (typeof Auth !== 'undefined' && Auth.isLoggedIn) {
      this._mistakesDirty = true;
      clearTimeout(this._syncTimer);
      this._syncTimer = setTimeout(() => this.pushMistakesToCloud(), 600);
    }
  },

  // ============ 错题云同步（多设备：电脑/手机同时在线实时互通） ============
  // 策略：拉云端（含软删除标记）→ 本地过滤其他设备已删的题 → 合并本地新增 → 推送。
  // 云端软删除标记（deleted）是权威，保证 A 设备删的题在 B 设备刷新后不会复活。
  async syncMistakesFromCloud() {
    if (typeof Auth === 'undefined' || !Auth.isLoggedIn) return;
    try {
      // 1) 拉取云端：有效错题 + 软删除标记
      const resp = await Auth.fetchWithAuth('/api/mistakes/sync');
      if (!resp.ok) return;
      const d = await resp.json();
      if (!d || !Array.isArray(d.mistakes)) return;
      // 2) 本地过滤：其他设备已删除的题从本地移除
      if (Array.isArray(d.deleted) && d.deleted.length && this.mistakes && this.mistakes.length) {
        const delSet = new Set(d.deleted.map(String));
        this.mistakes = this.mistakes.filter(m => !delSet.has(String(m.id)));
      }
      // 3) 合并：云端为基准，本地独有的（本设备新增未推送）补入
      const map = new Map();
      d.mistakes.forEach(m => { if (m && m.id != null) map.set(String(m.id), m); });
      (this.mistakes || []).forEach(m => {
        if (m && m.id != null && !map.has(String(m.id))) map.set(String(m.id), m);
      });
      this.mistakes = Array.from(map.values());
      try { localStorage.setItem('linalg_mistakes', JSON.stringify(this.mistakes)); } catch(e) {}
      // 4) 推送合并结果（保证两台设备最终一致）
      this.pushMistakesToCloud();
    } catch (e) { /* 静默：网络异常不影响本地使用 */ }
  },

  pushMistakesToCloud() {
    if (typeof Auth === 'undefined' || !Auth.isLoggedIn) return Promise.resolve(null);
    const body = { mistakes: this.mistakes || [], removed_ids: this._removedIds || [] };
    this._removedIds = [];
    return Auth.fetchWithAuth('/api/mistakes/sync', {
      method: 'POST',
      body: JSON.stringify(body)
    }).then(r => r.ok ? r.json() : null).then(d => {
      if (d && Array.isArray(d.mistakes)) {
        // 以服务端合并结果为准对齐本地（服务端可能合并了其他设备的新数据）
        const toMap = arr => {
          const m = new Map();
          (arr || []).forEach(x => { if (x && x.id != null) m.set(String(x.id), x); });
          return m;
        };
        const localMap = toMap(this.mistakes);
        const serverMap = toMap(d.mistakes);
        // 内容比较：题目集合不同，或同一题的关键字段（答题记录/次数/掌握状态）不同 → 采用服务端结果
        let differs = localMap.size !== serverMap.size;
        if (!differs) {
          for (const [k, sv] of serverMap) {
            const lv = localMap.get(k);
            if (!lv) { differs = true; break; }
            if (String(lv.userAnswer) !== String(sv.userAnswer) ||
                String(lv.lastAnswer) !== String(sv.lastAnswer) ||
                String(lv.reflection) !== String(sv.reflection) ||
                String(lv.lastTime) !== String(sv.lastTime) ||
                Number(lv.times || 0) !== Number(sv.times || 0) ||
                !!lv.mastered !== !!sv.mastered) { differs = true; break; }
          }
        }
        if (differs) {
          this.mistakes = Array.from(serverMap.values());
          try { localStorage.setItem('linalg_mistakes', JSON.stringify(this.mistakes)); } catch(e) {}
        }
      }
      return d;
    }).catch(() => {
      // 推送失败：保留删除记录，下次重试
      this._removedIds = (this._removedIds || []).concat(body.removed_ids || []);
      this._mistakesDirty = true;
      return null;
    });
  },

  loadProgress() {
    try {
      const data = localStorage.getItem('linalg_progress');
      this.progress = data ? JSON.parse(data) : {};
    } catch(e) {
      this.progress = {};
    }
  },

  saveProgress() {
    try {
      localStorage.setItem('linalg_progress', JSON.stringify(this.progress));
    } catch(e) {}
  },

  // ============ 添加错题 ============
  addMistake(question, userAnswer) {
    // 检查是否已存在
    const existing = this.mistakes.find(m => m.id === question.id);
    if (existing) {
      existing.times++;
      existing.lastAnswer = userAnswer;
      existing.lastTime = new Date().toISOString();
    } else {
      this.mistakes.push({
        id: question.id,
        chapter: question.chapter,
        knowledgePoint: question.knowledgePoint,
        question: question.question,
        correctAnswer: question.answer,
        userAnswer: userAnswer,
        explanation: question.explanation,
        type: question.type,
        difficulty: question.difficulty,
        times: 1,
        firstTime: new Date().toISOString(),
        lastTime: new Date().toISOString(),
        reflection: '',
        mastered: false
      });
    }
    this.saveMistakes();

    // 同步到后端知识图谱归因系统（登录用户）
    if (Auth.isLoggedIn) {
      Auth._fetch('/api/mistakes', {
        method: 'POST',
        body: JSON.stringify({
          question: question.question,
          user_answer: userAnswer,
          correct_answer: question.answer,
          knowledge_point: question.knowledgePoint || '',
          chapter: question.chapter || '',
        })
      }).catch(() => {});
    }
  },

  // 从错题本移除（标记为已掌握）
  markMastered(id) {
    const m = this.mistakes.find(m => m.id === id);
    if (m) {
      m.mastered = true;
      this.saveMistakes();
    }
  },

  removeMistake(id) {
    this.mistakes = this.mistakes.filter(m => m.id !== id);
    // 记录删除的题目 ID，云端同步删除（跨设备生效）
    this._removedIds = this._removedIds || [];
    this._removedIds.push(id);
    this.saveMistakes();
  },

  updateReflection(id, text) {
    const m = this.mistakes.find(m => m.id === id);
    if (m) {
      m.reflection = text;
      this.saveMistakes();
    }
  },

  // ============ 答案判定 ============
  checkAnswer(question, userAnswer) {
    if (userAnswer === undefined || userAnswer === null) return false;
    
    // judge 题型
    if (question.type === 'judge') {
      // 标准答案与用户输入都可能是 'true'/'false'/'对'/'错'/true/false，统一归一化后比较
      const ansStr = String(question.answer).trim();
      const ansBool = ansStr === 'true' || ansStr === '对' || ansStr === '正确' || ansStr === '√' || question.answer === true;
      const ua = String(userAnswer).trim();
      const userBool = ua === 'true' || ua === '对' || ua === '正确' || ua === '√' || ua === 'yes' || ua === 'T' || userAnswer === true;
      const userBoolFalse = ua === 'false' || ua === '错' || ua === '错误' || ua === '×' || ua === 'no' || ua === 'F' || userAnswer === false;
      if (userBool) return ansBool;
      if (userBoolFalse) return !ansBool;
      return false;
    }
    
    // multi 多选题
    if (question.type === 'multi') {
      const ua = String(userAnswer).trim().toUpperCase().replace(/[^ABCD]/g, '');
      const ans = String(question.answer).trim().toUpperCase().replace(/[^ABCD]/g, '');
      // 排序后比较
      return ua.split('').sort().join('') === ans.split('').sort().join('');
    }
    
    // proof / comprehensive 证明题和综合题（简答题）
    if (question.type === 'proof' || question.type === 'comprehensive') {
      const ua = String(userAnswer).trim();
      if (ua === '' || ua.length < 2) return false;
      // 检查是否包含关键词
      if (question.acceptValues && question.acceptValues.length > 0) {
        const uaLower = ua.toLowerCase();
        return question.acceptValues.some(av => uaLower.includes(av.toLowerCase()));
      }
      // 默认接受"证明完成"等
      const keywords = ['证明', '证毕', '完成', 'done', '证完', '证明完毕', '得证'];
      return keywords.some(k => ua.toLowerCase().includes(k));
    }
    
    if (!userAnswer || String(userAnswer).trim() === '') return false;
    const ua = String(userAnswer).trim();

    if (question.type === 'choice') {
      return ua.toUpperCase() === question.answer.toUpperCase();
    }

    if (question.type === 'fill' || question.type === 'calc') {
      // 标准化比较：去除空格、统一格式
      const normalize = s => s.replace(/\s+/g, '').toLowerCase().replace(/y2/g, 'y₂');
      const uaNorm = normalize(ua);
      if (uaNorm === normalize(question.answer)) return true;
      if (question.acceptValues) {
        for (const av of question.acceptValues) {
          if (uaNorm === normalize(av)) return true;
        }
      }
      // 数值比较
      const uaNum = parseFloat(ua);
      const ansNum = parseFloat(question.answer);
      if (!isNaN(uaNum) && !isNaN(ansNum)) {
        return Math.abs(uaNum - ansNum) < 0.01;
      }
      return false;
    }

    return false;
  },

  // ============ 统计分析 ============
  getStats() {
    const total = this.mistakes.length;
    const mastered = this.mistakes.filter(m => m.mastered).length;
    const active = total - mastered;

    // 按章节统计
    const byChapter = {};
    this.mistakes.forEach(m => {
      if (!m.mastered) {
        if (!byChapter[m.chapter]) byChapter[m.chapter] = 0;
        byChapter[m.chapter]++;
      }
    });

    // 按知识点统计
    const byKnowledge = {};
    this.mistakes.forEach(m => {
      if (!m.mastered) {
        if (!byKnowledge[m.knowledgePoint]) byKnowledge[m.knowledgePoint] = 0;
        byKnowledge[m.knowledgePoint]++;
      }
    });

    // 按难度统计
    const byDifficulty = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    this.mistakes.forEach(m => {
      if (!m.mastered) byDifficulty[m.difficulty]++;
    });

    // 高频错题（错3次以上）
    const frequent = this.mistakes.filter(m => m.times >= 2 && !m.mastered)
      .sort((a, b) => b.times - a.times);

    return { total, mastered, active, byChapter, byKnowledge, byDifficulty, frequent };
  },

  // ============ 练习进度 ============
  markQuestionDone(questionId, correct) {
    if (!this.progress[questionId]) {
      this.progress[questionId] = { attempts: 0, correct: 0 };
    }
    this.progress[questionId].attempts++;
    if (correct) this.progress[questionId].correct++;
    this.saveProgress();
  },

  getProgressStats() {
    const total = Object.keys(this.progress).length;
    const mastered = Object.values(this.progress).filter(p => p.correct >= 1).length;
    return { total, mastered };
  },

  /**
   * 学生画像：计算各章节掌握度与推荐学习路径
   */
  getMasteryProfile() {
    const chapters = [
      { id: 'ch1', title: '行列式' },
      { id: 'ch2', title: '矩阵' },
      { id: 'ch3', title: '向量与方程组' },
      { id: 'ch4', title: '特征值' },
      { id: 'ch5', title: '二次型' },
      { id: 'ch6', title: '向量空间' },
    ];

    const profile = chapters.map(ch => {
      // 该章节总题数
      const totalQ = QuizBank.questions.filter(q => q.chapter === ch.id).length;
      // 未掌握错题数
      const unmastered = this.mistakes.filter(m => m.chapter === ch.id && !m.mastered).length;
      // 已掌握错题数（曾经错过但已重做正确）
      const mastered = this.mistakes.filter(m => m.chapter === ch.id && m.mastered).length;
      // 练习记录
      const practiced = Object.values(this.progress).filter(p => {
        const q = QuizBank.getById(Object.keys(this.progress).find(k => this.progress[k] === p));
        return q && q.chapter === ch.id;
      }).length;

      // 掌握度计算
      let mastery = 0;
      if (unmastered === 0 && mastered > 0) mastery = 100;
      else if (unmastered === 0 && practiced > 0) mastery = 90;
      else if (unmastered + mastered > 0) mastery = Math.round(mastered / (mastered + unmastered) * 100);
      else if (practiced > 0) mastery = 75;
      else mastery = 0;

      return {
        ...ch,
        totalQ,
        unmastered,
        mastered,
        practiced,
        mastery,
        status: mastery >= 80 ? 'good' : mastery >= 50 ? 'ok' : mastery > 0 ? 'weak' : 'new'
      };
    });

    // 推荐学习顺序：掌握度低的优先
    const recommendations = profile
      .filter(p => p.mastery < 80)
      .sort((a, b) => a.mastery - b.mastery)
      .map(p => p.title);

    // 总体统计
    const totalMistakes = this.mistakes.length;
    const totalMastered = this.mistakes.filter(m => m.mastered).length;
    const totalActive = totalMistakes - totalMastered;
    const overallMastery = profile.length > 0
      ? Math.round(profile.reduce((s, p) => s + p.mastery, 0) / profile.length)
      : 0;

    return { chapters: profile, recommendations, totalMistakes, totalMastered, totalActive, overallMastery };
  }
};

// 导出到全局（便于外部/调试访问）
window.QuizSystem = QuizSystem;
