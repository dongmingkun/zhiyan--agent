/**
 * 测试/练习/错题本 UI 渲染与交互
 */

const QuizUI = {

  // ============ 测试中心 ============

  renderQuizHome() {
    const container = document.getElementById('quiz-content');
    if (!container) return;

    const chapters = QuizBank.meta.chapters;
    const stats = QuizSystem.getStats();

    container.innerHTML = `
      <div class="quiz-home">
        <div class="quiz-intro-card">
          <div class="quiz-intro-icon">📝</div>
          <h2>在线测试中心</h2>
          <p>选择章节开始测试，系统将自动计时、评分，并记录错题到错题本</p>
        </div>

        <div class="quiz-mode-grid">
          <div class="quiz-mode-card" onclick="QuizUI.startFullQuiz()">
            <div class="qm-icon">🏆</div>
            <h3>综合测试</h3>
            <p>全部章节 · 10题 · 限时20分钟</p>
            <div class="qm-badge">推荐</div>
          </div>
          <div class="quiz-mode-card" onclick="QuizUI.startQuickQuiz()">
            <div class="qm-icon">⚡</div>
            <h3>快速测验</h3>
            <p>随机抽题 · 5题 · 不限时</p>
          </div>
          <div class="quiz-mode-card" onclick="QuizUI.startAdaptiveQuiz()">
            <div class="qm-icon">🎯</div>
            <h3>自适应测试</h3>
            <p>智能出题 · 针对薄弱 · 8题</p>
            <div class="qm-badge">AI</div>
          </div>
          <div class="quiz-mode-card" onclick="QuizUI.startRushQuiz()">
            <div class="qm-icon">🔥</div>
            <h3>限时闯关</h3>
            <p>每题限时2分钟 · 连对奖励</p>
          </div>
          <div class="quiz-mode-card" onclick="QuizUI.startWeakPointQuiz()">
            <div class="qm-icon">💪</div>
            <h3>专项突破</h3>
            <p>薄弱知识点 · 定向强化</p>
          </div>
          <div class="quiz-mode-card" onclick="QuizUI.startMistakeQuiz()">
            <div class="qm-icon">🔄</div>
            <h3>错题巩固</h3>
            <p>基于错题本 · 智能复测</p>
          </div>
        </div>

        <div class="quiz-chapter-section">
          <h3 class="section-title">按章节测试</h3>
          <div class="quiz-chapter-grid">
            ${chapters.map(ch => `
              <div class="quiz-chapter-card" onclick="QuizUI.startChapterQuiz('${ch.id}')">
                <div class="qc-icon">${ch.icon}</div>
                <div class="qc-info">
                  <div class="qc-title">${ch.title}</div>
                  <div class="qc-meta">${ch.count} 道题</div>
                </div>
                <div class="qc-arrow">→</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="quiz-stats-bar">
          <div class="qs-item">
            <span class="qs-num">${QuizSystem.getProgressStats().total}</span>
            <span class="qs-label">已练习题数</span>
          </div>
          <div class="qs-item">
            <span class="qs-num">${stats.mastered}</span>
            <span class="qs-label">已掌握错题</span>
          </div>
          <div class="qs-item">
            <span class="qs-num">${stats.active}</span>
            <span class="qs-label">待纠正错题</span>
          </div>
        </div>
      </div>
    `;
  },

  startFullQuiz() {
    const questions = QuizBank.generateQuiz('all', 10);
    this.startQuiz(questions, 20, '综合测试');
  },

  startQuickQuiz() {
    const questions = QuizBank.generateQuiz('all', 5);
    this.startQuiz(questions, 0, '快速测验');
  },

  startAdaptiveQuiz() {
    // 从 localStorage 读取学习历史
    let history = { weakPoints: [], incorrect: [], avgDifficulty: 2 };
    try {
      const progress = JSON.parse(localStorage.getItem('linalg_progress') || '{}');
      const mistakes = JSON.parse(localStorage.getItem('linalg_mistakes') || '[]');
      
      // 收集薄弱知识点（做错2次以上的知识点）
      const kpCount = {};
      mistakes.forEach(m => { kpCount[m.knowledgePoint] = (kpCount[m.knowledgePoint]||0)+1; });
      history.weakPoints = Object.entries(kpCount).filter(([_,c]) => c>=2).map(([kp,_]) => kp);
      
      // 收集做错的题
      history.incorrect = mistakes.filter(m => !m.mastered).map(m => m.id);
      
      // 计算平均难度
      const allProgress = Object.values(progress);
      if (allProgress.length > 0) {
        const totalAttempts = allProgress.reduce((s,p) => s+p.attempts, 0);
        history.avgDifficulty = totalAttempts > 0 ? 2 + Math.min(2, Math.floor(totalAttempts / 20)) : 2;
      }
    } catch(e) {}
    
    const questions = QuizBank.generateAdaptiveQuiz('all', 8, history);
    this.startQuiz(questions, 0, '自适应测试');
  },

  startRushQuiz() {
    // 闯关模式：每题限时2分钟，从基础题开始逐渐增加难度
    const questions = QuizBank.generateQuiz('all', 10, { difficulty: [1, 2, 3] });
    // 重新排序：先易后难
    questions.sort((a, b) => a.difficulty - b.difficulty);
    this.startQuiz(questions, 20, '限时闯关'); // 总限时20分钟
  },

  startWeakPointQuiz() {
    // 专项突破：只出薄弱知识点的题
    let weakPoints = [];
    try {
      const mistakes = JSON.parse(localStorage.getItem('linalg_mistakes') || '[]');
      const kpCount = {};
      mistakes.filter(m => !m.mastered).forEach(m => { kpCount[m.knowledgePoint] = (kpCount[m.knowledgePoint]||0)+1; });
      weakPoints = Object.entries(kpCount).filter(([_,c]) => c>=1).map(([kp,_]) => kp);
    } catch(e) {}
    
    if (weakPoints.length === 0) {
      this.showToast('暂无薄弱知识点记录，先去测试或练习吧！');
      return;
    }
    
    // 筛选薄弱知识点的题
    let pool = QuizBank.questions.filter(q => weakPoints.includes(q.knowledgePoint));
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const questions = shuffled.slice(0, Math.min(8, shuffled.length));
    this.startQuiz(questions, 0, '专项突破');
  },

  startMistakeQuiz() {
    // 错题巩固：从错题本中出题
    let mistakeIds = [];
    try {
      const mistakes = JSON.parse(localStorage.getItem('linalg_mistakes') || '[]');
      mistakeIds = mistakes.filter(m => !m.mastered).map(m => m.id);
    } catch(e) {}
    
    if (mistakeIds.length === 0) {
      this.showToast('错题本为空，先去测试或练习吧！');
      return;
    }
    
    const questions = mistakeIds.slice(0, 10).map(id => QuizBank.getById(id)).filter(q => q);
    this.startQuiz(questions, 0, '错题巩固');
  },

  // 按薄弱知识点发起专项练习（知识漏洞雷达 → 个性化补救闭环）
  startPracticeByKP(kp) {
    if (!QuizBank || !QuizBank.questions) { this.showToast('题库未加载'); return; }
    const term = (kp || '').trim();
    if (!term) { this.showToast('知识点为空'); return; }
    let pool = QuizBank.questions.filter(q =>
      (q.knowledgePoint && q.knowledgePoint.indexOf(term) >= 0) ||
      (q.chapter && q.chapter.indexOf(term) >= 0)
    );
    if (pool.length === 0) {
      // 退而求其次：取知识点名的前两个字做模糊匹配
      const sub = term.slice(0, 2);
      pool = QuizBank.questions.filter(q => q.knowledgePoint && q.knowledgePoint.indexOf(sub) >= 0);
    }
    if (pool.length === 0) {
      this.showToast('该知识点暂无匹配练习题，先做其他练习');
      return;
    }
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const questions = shuffled.slice(0, Math.min(8, shuffled.length));
    App.switchView('quiz');
    setTimeout(() => this.startQuiz(questions, 0, `专项补救 · ${term}`), 70);
  },

  startChapterQuiz(chapterId) {
    const chapter = QuizBank.getChapterInfo(chapterId);
    const questions = QuizBank.generateQuiz(chapterId, chapter.count);
    this.startQuiz(questions, 15, chapter.title + ' 测试');
  },

  startQuiz(questions, timeLimit, title) {
    QuizSystem.state.questions = questions;
    QuizSystem.state.currentIndex = 0;
    QuizSystem.state.answers = [];
    QuizSystem.state.graded = {};
    QuizSystem.state.startTime = Date.now();
    QuizSystem.state.quizTitle = title;
    QuizSystem.state.timeLimit = timeLimit;

    if (timeLimit > 0) {
      this.startTimer(timeLimit * 60);
    }

    this.renderQuizQuestion();
  },

  startTimer(seconds) {
    if (QuizSystem.state.timerId) clearInterval(QuizSystem.state.timerId);
    const endTime = Date.now() + seconds * 1000;
    QuizSystem.state.timerId = setInterval(() => {
      const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      const timerEl = document.getElementById('quiz-timer');
      if (timerEl) {
        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        timerEl.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        if (remaining < 60) timerEl.classList.add('timer-warning');
      }
      if (remaining <= 0) {
        clearInterval(QuizSystem.state.timerId);
        this.finishQuiz();
      }
    }, 1000);
  },

  renderQuizQuestion() {
    const container = document.getElementById('quiz-content');
    if (!container) return;

    const idx = QuizSystem.state.currentIndex;
    const q = QuizSystem.state.questions[idx];
    if (!q) { this.finishQuiz(); return; }

    const total = QuizSystem.state.questions.length;
    const progress = ((idx) / total) * 100;

    container.innerHTML = `
      <div class="quiz-taking">
        <div class="quiz-header-bar">
          <div class="quiz-progress-info">
            <span class="qpi-title">${QuizSystem.state.quizTitle}</span>
            <span class="qpi-count">第 ${idx + 1} / ${total} 题</span>
          </div>
          ${QuizSystem.state.timeLimit > 0 ? `<div class="quiz-timer" id="quiz-timer">00:00</div>` : ''}
        </div>
        <div class="quiz-progress-bar">
          <div class="qpb-fill" style="width: ${progress}%"></div>
        </div>

        <div class="quiz-question-card">
          <div class="qq-meta">
            <span class="qq-type qq-type-${q.type}">${this.typeLabel(q.type)}</span>
            <span class="qq-diff qq-diff-${q.difficulty}">${this.diffLabel(q.difficulty)}</span>
            <span class="qq-chapter">${QuizBank.getChapterInfo(q.chapter)?.title || ''}</span>
          </div>
          <div class="qq-question">${this.formatQuestion(q.question)}</div>
          <div class="qq-answer-area" id="qq-answer-area">
            ${this.renderAnswerInput(q)}
          </div>
          <div class="qq-actions">
            ${idx > 0 ? '<button class="qq-btn qq-btn-prev" onclick="QuizUI.prevQuestion()">上一题</button>' : ''}
            <button class="qq-btn qq-btn-next" onclick="QuizUI.nextQuestion()">
              ${idx === total - 1 ? '提交测试' : '下一题'}
            </button>
          </div>
        </div>
      </div>
    `;

    // 聚焦输入框
    setTimeout(() => {
      const input = document.querySelector('#qq-answer-area input, #qq-answer-area textarea');
      if (input) input.focus();
    }, 100);
    // v=20260877 渲染题目中的 KaTeX 矩阵
    this._renderQuestionsLatex(container);
  },

  typeLabel(type) {
    const labels = { 
      choice: '单选题', multi: '多选题', judge: '判断题', 
      fill: '填空题', calc: '计算题', proof: '证明题', comprehensive: '综合题' 
    };
    return labels[type] || type;
  },

  diffLabel(d) {
    const labels = { 1: '基础', 2: '中等', 3: '进阶', 4: '高阶', 5: '竞赛' };
    return labels[d] || '';
  },

  formatQuestion(text) {
    if (!text) return '';
    // v=20220877 自动把纯文本矩阵格式转 LaTeX,KaTeX 渲染为数学矩阵
    text = this._normalizeMatrixToLatex(text);
    // v=20260824ze 必须先把题干里的 HTML 特殊字符(<,>,&)转义,
    // 否则像 "r(A)=r(A|b)=r<n..." 这种含 < 的题目文本会被浏览器当 HTML 解析,
    // 把 <n 当成未闭合标签吞掉后续所有题卡(→ 整张列表塌成单张超高卡片 / 嵌套错乱)
    text = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return text.replace(/\n/g, '<br>');
  },

  /** v=20260877 检测纯文本矩阵,包裹 LaTeX;支持 |...| 行列式、[]/[[]] 矩阵、单行多行 */
  _normalizeMatrixToLatex(text) {
    if (!text || text.indexOf('$') !== -1) return text;  // 已含 LaTeX,跳过
    // |a b; c d| → 行列式 vmatrix
    text = text.replace(/\|([^|\n]+)\|/g, (m, inner) => {
      const cells = this.matrixInnerToLatex(inner);
      if (!cells) return m;
      return '$\\begin{vmatrix} ' + cells + ' \\end{vmatrix}$';
    });
    // [[1,2,3],[4,5,6]] 或 [[1,2,3];[4,5,6]] 等嵌套数组(非贪婪到首个 ]])
    text = text.replace(/\[\[([\s\S]+?)\]\]/g, (m, inner) => {
      const cells = this.matrixInnerToLatex(inner);
      if (!cells) return m;
      return '$\\begin{bmatrix} ' + cells + ' \\end{bmatrix}$';
    });
    // [a,b;c,d](含 ;/;) → 矩阵 bmatrix
    text = text.replace(/\[([^\[\]\n;]+(?:[;；][^\[\]\n;]+)+)\]/g, (m, inner) => {
      const cells = this.matrixInnerToLatex(inner);
      if (!cells) return m;
      return '$\\begin{bmatrix} ' + cells + ' \\end{bmatrix}$';
    });
    return text;
  },

  matrixInnerToLatex(inner) {
    if (!inner) return null;
    const s = String(inner);
    let rows;
    if (s.includes(';') || s.includes('；')) {
      rows = s.split(/[;；]/);
    } else if (s.includes('],[')) {
      // 嵌套数组格式:[1,2,3],[4,5,6],[7,8,9]
      rows = s.split(/\]\s*,\s*\[/);
    } else {
      return null;
    }
    const cleaned = rows.map(r => r.replace(/[\[\]]/g, '').trim()).filter(Boolean);
    if (cleaned.length < 2) return null;
    const looksLikeNums = cleaned.every(r => /^[\d\s,.+\-]+$/.test(r));
    if (!looksLikeNums) return null;
    return cleaned.map(r => r.split(/[,\s]+/).filter(Boolean).join(' & ')).join(' \\\\ ');
  },

  /** v=20260877 在答题/错题/复盘容器中渲染 KaTeX(被 formatQuestion 转的 $...$)*/
  _renderQuestionsLatex(container) {
    if (!container || !window.App || !App.renderLatexInElement) return;
    try {
      container.querySelectorAll('.qq-question, .qrw-question, .ms-q').forEach(el => {
        try { App.renderLatexInElement(el); } catch (e) {}
      });
    } catch (e) {}
  },

  renderAnswerInput(q, prefix = '') {
    const areaId = prefix ? `${prefix}-answer-area` : 'qq-answer-area';
    
    if (q.type === 'choice') {
      return q.options.map((opt, i) => `
        <div class="qq-option" onclick="QuizUI.selectOption(this, '${String.fromCharCode(65+i)}')">
          <span class="qo-letter">${String.fromCharCode(65+i)}</span>
          <span class="qo-text">${opt}</span>
        </div>
      `).join('');
    }
    
    if (q.type === 'multi') {
      // 多选题：允许多选，使用 checkbox 样式
      return q.options.map((opt, i) => `
        <div class="qq-option qq-option-multi" data-letter="${String.fromCharCode(65+i)}" onclick="QuizUI.toggleMultiOption(this)">
          <span class="qo-letter">☐ ${String.fromCharCode(65+i)}</span>
          <span class="qo-text">${opt}</span>
        </div>
      `).join('') + `<div class="qq-multi-hint">（请选择所有正确选项）</div>`;
    }
    
    if (q.type === 'judge') {
      return `
        <div class="qq-judge-options">
          <div class="qq-option qq-judge-option" onclick="QuizUI.selectOption(this, 'true')">
            <span class="qo-letter">✓</span>
            <span class="qo-text">正确 / True</span>
          </div>
          <div class="qq-option qq-judge-option" onclick="QuizUI.selectOption(this, 'false')">
            <span class="qo-letter">✗</span>
            <span class="qo-text">错误 / False</span>
          </div>
        </div>
      `;
    }
    
    if (q.type === 'proof' || q.type === 'comprehensive') {
      return `<textarea class="qq-textarea" rows="6" placeholder="请在此输入你的解答过程...">${QuizSystem.state.answers[QuizSystem.state.currentIndex] || ''}</textarea>`;
    }
    
    // fill / calc
    const placeholder = q.type === 'calc' ? '输入计算结果...' : '输入答案...';
    return `<input type="text" class="qq-input" placeholder="${placeholder}"
             onkeydown="if(event.key==='Enter')QuizUI.nextQuestion()"
             value="${QuizSystem.state.answers[QuizSystem.state.currentIndex] || ''}">`;
  },

  toggleMultiOption(el) {
    el.classList.toggle('selected');
    const selected = document.querySelectorAll('.qq-option-multi.selected');
    const letters = Array.from(selected).map(e => e.dataset.letter).sort().join('');
    QuizSystem.state.answers[QuizSystem.state.currentIndex] = letters;
  },

  selectOption(el, letter) {
    document.querySelectorAll('.qq-option').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
    QuizSystem.state.answers[QuizSystem.state.currentIndex] = letter;
  },

  getCurrentAnswer() {
    const idx = QuizSystem.state.currentIndex;
    if (QuizSystem.state.answers[idx]) return QuizSystem.state.answers[idx];
    
    // 多选题
    const multiSelected = document.querySelectorAll('.qq-option-multi.selected');
    if (multiSelected.length > 0) {
      const letters = Array.from(multiSelected).map(e => e.dataset.letter).sort().join('');
      QuizSystem.state.answers[idx] = letters;
      return letters;
    }
    
    const input = document.querySelector('#qq-answer-area input, #qq-answer-area textarea');
    if (input) {
      QuizSystem.state.answers[idx] = input.value;
      return input.value;
    }
    return '';
  },

  nextQuestion() {
    const idx = QuizSystem.state.currentIndex;
    const q = QuizSystem.state.questions[idx];
    const answer = this.getCurrentAnswer();

    if (!answer || answer.trim() === '') {
      this.showToast('请先作答再进入下一题');
      return;
    }

    // 判定并记录（同一题只判分一次：前后翻题返回时不再重复计入错题/进度）
    const qid = (q && q.id != null) ? String(q.id) : String(idx);
    QuizSystem.state.answers[idx] = answer;
    if (!QuizSystem.state.graded) QuizSystem.state.graded = {};
    if (!QuizSystem.state.graded[qid]) {
      const correct = QuizSystem.checkAnswer(q, answer);
      QuizSystem.state.graded[qid] = correct ? 1 : -1;
      QuizSystem.markQuestionDone(q.id, correct);
      if (!correct) {
        QuizSystem.addMistake(q, answer);
      }
    }

    if (idx === QuizSystem.state.questions.length - 1) {
      this.finishQuiz();
    } else {
      QuizSystem.state.currentIndex++;
      this.renderQuizQuestion();
    }
  },

  prevQuestion() {
    if (QuizSystem.state.currentIndex > 0) {
      QuizSystem.state.currentIndex--;
      this.renderQuizQuestion();
    }
  },

  finishQuiz() {
    if (QuizSystem.state.timerId) clearInterval(QuizSystem.state.timerId);

    const questions = QuizSystem.state.questions;
    const answers = QuizSystem.state.answers;
    let correct = 0;
    let wrongList = [];

    questions.forEach((q, i) => {
      const ans = answers[i] || '';
      const isCorrect = QuizSystem.checkAnswer(q, ans);
      if (isCorrect) {
        correct++;
      } else {
        wrongList.push({ question: q, userAnswer: ans });
      }
    });

    const total = questions.length;
    const score = Math.round((correct / total) * 100);
    const timeUsed = QuizSystem.state.startTime ?
      Math.floor((Date.now() - QuizSystem.state.startTime) / 1000) : 0;
    const min = Math.floor(timeUsed / 60);
    const sec = timeUsed % 60;

    let grade, gradeColor;
    if (score >= 90) { grade = '优秀'; gradeColor = '#10b981'; }
    else if (score >= 75) { grade = '良好'; gradeColor = '#3b82f6'; }
    else if (score >= 60) { grade = '及格'; gradeColor = '#f59e0b'; }
    else { grade = '需努力'; gradeColor = '#ef4444'; }

    const container = document.getElementById('quiz-content');
    container.innerHTML = `
      <div class="quiz-result">
        <div class="qr-header" style="border-color: ${gradeColor};">
          <div class="qr-score-circle" style="border-color: ${gradeColor};">
            <span class="qr-score-num" style="color: ${gradeColor};">${score}</span>
            <span class="qr-score-unit">分</span>
          </div>
          <div class="qr-grade" style="color: ${gradeColor};">${grade}</div>
        </div>

        <div class="qr-stats-grid">
          <div class="qrs-item">
            <div class="qrs-num">${total}</div>
            <div class="qrs-label">总题数</div>
          </div>
          <div class="qrs-item">
            <div class="qrs-num" style="color:#10b981;">${correct}</div>
            <div class="qrs-label">答对</div>
          </div>
          <div class="qrs-item">
            <div class="qrs-num" style="color:#ef4444;">${total - correct}</div>
            <div class="qrs-label">答错</div>
          </div>
          <div class="qrs-item">
            <div class="qrs-num">${min}分${sec}秒</div>
            <div class="qrs-label">用时</div>
          </div>
        </div>

        ${wrongList.length > 0 ? `
          <div class="qr-wrong-section">
            <h3>❌ 错题回顾（${wrongList.length}题）</h3>
            ${wrongList.map((w, i) => `
              <div class="qr-wrong-item">
                <div class="qrw-meta">
                  <span class="qq-type qq-type-${w.question.type}">${this.typeLabel(w.question.type)}</span>
                  <span class="qq-diff qq-diff-${w.question.difficulty}">${this.diffLabel(w.question.difficulty)}</span>
                </div>
                <div class="qrw-question">${this.formatQuestion(w.question.question)}</div>
                <div class="qrw-answer-row">
                  <div class="qrw-ans qrw-wrong">你的答案：${this.displayAnswer(w.question, w.userAnswer)}</div>
                  <div class="qrw-ans qrw-right">正确答案：${this.displayAnswer(w.question, w.question.answer)}</div>
                </div>
                <div class="qrw-explanation">💡 ${w.question.explanation}</div>
                <div class="qrw-kp">📌 知识点：${w.question.knowledgePoint}</div>
              </div>
            `).join('')}
          </div>
        ` : '<div class="qr-perfect">🎉 全部答对，太棒了！</div>'}

        <div class="qr-actions">
          <button class="qr-btn qr-btn-primary" onclick="QuizUI.renderQuizHome()">返回测试中心</button>
          <button class="qr-btn" onclick="QuizUI.viewMistakesFromQuiz()">查看错题本</button>
        </div>
      </div>
    `;
    // v=20260877 渲染错题复盘题面 KaTeX
    this._renderQuestionsLatex(container);
  },

  displayAnswer(q, answer) {
    if (q.type === 'choice' && q.options) {
      const idx = answer.charCodeAt(0) - 65;
      return `${answer}. ${q.options[idx] || ''}`;
    }
    return answer;
  },

  // ============ 练习题库 ============

  renderPracticeHome() {
    const container = document.getElementById('practice-content');
    if (!container) return;
    const chapters = QuizBank.meta.chapters;
    const diffs = QuizBank.meta.difficulties;
    const progressStats = QuizSystem.getProgressStats();
    // v=20260904b 数据一致性:练习进度统一取云端做题次数(Auth.user.total_practiced),
    // 与首页「已练习」同源;localStorage 进度仅作实时兜底(未登录/未同步时)。
    const cloudPracticed = (typeof Auth !== 'undefined' && Auth.user && Auth.user.total_practiced != null)
      ? Auth.user.total_practiced : progressStats.total;
    const displayTotal = cloudPracticed;
    // 已掌握题数:云端无「已掌握」字段时,以 local mastered 与 total 比例估算
    const displayMastered = cloudPracticed > 0
      ? Math.round(cloudPracticed * (progressStats.total > 0 ? progressStats.mastered / progressStats.total : 0.65))
      : progressStats.mastered;

    container.innerHTML = `
      <div class="practice-home">

        <!-- v=20260824x 左主区：筛选 / 进度 / 变式入口 / 题目列表 -->
        <div class="practice-main">

        <div class="practice-filter-bar">
          <div class="pf-group">
            <label>章节：</label>
            <select id="pf-chapter" onchange="QuizUI.renderPracticeList()">
              <option value="all">全部章节</option>
              ${chapters.map(ch => `<option value="${ch.id}">${ch.title} (${ch.count}题)</option>`).join('')}
            </select>
          </div>
          <div class="pf-group">
            <label>难度：</label>
            <select id="pf-difficulty" onchange="QuizUI.renderPracticeList()">
              <option value="0">全部难度</option>
              ${diffs.map(d => `<option value="${d.level}">${d.name}</option>`).join('')}
            </select>
          </div>
          <div class="pf-group">
            <label>题型：</label>
            <select id="pf-type" onchange="QuizUI.renderPracticeList()">
              <option value="all">全部题型</option>
              <option value="choice">单选题</option>
              <option value="multi">多选题</option>
              <option value="judge">判断题</option>
              <option value="fill">填空题</option>
              <option value="calc">计算题</option>
              <option value="proof">证明题</option>
              <option value="comprehensive">综合题</option>
            </select>
          </div>
        </div>

        <div class="practice-progress-bar">
          <div class="ppb-info">
            练习进度：已完成 <strong>${displayTotal}</strong> 题，
            其中 <strong style="color:var(--success)">${displayMastered}</strong> 题已掌握
          </div>
          <div class="ppb-bar">
            <div class="ppb-fill" style="width: ${displayTotal > 0 ? (displayMastered / displayTotal * 100) : 0}%"></div>
          </div>
        </div>

        <div class="vg-entry" onclick="QuizUI.showVariantsPanel('det', 5)">
          <div class="vg-entry-icon">🎲</div>
          <div class="vg-entry-text">
            <div class="vg-entry-title">变式练习 · 换数再练</div>
            <div class="vg-entry-sub">同一题型随机换数，避免背答案</div>
          </div>
          <div class="vg-entry-go">开始 →</div>
        </div>

        <div id="practice-list">
          ${this.renderPracticeListInner()}
        </div>

        </div><!-- /.practice-main -->

        <!-- v=20260904c 版权收敛：右侧栏改为「规范引用 + 自编样卷」，不再提供出版社 PDF 直链 -->
        <aside class="practice-side">
        <div class="exam-papers-block" id="external-papers">
          <div class="exam-papers-head">
            <b>📚 配套练习卷</b>
            <small>引用条目 + 自编样卷（无 PDF 直链）</small>
          </div>
          <div class="exam-papers-groups">
            ${(window.ExamPapers?.citations || []).map(c => `
              <div class="exam-papers-group">
                <div class="exam-papers-group-name">${c.icon} ${this._esc(c.title)}</div>
                <div class="exam-papers-desc">${this._esc(c.author)} · ${this._esc(c.publisher)}${c.isbn ? ' · ISBN ' + this._esc(c.isbn) : ''}</div>
                <div class="exam-papers-files">
                  <div class="exam-papers-cite">${this._esc(c.note)}</div>
                </div>
              </div>`).join('')}
            ${(window.ExamPapers?.groups || []).map(g => `
              <div class="exam-papers-group">
                <div class="exam-papers-group-name">${g.icon} ${this._esc(g.name)}</div>
                <div class="exam-papers-desc">${this._esc(g.desc)}</div>
                <div class="exam-papers-files">
                  ${g.files.map(f => `
                    <a class="exam-papers-file" href="uploads/downloads/${encodeURIComponent(f.file || '')}" target="_blank" rel="noopener" ${f.file ? '' : 'style="cursor:default;"'}>
                      <span class="ep-file-icon">📝</span>
                      <span class="ep-file-info">
                        <span class="ep-file-name">${this._esc(f.name)}</span>
                        <span class="ep-file-meta">${f.tag ? ' · ' + this._esc(f.tag) : ''}</span>
                        <span class="ep-file-meta">${this._esc(f.intro || '')}</span>
                      </span>
                      <span class="ep-file-open" ${f.file ? '' : 'style="opacity:.6;"'}>${f.file ? '查看 ↗' : '自编'}</span>
                    </a>`).join('')}
                </div>
              </div>`).join('')}
          </div>
        </div>

        </aside><!-- /.practice-side -->
      </div>
    `;
    // v=20260882 初次渲染时也要触发 LaTeX(renderPracticeList 只在 filter 变化时被调)
    if (window.App && App.renderLatexInElement) {
      try { App.renderLatexInElement(container); } catch (e) {}
    }
  },

    renderPracticeList() {
    const listEl = document.getElementById('practice-list');
    if (listEl) {
      listEl.innerHTML = this.renderPracticeListInner();
      // v=20260878 渲染题面预览里的 LaTeX 矩阵(.pi-question)
      if (window.App && App.renderLatexInElement) {
        try { App.renderLatexInElement(listEl); } catch (e) {}
      }
    }
  },

  renderPracticeListInner() {
    const chapter = document.getElementById('pf-chapter')?.value || 'all';
    const difficulty = parseInt(document.getElementById('pf-difficulty')?.value || '0');
    const type = document.getElementById('pf-type')?.value || 'all';

    let questions = QuizBank.questions.filter(q => {
      const chMatch = chapter === 'all' || q.chapter === chapter;
      const dMatch = difficulty === 0 || q.difficulty === difficulty;
      const tMatch = type === 'all' || q.type === type;
      return chMatch && dMatch && tMatch;
    });

    if (questions.length === 0) {
      return '<div class="practice-empty">没有符合条件的题目</div>';
    }

    return questions.map((q, i) => {
      const prog = QuizSystem.progress[q.id];
      const done = prog ? prog.attempts : 0;
      const correct = prog ? prog.correct : 0;
      const status = correct >= 1 ? 'mastered' : (done > 0 ? 'attempted' : 'new');

      return `
        <div class="practice-item ${status}" data-qid="${q.id}" onclick="QuizUI.toggleInlinePractice('${q.id}')">
          <div class="pi-top">
            <div class="pi-num">${i + 1}</div>
            <div class="pi-meta">
              <span class="qq-type qq-type-${q.type}">${this.typeLabel(q.type)}</span>
              <span class="qq-diff qq-diff-${q.difficulty}">${this.diffLabel(q.difficulty)}</span>
              <span class="pi-chapter">${QuizBank.getChapterInfo(q.chapter)?.title || ''}</span>
            </div>
          </div>
          <div class="pi-question">${this.formatQuestion(q.question.split('\n')[0])}</div>
          <div class="pi-right">
            ${status === 'mastered' ? '<span class="pi-status pi-mastered">✓ 已掌握</span>' : ''}
            ${status === 'attempted' ? '<span class="pi-status pi-attempted">待巩固</span>' : ''}
            ${status === 'new' ? '<span class="pi-status pi-new">未做</span>' : ''}
            <span class="pi-arrow">→</span>
          </div>
        </div>
      `;
    }).join('');
  },

  startPractice(questionId) {
    const q = QuizBank.getById(questionId);
    if (!q) return;

    const container = document.getElementById('practice-content');
    container.innerHTML = `
      <div class="practice-taking">
        <div class="pt-back">
          <button onclick="QuizUI.renderPracticeHome()">← 返回题库</button>
        </div>
        <div class="quiz-question-card">
          <div class="qq-meta">
            <span class="qq-type qq-type-${q.type}">${this.typeLabel(q.type)}</span>
            <span class="qq-diff qq-diff-${q.difficulty}">${this.diffLabel(q.difficulty)}</span>
            <span class="qq-chapter">${QuizBank.getChapterInfo(q.chapter)?.title || ''}</span>
          </div>
          <div class="qq-question">${this.formatQuestion(q.question)}</div>
          <div class="qq-answer-area" id="pt-answer-area">
            ${this.renderAnswerInput(q)}
          </div>
          <div class="qq-actions">
            <button class="qq-btn qq-btn-submit" onclick="QuizUI.submitPractice('${questionId}')">提交答案</button>
          </div>
          <div id="pt-feedback"></div>
        </div>
      </div>
    `;

    setTimeout(() => {
      const input = document.querySelector('#pt-answer-area input, #pt-answer-area textarea');
      if (input) input.focus();
    }, 100);
    // v=20260877 渲染练习题面 KaTeX
    this._renderQuestionsLatex(container);
  },

  submitPractice(questionId) {
    const q = QuizBank.getById(questionId);
    let answer = '';

    // 多选题
    const multiSelected = document.querySelectorAll('#pt-answer-area .qq-option-multi.selected');
    if (multiSelected.length > 0) {
      answer = Array.from(multiSelected).map(e => e.dataset.letter).sort().join('');
    } else {
      const selected = document.querySelector('#pt-answer-area .qq-option.selected');
      if (selected) {
        const onclickAttr = selected.getAttribute('onclick') || '';
        const match = onclickAttr.match(/'([A-D]|true|false)'/);
        if (match) answer = match[1];
      } else {
        const input = document.querySelector('#pt-answer-area input, #pt-answer-area textarea');
        if (input) answer = input.value;
      }
    }

    if (!answer || answer.trim() === '') {
      this.showToast('请先作答');
      return;
    }

    const correct = QuizSystem.checkAnswer(q, answer);
    QuizSystem.markQuestionDone(q.id, correct);
    if (!correct) {
      QuizSystem.addMistake(q, answer);
    }

    const feedbackEl = document.getElementById('pt-feedback');
    feedbackEl.innerHTML = `
      <div class="pt-feedback ${correct ? 'correct' : 'wrong'}">
        <div class="ptf-result">
          ${correct ? '✅ 回答正确！' : '❌ 回答错误'}
        </div>
        ${!correct ? `
          <div class="ptf-answers">
            <div class="ptf-row wrong">你的答案：${this.displayAnswer(q, answer)}</div>
            <div class="ptf-row right">正确答案：${this.displayAnswer(q, q.answer)}</div>
          </div>
        ` : ''}
        <div class="ptf-explanation">💡 ${q.explanation}</div>
        <div class="ptf-kp">📌 知识点：${q.knowledgePoint}</div>
        <div class="ptf-actions">
          <button class="ptf-btn" onclick="QuizUI.renderPracticeHome()">返回题库</button>
          <button class="ptf-btn ptf-btn-next" onclick="QuizUI.nextPractice('${questionId}')">下一题 →</button>
        </div>
      </div>
    `;
  },

  nextPractice(currentId) {
    const chapter = QuizSystem.state.selectedChapter || 'all';
    const questions = QuizBank.questions;
    const idx = questions.findIndex(q => q.id === currentId);
    if (idx >= 0 && idx < questions.length - 1) {
      this.startPractice(questions[idx + 1].id);
    } else {
      this.renderPracticeHome();
    }
  },

  // v=20260903i 练习题库卡片内联作答：手风琴式原位展开/收起（同时只展开一张）
  toggleInlinePractice(id) {
    const q = QuizBank.getById(id);
    if (!q) return;
    const card = document.querySelector('.practice-item[data-qid="' + id + '"]');
    if (!card) return;

    // 已展开则收起
    const existing = document.getElementById('pi-inline-' + id);
    if (existing) {
      existing.remove();
      card.classList.remove('pi-expanded');
      return;
    }

    // 先收起其它已展开卡片（同时只展开一张）
    document.querySelectorAll('.pi-inline').forEach(p => p.remove());
    document.querySelectorAll('.practice-item.pi-expanded').forEach(c => c.classList.remove('pi-expanded'));

    const panel = document.createElement('div');
    panel.className = 'pi-inline';
    panel.id = 'pi-inline-' + id;
    panel.innerHTML = `
      <div class="pi-inline-area" id="inline-${id}-area">
        ${this.renderAnswerInput(q, 'inline-' + id)}
      </div>
      <div class="pi-inline-actions">
        <button class="qq-btn qq-btn-submit" onclick="QuizUI.submitInlinePractice('${id}')">提交判定</button>
        <button class="qq-btn qq-btn-ghost" onclick="QuizUI.toggleInlinePractice('${id}')">收起</button>
      </div>
      <div class="pi-inline-feedback" id="inline-${id}-feedback"></div>
    `;
    card.classList.add('pi-expanded');
    card.insertAdjacentElement('afterend', panel);

    // 覆盖 fill/calc 输入框的 Enter 默认行为：内联提交判分而非跳到下一题
    const inp = panel.querySelector('input, textarea');
    if (inp) {
      inp.onkeydown = function (e) {
        if (e.key === 'Enter') { e.preventDefault(); QuizUI.submitInlinePractice(id); }
      };
      setTimeout(() => { try { inp.focus(); } catch (e) {} }, 60);
    }
    this._renderQuestionsLatex(panel);
  },

  // v=20260903i 内联判分：复用 checkAnswer + markQuestionDone + 错题入 mistakes，结果只写回该卡片反馈区
  submitInlinePractice(id) {
    const q = QuizBank.getById(id);
    if (!q) return;
    const scope = '#inline-' + id + '-area';

    let answer = '';
    const multiSelected = document.querySelectorAll(scope + ' .qq-option-multi.selected');
    if (multiSelected.length > 0) {
      answer = Array.from(multiSelected).map(e => e.dataset.letter).sort().join('');
    } else {
      const selected = document.querySelector(scope + ' .qq-option.selected');
      if (selected) {
        const m = (selected.getAttribute('onclick') || '').match(/'([A-D]|true|false)'/);
        if (m) answer = m[1];
      } else {
        const input = document.querySelector(scope + ' input, ' + scope + ' textarea');
        if (input) answer = input.value;
      }
    }

    if (!answer || answer.trim() === '') {
      this.showToast('请先作答');
      return;
    }

    const correct = QuizSystem.checkAnswer(q, answer);
    QuizSystem.markQuestionDone(q.id, correct);
    if (!correct) QuizSystem.addMistake(q, answer);

    const fb = document.getElementById('inline-' + id + '-feedback');
    if (fb) {
      fb.innerHTML = `
        <div class="pt-feedback ${correct ? 'correct' : 'wrong'}">
          <div class="ptf-result">${correct ? '✅ 回答正确！' : '❌ 回答错误'}</div>
          ${!correct ? `
            <div class="ptf-answers">
              <div class="ptf-row wrong">你的答案：${this.displayAnswer(q, answer)}</div>
              <div class="ptf-row right">正确答案：${this.displayAnswer(q, q.answer)}</div>
            </div>` : ''}
          <div class="ptf-explanation">💡 ${q.explanation}</div>
          <div class="ptf-kp">📌 知识点：${q.knowledgePoint}</div>
        </div>
      `;
      this._renderQuestionsLatex(fb);
    }

    // 即时更新该卡片状态徽标（保持展开不塌）
    const prog = QuizSystem.progress[q.id];
    const done = prog ? prog.attempts : 0;
    const cright = prog ? prog.correct : 0;
    const status = cright >= 1 ? 'mastered' : (done > 0 ? 'attempted' : 'new');
    const card = document.querySelector('.practice-item[data-qid="' + id + '"]');
    if (card) {
      card.classList.remove('new', 'attempted', 'mastered');
      card.classList.add(status);
      const right = card.querySelector('.pi-right');
      if (right) {
        right.innerHTML = (status === 'mastered' ? '<span class="pi-status pi-mastered">✓ 已掌握</span>'
          : status === 'attempted' ? '<span class="pi-status pi-attempted">待巩固</span>'
          : '<span class="pi-status pi-new">未做</span>') + '<span class="pi-arrow">→</span>';
      }
    }
  },

  // ============ 复习计划 ============

  renderReviewHome() {
    const container = document.getElementById('review-content');
    if (!container) return;
    container.innerHTML = `<div class="wf-loading"><div class="wf-spinner"></div><span>正在加载复习计划…</span></div>`;

    Promise.all([
      Auth._fetch('/api/review/today').then(r => r.ok ? r.json() : Promise.reject(new Error('today'))),
      Auth._fetch('/api/review/schedule').then(r => r.ok ? r.json() : Promise.reject(new Error('schedule'))),
    ]).then(([today, schedule]) => {
      this._renderReview(container, today, schedule);
    }).catch(() => {
      container.innerHTML = `<div class="wf-error">⚠️ 获取复习计划失败，请登录后重试。</div>`;
    });
  },

  _renderReview(container, today, schedule) {
    const queue = today.today_queue || [];
    const total = today.today_total || 0;
    const streak = today.streak_days || 0;
    const acc = today.avg_accuracy_7d != null ? today.avg_accuracy_7d : 0;
    const future = (schedule.schedule || []).filter(s => !queue.some(q => q.kp === s.kp) || s.next_due > new Date().toISOString());

    // 今日进度：后端 today_total 恒等于当前待复习队列长度（today_done 恒为 0），
    // 完成数只能由前端记录（本页「去练习」过的条目），分母取本次会话见过的最大待复习数。
    const doneKp = this._reviewDoneToday();
    this._reviewBaseTotal = Math.max(this._reviewBaseTotal || 0, total);
    const reviewDone = Math.min(doneKp.size, this._reviewBaseTotal);

    const queueHtml = queue.length === 0
      ? `<div class="rv-empty">今日没有到期复习项。<br>去做一次练习或诊断，答题会自动加入复习计划。</div>`
      : queue.map(q => `
          <div class="rv-item" data-kp="${this._esc(q.kp)}">
            <div class="rv-item-kp">${this._esc(q.kp)}</div>
            <div class="rv-item-meta">
              <span class="rv-tag">间隔 ${q.interval_days} 天</span>
              <span class="rv-tag gray">上次：${q.last_result === 'correct' ? '答对' : q.last_result === 'wrong' ? '答错' : '—'}</span>
            </div>
            <button class="rv-go-btn" data-kp="${this._esc(q.kp)}">去练习</button>
          </div>
        `).join('');

    const futureHtml = (schedule.schedule || []).length === 0
      ? `<div class="rv-empty">暂无未来安排，先练习积累答题记录。</div>`
      : (schedule.schedule || []).map(s => `
          <div class="rv-future-item">
            <span class="rv-future-kp">${this._esc(s.kp)}</span>
            <span class="rv-future-due">${this._formatDue(s.next_due)}</span>
            <span class="rv-future-mastery">掌握度 ${s.mastery != null ? s.mastery : '—'}%</span>
          </div>
        `).join('');

    container.innerHTML = `
      <div class="rv-home">
        <div class="rv-stats">
          <div class="rv-stat-card">
            <div class="rv-stat-num">${total}</div>
            <div class="rv-stat-label">今日待复习</div>
          </div>
          <div class="rv-stat-card">
            <div class="rv-stat-num">${reviewDone}/${this._reviewBaseTotal}</div>
            <div class="rv-stat-label">今日进度</div>
          </div>
          <div class="rv-stat-card">
            <div class="rv-stat-num">${streak}</div>
            <div class="rv-stat-label">连续复习天数</div>
          </div>
          <div class="rv-stat-card">
            <div class="rv-stat-num">${acc}%</div>
            <div class="rv-stat-label">近 7 天正确率</div>
          </div>
        </div>

        <div class="rv-section">
          <h3>📅 今日待复习</h3>
          <div class="rv-list">${queueHtml}</div>
        </div>

        <div class="rv-section">
          <h3>🗓️ 未来安排</h3>
          <div class="rv-future-list">${futureHtml}</div>
        </div>

        <div class="rv-footnote">
          <p>说明：间隔复习基于遗忘曲线，档位为 1/2/4/7/15 天；答对进一档，答错回退一天并提前到期。</p>
          <p>「近 7 天正确率」即记忆保持率，= 近 7 天答对次数 ÷ 作答总次数。</p>
        </div>
      </div>
    `;

    container.querySelectorAll('.rv-go-btn').forEach(b => b.addEventListener('click', () => {
      // 记入今日进度（后端不落库完成数，见 _renderReview 注释）
      this._reviewDoneToday().add(b.dataset.kp);
      this.startPracticeByKP(b.dataset.kp);
    }));
  },

  /** 今日已练复习项集合（前端会话级，跨天自动重置） */
  _reviewDoneToday() {
    const today = new Date().toISOString().slice(0, 10);
    if (this._reviewDay !== today) {
      this._reviewDay = today;
      this._reviewDoneKp = new Set();
      this._reviewBaseTotal = 0;
    }
    if (!this._reviewDoneKp) this._reviewDoneKp = new Set();
    return this._reviewDoneKp;
  },

  _formatDue(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      const now = new Date();
      const diff = Math.ceil((d - now) / 86400000);
      if (diff <= 0) return '今天';
      if (diff === 1) return '明天';
      if (diff < 7) return diff + ' 天后';
      return d.getMonth() + 1 + '月' + d.getDate() + '日';
    } catch (e) { return '—'; }
  },

  // ============ 错题本 ============

  renderMistakesHome() {
    const container = document.getElementById('mistakes-content');
    if (!container) return;
    this._mistakeFilter = this._mistakeFilter || { status: '', chapter: '', favorite: false, q: '', order: 'last_time' };
    const f = this._mistakeFilter;
    container.innerHTML = `<div class="wf-loading"><div class="wf-spinner"></div><span>正在加载错题本…</span></div>`;

    // v=20260907d 消灭式错题本：统计卡 + 四状态 tab + 筛选 + 错题卡 + 错题重练
    const params = new URLSearchParams();
    if (f.status) params.set('status', f.status);
    if (f.chapter) params.set('chapter', f.chapter);
    if (f.favorite) params.set('favorite', '1');
    if (f.q) params.set('q', f.q);
    params.set('order', f.order || 'last_time');
    params.set('limit', '200');

    Promise.all([
      Auth._fetch('/api/mistakes/stats').then(r => r.ok ? r.json() : Promise.reject(new Error('stats'))),
      Auth._fetch('/api/mistakes?' + params.toString()).then(r => r.ok ? r.json() : Promise.reject(new Error('list'))),
      Auth._fetch('/api/mistakes?limit=200').then(r => r.ok ? r.json() : {mistakes: []}),
    ]).then(([stats, listData, allData]) => {
      this._renderMistakesNew(container, stats, listData.mistakes || [], allData.mistakes || []);
    }).catch((err) => {
      // v=20260907d 修 bug：区分「未登录」与「其他异常」，不再一律提示"请登录后重试"
      if (err && (err.message === 'stats' || err.message === 'list')) {
        container.innerHTML = `<div class="wf-error">⚠️ 获取错题数据失败，请检查网络或稍后重试。</div>`;
      } else {
        container.innerHTML = `<div class="wf-error">⚠️ 获取错题数据失败，请登录后重试。</div>`;
      }
    });
  },

  // v=20260907d 四状态错题本渲染（消灭式闭环）
  _renderMistakesNew(container, stats, mistakes, allMistakes) {
    const STATUS_LABEL = {
      active: { text: '未消灭', cls: 'active' },
      consolidating: { text: '巩固中', cls: 'consolidating' },
      eliminated: { text: '已消灭', cls: 'eliminated' },
      archived: { text: '已归档', cls: 'archived' },
    };
    const TABS = [
      { key: '', label: '全部' },
      { key: 'active', label: '未消灭' },
      { key: 'consolidating', label: '巩固中' },
      { key: 'eliminated', label: '已消灭' },
    ];
    const f = this._mistakeFilter || { status: '', chapter: '', favorite: false, q: '', order: 'last_time' };

    // 章节筛选项（从全部错题中提取）
    const chapters = [...new Set((allMistakes || []).map(m => m.chapter).filter(Boolean))].sort();

    const tabsHtml = TABS.map(t => `
      <button class="ms-status-tab ${f.status === t.key ? 'active' : ''}" data-status="${t.key}">${t.label}</button>
    `).join('');

    const chapterOpts = ['<option value="">全部章节</option>']
      .concat(chapters.map(c => `<option value="${this._esc(c)}" ${f.chapter === c ? 'selected' : ''}>${this._esc(c)}</option>`)).join('');

    // 错题卡列表
    const cards = mistakes.length === 0
      ? `<div class="ms-empty">做一次练习或测验，答错的题会自动收进来，不需要手动添加。</div>`
      : mistakes.map(m => {
          const st = STATUS_LABEL[m.status] || STATUS_LABEL.active;
          const fav = (m.favorite) ? '★' : '☆';
          const canRedo = m.status !== 'eliminated';
          return `
            <div class="ms-card" data-id="${m.id}" data-status="${m.status || 'active'}">
              <div class="ms-card-head">
                <span class="ms-status-badge ms-st-${st.cls}">${st.text}</span>
                <span class="ms-tag">${this._esc(m.knowledge_point || '未分类')}</span>
                <span class="ms-tag gray">${this._esc(m.chapter || '')}</span>
                <span class="ms-times">错 ${m.times || 1} 次</span>
              </div>
              <div class="ms-q">${this.formatQuestion(m.question)}</div>
              <div class="ms-ans-line"><b>我的答案：</b>${this._esc(m.user_answer || '（未作答）')}</div>
              <div class="ms-ans-line"><b>正确答案：</b>${this._esc(m.correct_answer || '—')}</div>
              <div class="ms-card-actions">
                <button class="ms-fav-btn" data-id="${m.id}" data-fav="${m.favorite ? 1 : 0}" title="收藏">${fav} 收藏</button>
                ${canRedo ? `<button class="ms-redo-btn" data-id="${m.id}" data-kp="${this._esc(m.knowledge_point || '')}">重做</button>` : ''}
                ${m.status === 'archived' ? `<button class="ms-restore-btn" data-id="${m.id}">取消归档</button>` : `<button class="ms-archive-btn" data-id="${m.id}">归档</button>`}
                <button class="ms-del" data-id="${m.id}">删除</button>
              </div>
            </div>
          `;
        }).join('');

    const activeCount = (allMistakes || []).filter(m => (m.status || 'active') === 'active').length;
    const consolidatingCount = (allMistakes || []).filter(m => (m.status || 'active') === 'consolidating').length;
    const redoable = activeCount + consolidatingCount;

    container.innerHTML = `
      <div class="ms-home ms-home-new">
        <div class="ms-head">
          <h2>错题消灭计划</h2>
          <p>答错的题自动收进来，连续重做答对即可消灭。做一次练习或测验，答错的题会自动收录。</p>
        </div>

        <div class="ms-stats-grid">
          <div class="ms-stat-card">
            <div class="ms-stat-num">${stats.elimination_rate}%</div>
            <div class="ms-stat-label">消灭率</div>
          </div>
          <div class="ms-stat-card">
            <div class="ms-stat-num">${stats.pending}</div>
            <div class="ms-stat-label">待消灭</div>
          </div>
          <div class="ms-stat-card">
            <div class="ms-stat-num">${stats.eliminated}</div>
            <div class="ms-stat-label">已消灭</div>
          </div>
          <div class="ms-stat-card">
            <div class="ms-stat-num">${stats.week_new}</div>
            <div class="ms-stat-label">近 7 天新增</div>
          </div>
        </div>

        <div class="ms-toolbar">
          <div class="ms-tabs">${tabsHtml}</div>
          <div class="ms-filters">
            <select id="ms-filter-chapter" class="ms-select">${chapterOpts}</select>
            <label class="ms-fav-filter"><input type="checkbox" id="ms-filter-fav" ${f.favorite ? 'checked' : ''}> 只看收藏</label>
            <input id="ms-filter-q" class="ms-search" type="text" placeholder="搜索题面关键词" value="${this._esc(f.q)}">
            <select id="ms-filter-order" class="ms-select">
              <option value="last_time" ${f.order !== 'created' ? 'selected' : ''}>最近错误时间</option>
              <option value="created" ${f.order === 'created' ? 'selected' : ''}>收录时间</option>
            </select>
          </div>
        </div>

        <div class="ms-redo-bar">
          <button class="ms-redo-all-btn" id="ms-redo-all" ${redoable > 0 ? '' : 'disabled'}>
            错题重练（${redoable} 题）
          </button>
          <label class="ms-variant-filter"><input type="checkbox" id="ms-variant-only"> 只练变式（同知识点新题）</label>
        </div>

        <div class="ms-card-list">${cards}</div>
      </div>
    `;

    // 绑定事件
    container.querySelectorAll('.ms-status-tab').forEach(b => b.addEventListener('click', () => {
      this._mistakeFilter.status = b.dataset.status;
      this.renderMistakesHome();
    }));
    const chapterSel = document.getElementById('ms-filter-chapter');
    if (chapterSel) chapterSel.addEventListener('change', () => {
      this._mistakeFilter.chapter = chapterSel.value;
      this.renderMistakesHome();
    });
    const favChk = document.getElementById('ms-filter-fav');
    if (favChk) favChk.addEventListener('change', () => {
      this._mistakeFilter.favorite = favChk.checked;
      this.renderMistakesHome();
    });
    const qInput = document.getElementById('ms-filter-q');
    if (qInput) {
      qInput.addEventListener('change', () => {
        this._mistakeFilter.q = qInput.value.trim();
        this.renderMistakesHome();
      });
      qInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { this._mistakeFilter.q = qInput.value.trim(); this.renderMistakesHome(); } });
    }
    const orderSel = document.getElementById('ms-filter-order');
    if (orderSel) orderSel.addEventListener('change', () => {
      this._mistakeFilter.order = orderSel.value;
      this.renderMistakesHome();
    });

    container.querySelectorAll('.ms-del').forEach(b => b.addEventListener('click', e => this._deleteMistake(e.target.dataset.id)));
    container.querySelectorAll('.ms-archive-btn').forEach(b => b.addEventListener('click', e => this._archiveMistake(e.target.dataset.id)));
    container.querySelectorAll('.ms-restore-btn').forEach(b => b.addEventListener('click', e => this._restoreMistake(e.target.dataset.id)));
    container.querySelectorAll('.ms-redo-btn').forEach(b => b.addEventListener('click', e => this._startMistakeRedo(e.target.dataset.id)));
    container.querySelectorAll('.ms-fav-btn').forEach(b => b.addEventListener('click', e => this._toggleMistakeFavorite(e.target)));
    const redoAll = document.getElementById('ms-redo-all');
    if (redoAll) redoAll.addEventListener('click', () => this._startMistakeRedoAll());

    this._renderQuestionsLatex(container);
  },

  _archiveMistake(id) {
    Auth._fetch(`/api/mistakes/${id}/archive`, { method: 'POST' })
      .then(r => { if (r.ok) this.renderMistakesHome(); else alert('归档失败'); })
      .catch(() => alert('归档失败'));
  },

  _restoreMistake(id) {
    Auth._fetch(`/api/mistakes/${id}/restore`, { method: 'POST' })
      .then(r => { if (r.ok) this.renderMistakesHome(); else alert('操作失败'); })
      .catch(() => alert('操作失败'));
  },

  _toggleMistakeFavorite(btn) {
    const id = btn.dataset.id;
    const isFav = btn.dataset.fav === '1';
    const question = btn.closest('.ms-card')?.querySelector('.ms-q')?.textContent || '';
    if (!isFav) {
      // 收藏
      Auth._fetch('/api/favorites', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ question, answer: '', note: '' })
      }).then(r => r.ok ? r.json() : Promise.reject()).then(() => {
        btn.dataset.fav = '1';
        btn.textContent = '★ 收藏';
      }).catch(() => alert('收藏失败'));
    } else {
      // 取消收藏：删除该题面的收藏
      Auth._fetch('/api/favorites').then(r => r.json()).then(data => {
        const fav = (data.favorites || []).find(x => (x.question || '').trim() === question.trim());
        if (fav) {
          return Auth._fetch(`/api/favorites/${fav.id}`, { method: 'DELETE' });
        }
        return Promise.resolve();
      }).then(() => {
        btn.dataset.fav = '0';
        btn.textContent = '☆ 收藏';
      }).catch(() => alert('取消收藏失败'));
    }
  },

  // v=20260907d 错题重练：优先原题，可只练变式；提交走 complete_exercise 自动回写状态
  _startMistakeRedo(id) {
    const card = document.querySelector(`.ms-card[data-id="${id}"]`);
    if (!card) return;
    // 知识点挂在卡片内的「重做」按钮上（卡片本身没有 data-kp）
    const kp = card.querySelector('.ms-redo-btn')?.dataset.kp || '';
    const variantOnly = document.getElementById('ms-variant-only')?.checked || false;
    this._redoMistakeSingle(id, kp, variantOnly);
  },

  _startMistakeRedoAll() {
    const variantOnly = document.getElementById('ms-variant-only')?.checked || false;
    // 收集当前筛选范围内未消灭的错题
    const redoable = [...document.querySelectorAll('.ms-card[data-status="active"], .ms-card[data-status="consolidating"]')]
      .map(c => ({ id: c.dataset.id, kp: '' }));
    if (redoable.length === 0) { this.showToast('当前没有需要重做的错题'); return; }
    this._redoMistakeQueue = redoable;
    this._redoVariantOnly = variantOnly;
    this._redoIndex = 0;
    this._redoMistakeNext();
  },

  _redoMistakeNext() {
    const q = this._redoMistakeQueue || [];
    if (this._redoIndex >= q.length) {
      this.showToast('错题重练完成，相关知识点已加入复习计划');
      this.renderMistakesHome();
      return;
    }
    const item = q[this._redoIndex];
    this._redoMistakeSingle(item.id, item.kp, this._redoVariantOnly, true);
  },

  _redoMistakeSingle(id, kp, variantOnly, fromQueue) {
    // 获取错题详情
    Auth._fetch('/api/mistakes?limit=500').then(r => r.json()).then(data => {
      const m = (data.mistakes || []).find(x => String(x.id) === String(id));
      if (!m) { alert('未找到该错题'); return; }
      if (variantOnly) {
        // 只练变式：按题型生成同知识点新题
        this._redoMistakeVariant(m, fromQueue);
      } else {
        // 优先原题：展示原题让用户重做
        this._redoMistakeOriginal(m, fromQueue);
      }
    }).catch(() => alert('加载错题失败'));
  },

  _redoMistakeOriginal(m, fromQueue) {
    const container = document.getElementById('mistakes-content');
    if (!container) return;
    container.innerHTML = `
      <div class="ms-redo-panel">
        <div class="ms-redo-head">
          <span class="ms-tag">错题重练 · 原题</span>
          <span class="ms-tag gray">${this._esc(m.knowledge_point || '')}</span>
          ${fromQueue ? `<span class="ms-tag">${this._redoIndex + 1}/${this._redoMistakeQueue.length}</span>` : ''}
        </div>
        <div class="ms-redo-question">${this.formatQuestion(m.question)}</div>
        <div class="ms-redo-hint">请重新作答（原题），提交后系统会按「连续答对次数」更新错题状态</div>
        <textarea id="ms-redo-answer" class="ms-redo-input" rows="3" placeholder="输入你的答案"></textarea>
        <div id="ms-redo-feedback"></div>
        <div class="ms-redo-actions">
          <button id="ms-redo-cancel" class="ms-weak-btn">返回</button>
          <button id="ms-redo-submit" class="ms-weak-btn primary">提交重做</button>
        </div>
      </div>
    `;
    this._renderQuestionsLatex(container);
    document.getElementById('ms-redo-cancel').addEventListener('click', () => this.renderMistakesHome());
    document.getElementById('ms-redo-submit').addEventListener('click', () => {
      const userAns = document.getElementById('ms-redo-answer').value.trim();
      if (!userAns) { alert('请先作答'); return; }
      // 判分：简单比对（原题答案）
      const correct = this._judgeMistakeAnswer(m, userAns);
      this._submitMistakeRedo(m, userAns, correct, fromQueue);
    });
  },

  _redoMistakeVariant(m, fromQueue) {
    // 复用变式练习引擎：按知识点推断 task 类型
    const kp = m.knowledge_point || '';
    let task = 'det';
    if (/逆|inverse/.test(kp)) task = 'inverse';
    else if (/特征值|eigen/.test(kp)) task = 'eigenvalues';
    else if (/秩|rank/.test(kp)) task = 'rank';
    else if (/对角|diagonal/.test(kp)) task = 'diagonalize';
    else if (/行列式|det/.test(kp)) task = 'det';
    else if (/正交|施密特|schmidt/i.test(kp)) task = 'qr';
    else if (/方程组|线性方程|solve/.test(kp)) task = 'solve_linear';
    Auth._fetch('/api/practice/generate_variants', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ task, count: 1, kp_id: kp })
    }).then(r => r.json()).then(data => {
      const v = (data.variants || [])[0];
      if (!v) { alert('生成变式失败'); return; }
      const container = document.getElementById('mistakes-content');
      container.innerHTML = `
        <div class="ms-redo-panel">
          <div class="ms-redo-head">
            <span class="ms-tag">错题重练 · 变式</span>
            <span class="ms-tag gray">${this._esc(kp || '同题型')}</span>
          </div>
          <div class="ms-redo-question">${this.formatQuestion(v.problem)}</div>
          <div class="ms-redo-hint">这是同知识点的新变式题，作答后同样会更新错题消灭进度</div>
          <textarea id="ms-redo-answer" class="ms-redo-input" rows="3" placeholder="输入你的答案"></textarea>
          <div id="ms-redo-feedback"></div>
          <div class="ms-redo-actions">
            <button id="ms-redo-cancel" class="ms-weak-btn">返回</button>
            <button id="ms-redo-submit" class="ms-weak-btn primary">提交</button>
          </div>
        </div>
      `;
      this._renderQuestionsLatex(container);
      document.getElementById('ms-redo-cancel').addEventListener('click', () => this.renderMistakesHome());
      document.getElementById('ms-redo-submit').addEventListener('click', () => {
        const userAns = document.getElementById('ms-redo-answer').value.trim();
        if (!userAns) { alert('请先作答'); return; }
        // 变式题：不自动判分（主观），提交为"待诊断"= 视为答对（鼓励）
        this._submitMistakeRedo(m, userAns, true, fromQueue, true);
      });
    }).catch(() => alert('生成变式失败，请稍后重试'));
  },

  _judgeMistakeAnswer(m, userAns) {
    // 简单判分：比对正确答案（去除空格/大小写）
    const ca = String(m.correct_answer || '').trim();
    const ua = String(userAns || '').trim();
    if (!ca) return false;
    return ca === ua || ca.replace(/\s/g,'') === ua.replace(/\s/g,'');
  },

  _submitMistakeRedo(m, userAns, correct, fromQueue, isVariant) {
    const kp = m.knowledge_point || '线性代数综合';
    Auth._fetch('/api/student/complete_exercise', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        knowledge_points: [kp],
        correct,
        question: m.question || '',
        user_answer: userAns,
        correct_answer: m.correct_answer || '',
        response_time_seconds: 0
      })
    }).then(r => r.json()).then(res => {
      const fb = document.getElementById('ms-redo-feedback');
      const reason = res.redo_reason || '';
      if (fb) {
        fb.innerHTML = `
          <div class="stu-pq-fb stu-pq-${correct ? 'ok' : 'no'}">
            <div class="stu-pq-fb-head">${correct ? '✅ 回答正确' : '❌ 回答错误'}${reason ? ' · ' + reason : ''}</div>
            ${reason ? `<div class="ms-redo-reason">${this._esc(reason)}</div>` : ''}
            <div class="stu-pq-fb-actions">
              <button class="stu-weak-btn primary" id="ms-redo-next">${fromQueue ? '下一题 →' : '完成'}</button>
            </div>
          </div>`;
        document.getElementById('ms-redo-next').addEventListener('click', () => {
          if (fromQueue && this._redoMistakeQueue) {
            this._redoIndex++;
            this._redoMistakeNext();
          } else {
            this.renderMistakesHome();
          }
        });
      }
    }).catch(() => alert('提交失败，请稍后重试'));
  },

  _renderMistakesAnalysis(container, analysis, mistakes, graph) {
    const demoTag = analysis.demo_mode ? `<span class="ms-demo-tag">演示数据</span>` : '';
    const summary = analysis.summary || {};
    const radar = analysis.radar || [];

    // 按章节聚合雷达数据
    const chapterScores = {};
    radar.forEach(r => {
      chapterScores[r.chapter] = (chapterScores[r.chapter] || 0) + r.score;
    });
    const chapters = Object.keys(chapterScores).sort();
    const maxScore = Math.max(0.1, ...Object.values(chapterScores), 3);

    const recs = (analysis.recommendations || []).map(rec => `
      <div class="ms-rec-card">
        <div class="ms-rec-kp">📌 ${rec.knowledge_point} <span class="ms-rec-ch">${rec.chapter}</span></div>
        <div class="ms-rec-why">${rec.why}</div>
        ${rec.prereqs && rec.prereqs.length ? `<div class="ms-rec-pre">前置依赖：${rec.prereqs.map(p => '«'+p+'»').join(' → ')}</div>` : ''}
        <div class="ms-rec-action">${rec.action}</div>
        <button class="ms-rec-btn" data-kp="${this._esc(rec.knowledge_point)}">去做针对性练习</button>
      </div>
    `).join('');

    const mistakeRows = mistakes.length === 0
      ? `<div class="ms-empty">暂无错题记录。答题出错时会自动收录，也可以手动添加。</div>`
      : mistakes.map(m => `
        <div class="ms-row">
          <div class="ms-q">${this.formatQuestion(m.question)}</div>
          <div class="ms-meta">
            <span class="ms-tag">${m.knowledge_point || '未分类'}</span>
            <span class="ms-tag gray">${m.chapter || ''}</span>
            <span class="ms-date">${m.created ? m.created.slice(0,16).replace('T',' ') : ''}</span>
          </div>
          <div class="ms-ans-line"><b>你的答案：</b>${this._esc(m.user_answer)}</div>
          <div class="ms-ans-line"><b>正确答案：</b>${this._esc(m.correct_answer)}</div>
          <div class="ms-actions">
            <button class="ms-path-btn" data-kp="${this._esc(m.knowledge_point || '')}" data-kpid="${m.knowledge_point ? '' : ''}">📍 薄弱路径</button>
            <button class="ms-del" data-id="${m.id}">删除</button>
          </div>
        </div>
      `).join('');

    container.innerHTML = `
      <div class="ms-home">
        <div class="ms-head">
          <h2>🎯 知识漏洞雷达 ${demoTag}</h2>
          <p>基于错题自动归因到知识点，并沿前置依赖追溯薄弱根源。</p>
        </div>

        <div class="ms-dash">
          <div class="ms-radar-wrap">
            <canvas id="ms-radar-canvas" width="360" height="300"></canvas>
          </div>
          <div class="ms-summary">
            <div class="ms-stat">
              <div class="ms-stat-num">${summary.total_mistakes || 0}</div>
              <div class="ms-stat-label">累计错题</div>
            </div>
            <div class="ms-stat">
              <div class="ms-stat-num">${summary.weak_kps || 0}</div>
              <div class="ms-stat-label">薄弱知识点</div>
            </div>
            <div class="ms-stat">
              <div class="ms-stat-num">${summary.top_weak ? summary.top_weak.slice(0,6) : '—'}</div>
              <div class="ms-stat-label">最薄弱项</div>
            </div>
          </div>
        </div>

        <div class="ms-section ms-graph-section">
          <h3>🕸️ 知识点依赖图谱 <span class="ms-graph-hint">点击节点 → 高亮其「前置依赖 / 后继应用」</span></h3>
          <div class="ms-graph-wrap">
            <div class="ms-graph-canvas-box">
              <canvas id="ms-graph-canvas"></canvas>
            </div>
            <div class="ms-graph-side" id="ms-graph-info">
              <div class="ms-graph-tip">👆 点击左侧图谱中的任意<b>知识点节点</b>，查看它的<strong class="pre">前置依赖</strong>（掌握它需要先学的内容）与<strong class="suc">后继应用</strong>（学会它能解锁的内容）。点击空白处可取消。<br><br>节点描红表示你在该知识点上有<b>薄弱指数</b>，红圈越深代表越需要巩固。</div>
            </div>
          </div>
          <div class="ms-graph-legend" id="ms-graph-legend"></div>
        </div>

        <div class="ms-section">
          <h3>📋 薄弱知识点明细</h3>
          <div class="ms-kp-list">
            ${radar.filter(r => r.score > 0).map(r => `
              <div class="ms-kp-item">
                <span class="ms-kp-name">${r.knowledge_point}</span>
                <span class="ms-kp-ch">${r.chapter}</span>
                <div class="ms-kp-bar"><div style="width:${Math.min(100, (r.score/maxScore)*100)}%"></div></div>
                <span class="ms-kp-score">${r.score.toFixed(2)}</span>
              </div>
            `).join('') || '<div class="ms-empty">暂无薄弱知识点，继续保持！</div>'}
          </div>
        </div>

        <div class="ms-section">
          <h3>🚀 个性化补救建议</h3>
          <div class="ms-rec-grid">${recs || '<div class="ms-empty">暂无推荐</div>'}</div>
        </div>

        <div class="ms-section">
          <h3>➕ 手动记录错题</h3>
          <div class="ms-add">
            <textarea id="ms-add-q" rows="2" placeholder="题目内容（系统会自动识别知识点）"></textarea>
            <div class="ms-add-row">
              <input id="ms-add-ua" type="text" placeholder="你的答案" />
              <input id="ms-add-ca" type="text" placeholder="正确答案" />
              <button id="ms-add-btn">记录错题</button>
            </div>
          </div>
        </div>

        <div class="ms-section">
          <h3>📝 错题记录</h3>
          <div class="ms-list">${mistakeRows}</div>
        </div>
      </div>
    `;

    setTimeout(() => {
      this._drawRadar('ms-radar-canvas', chapters, chapterScores, maxScore);
      if (graph && graph.nodes) this._drawKnowledgeGraph('ms-graph-canvas', graph);
      document.querySelectorAll('.ms-rec-btn').forEach(b => b.addEventListener('click', () => this.startPracticeByKP(b.dataset.kp)));
      document.querySelectorAll('.ms-del').forEach(b => b.addEventListener('click', e => this._deleteMistake(e.target.dataset.id)));
      document.querySelectorAll('.ms-path-btn').forEach(b => b.addEventListener('click', () => this.showWeaknessPath(b.dataset.kp)));
      const addBtn = document.getElementById('ms-add-btn');
      if (addBtn) addBtn.addEventListener('click', () => this._addMistakeFromForm());
    }, 50);
    // v=20260877 渲染错题本里所有题面 KaTeX(被 formatQuestion 转的 $...$)
    this._renderQuestionsLatex(container);
  },

  /** v=20260869 P1 薄弱路径弹窗:BFS 上游链 + 最弱环节 + 补救顺序 */
  showWeaknessPath(kpName) {
    Auth._fetch('/api/mistakes/weakness_path')
      .then(r => r.ok ? r.json() : {})
      .then(data => {
        if (!data || !data.paths) return;
        const path = (data.paths || []).find(p => p.knowledgePoint === kpName) || (data.paths || [])[0];
        if (!path) { alert('未找到薄弱路径'); return; }
        const chainHtml = (path.chain || []).map(c => `
          <div class="wp-node ${c.isHighErrorProne ? 'wp-weak' : ''} ${c.id === kpName || c.id === path.knowledgeId ? 'wp-target' : ''} ${c.id === path.weakestId ? 'wp-weakest' : ''}">
            <div class="wp-node-name">${this._esc(c.name)}</div>
            <div class="wp-node-meta">
              <span class="wp-depth">${'↘ '.repeat(c.depth || 0)}层级 ${c.depth || 0}</span>
              <span class="wp-err">易错 ${Math.round((c.errorProne || 0) * 100)}%</span>
              ${c.isHighErrorProne ? '<span class="wp-flag">⚠ 高频易错</span>' : ''}
            </div>
          </div>
        `).join('<div class="wp-arrow">↓</div>');
        const remediationHtml = (path.remediationOrder || []).map((c, i) =>
          `<div class="wp-step">第 ${i + 1} 步:补强「${this._esc(c.name)}」</div>`).join('');
        const overlay = document.createElement('div');
        overlay.className = 'wp-overlay';
        overlay.innerHTML = `
          <div class="wp-modal">
            <div class="wp-head">
              <h3>📍 薄弱路径分析</h3>
              <button class="wp-close">×</button>
            </div>
            <div class="wp-body">
              <div class="wp-meta-row">
                <span class="wp-tag wp-tag-target">🎯 错题知识点:${this._esc(path.knowledgePoint)}</span>
                <span class="wp-tag wp-tag-err">❌ 错 ${path.mistakeCount} 次</span>
                <span class="wp-tag">深度 ${path.totalDepth} 层</span>
                ${path.weakestId && path.weakestId !== path.knowledgeId ? `<span class="wp-tag wp-tag-weakest">🎯 最弱:${this._esc(path.weakestName || '')}</span>` : ''}
              </div>
              <div class="wp-hint">${this._esc(path.hint || '')}</div>
              <div class="wp-section-title">🔍 完整依赖链(从根到错题):</div>
              <div class="wp-chain">${chainHtml || '<div class="wp-empty">无上游依赖</div>'}</div>
              <div class="wp-section-title">📋 推荐补救顺序(从根开始):</div>
              <div class="wp-remediation">${remediationHtml || '<div class="wp-empty">无需前置补强</div>'}</div>
              <div class="wp-foot-actions">
                <button class="wp-action-btn" id="wp-go-topo">🕸 在知识拓扑图上查看</button>
                <button class="wp-action-btn" id="wp-go-variants">🎲 生成变式练习</button>
                <button class="wp-action-btn wp-primary" id="wp-go-practice">🎯 按此路径做练习</button>
              </div>
            </div>
          </div>
        `;
        document.body.appendChild(overlay);
        // 关闭按钮
        const close = () => overlay.remove();
        overlay.querySelector('.wp-close').addEventListener('click', close);
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
        // 跳转到拓扑图(先写入聚焦参数,再由 renderTopology 消费,确保时序正确)
        overlay.querySelector('#wp-go-topo').addEventListener('click', () => {
          close();
          try {
            sessionStorage.setItem('la_topo_focus', path.knowledgeId);
            sessionStorage.setItem('la_topo_trace', JSON.stringify((path.chain || []).map(c => c.id)));
          } catch (e) {}
          if (window.App && App.switchView) App.switchView('topology');
        });
        // 跳转到针对性练习(v=20260873 按补救顺序从根节点开始,优先补基础)
        overlay.querySelector('#wp-go-practice').addEventListener('click', () => {
          close();
          const order = path.remediationOrder || [];
          let target = null;
          if (order.length) target = order[0].name || order[0].id || null;   // 根 → 错题
          if (!target) target = path.knowledgePoint;
          if (target && this.startPracticeByKP) this.startPracticeByKP(target);
        });
        // v=20260872 变式训练:按错题知识点生成一组同知识点变式题
        const vgBtn = overlay.querySelector('#wp-go-variants');
        if (vgBtn) vgBtn.addEventListener('click', () => {
          close();
          if (this.showVariantsPanelByKP) this.showVariantsPanelByKP(path.knowledgePoint);
        });
      })
      .catch(e => alert('加载薄弱路径失败:' + e.message));
  },

  _drawRadar(canvasId, labels, values, max) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const W = rect.width, H = rect.height;
    const cx = W / 2, cy = H / 2 + 10;
    const radius = Math.min(W, H) / 2 - 44;
    const n = labels.length || 1;
    const angleFor = i => -Math.PI / 2 + (i * 2 * Math.PI / n);

    ctx.clearRect(0, 0, W, H);
    // 网格
    for (let level = 1; level <= 4; level++) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = angleFor(i);
        const r = radius * level / 4;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1; ctx.stroke();
    }
    // 轴 + 标签
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = '#475569';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const a = angleFor(i);
      const x = cx + Math.cos(a) * radius;
      const y = cy + Math.sin(a) * radius;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.strokeStyle = '#cbd5e1'; ctx.stroke();
      const lx = cx + Math.cos(a) * (radius + 24);
      const ly = cy + Math.sin(a) * (radius + 24);
      ctx.fillText(labels[i].slice(0, 6), lx, ly);
    }
    // 数据区域
    if (n > 0) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = angleFor(i);
        const v = Math.min(values[labels[i]] || 0, max) / max;
        const r = radius * v;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(79,70,229,0.18)'; ctx.fill();
      ctx.strokeStyle = '#4f46e5'; ctx.lineWidth = 2; ctx.stroke();
      // 数据点
      for (let i = 0; i < n; i++) {
        const a = angleFor(i);
        const v = Math.min(values[labels[i]] || 0, max) / max;
        const x = cx + Math.cos(a) * radius * v;
        const y = cy + Math.sin(a) * radius * v;
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#4f46e5'; ctx.fill();
      }
    }
    // 标题
    ctx.fillStyle = '#0f172a'; ctx.font = 'bold 14px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('按章节薄弱分', cx, 18);
  },

  // ---------- 知识点依赖图谱（节点-连线，点击高亮前置/后继） ----------
  _kgChapterColors: {
    "行列式": "#2563eb",
    "矩阵及其运算": "#7c3aed",
    "向量与线性方程组": "#0891b2",
    "特征值与特征向量": "#db2777",
    "二次型": "#ea580c",
    "线性空间与线性变换": "#16a34a",
  },

  _drawKnowledgeGraph(canvasId, graph) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const wrap = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const W = wrap.clientWidth || 720;
    const H = 460;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const chapters = graph.chapters || [];
    const chapterColor = id => this._kgChapterColors[id] || '#64748b';

    // 计算节点位置：按章节分列（左→右 = 学习顺序），列内纵向均布
    const byCol = {};
    graph.nodes.forEach(n => {
      const c = Math.max(0, chapters.indexOf(n.chapter));
      (byCol[c] = byCol[c] || []).push(n);
    });
    const cols = Math.max(1, chapters.length);
    const marginX = 70, marginY = 40;
    const colW = (W - marginX * 2) / (cols - 1 || 1);
    const pos = {};
    for (const c in byCol) {
      const list = byCol[c];
      const n = list.length;
      list.forEach((node, i) => {
        pos[node.id] = {
          x: marginX + colW * Number(c),
          y: marginY + (H - marginY * 2) * ((i + 1) / (n + 1)),
        };
      });
    }

    // 构建前置/后继映射
    const prereqs = {}, succ = {};
    graph.edges.forEach(e => {
      if (pos[e.from] && pos[e.to]) {
        (prereqs[e.to] = prereqs[e.to] || []).push(e.from);
        (succ[e.from] = succ[e.from] || []).push(e.to);
      }
    });

    // 保存状态供点击交互使用
    this._kg = {
      graph, pos, prereqs, succ, chapterColor, selected: null,
      canvas, ctx, W, H,
    };

    const render = () => this._kgRender();

    // 绘制图例
    const legendEl = document.getElementById('ms-graph-legend');
    if (legendEl) {
      legendEl.innerHTML = chapters.map(ch =>
        `<span class="ms-leg-item"><span class="ms-leg-dot" style="background:${chapterColor(ch)}"></span>${ch}</span>`
      ).join('') +
        `<span class="ms-leg-item"><span class="ms-leg-dot ms-leg-weak"></span>薄弱节点（有错题）</span>`;
    }

    // 点击交互
    const clickHandler = (evt) => {
      const rect = canvas.getBoundingClientRect();
      const mx = evt.clientX - rect.left;
      const my = evt.clientY - rect.top;
      let hit = null, best = 18 * 18;
      for (const id in pos) {
        const dx = pos[id].x - mx, dy = pos[id].y - my;
        const d2 = dx * dx + dy * dy;
        if (d2 < best) { best = d2; hit = id; }
      }
      this._kg.selected = hit; // hit 可能为 null（取消）
      render();
      this._kgUpdateInfo();
    };
    canvas.onclick = clickHandler;
    this._kgRender();
    this._kgUpdateInfo();
  },

  _kgRender() {
    const kg = this._kg;
    if (!kg) return;
    const { ctx, W, H, pos, graph, prereqs, succ, chapterColor, selected } = kg;
    ctx.clearRect(0, 0, W, H);

    // 高亮集合
    const sel = selected;
    const preSet = new Set(sel ? (prereqs[sel] || []) : []);
    const sucSet = new Set(sel ? (succ[sel] || []) : []);

    // 列标题
    const chapters = graph.chapters || [];
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const colW = (W - 140) / (Math.max(1, chapters.length) - 1 || 1);
    chapters.forEach((ch, c) => {
      const x = 70 + colW * c;
      ctx.fillStyle = chapterColor(ch);
      ctx.fillText(ch, x, 16);
    });

    // 画边
    graph.edges.forEach(e => {
      const a = pos[e.from], b = pos[e.to];
      if (!a || !b) return;
      const touch = sel && (e.from === sel || e.to === sel);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      if (sel && touch) {
        ctx.strokeStyle = (e.to === sel) ? '#f59e0b' : '#14b8a6'; // 指向自身=前置(琥珀) / 自指出=后继(青)
        ctx.lineWidth = 2.4;
        ctx.globalAlpha = 1;
      } else if (sel) {
        ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1; ctx.globalAlpha = 0.55;
      } else {
        ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.9;
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    });

    // 画节点
    const weakMax = Math.max(1, ...graph.nodes.map(n => n.weak || 0));
    graph.nodes.forEach(n => {
      const p = pos[n.id];
      if (!p) return;
      const base = chapterColor(n.chapter);
      const weak = n.weak || 0;
      const isSel = n.id === sel;
      const isPre = preSet.has(n.id);
      const isSuc = sucSet.has(n.id);
      const r = isSel ? 13 : 9;

      // 薄弱红圈
      if (weak > 0) {
        const t = weak / weakMax;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(239,68,68,${0.35 + 0.5 * t})`;
        ctx.lineWidth = 2 + 2 * t;
        ctx.stroke();
      }

      // 主体
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = base;
      if (sel && !isSel && !isPre && !isSuc) {
        ctx.globalAlpha = 0.32;
      } else {
        ctx.globalAlpha = 1;
      }
      ctx.fill();
      ctx.globalAlpha = 1;

      // 选中/前置/后继环
      if (isSel) {
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2);
        ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2.5; ctx.stroke();
      } else if (isPre) {
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2);
        ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2.5; ctx.stroke();
      } else if (isSuc) {
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2);
        ctx.strokeStyle = '#14b8a6'; ctx.lineWidth = 2.5; ctx.stroke();
      }

      // 标签
      if (!sel || isSel || isPre || isSuc) {
        ctx.fillStyle = (sel && !isSel) ? '#94a3b8' : '#1e293b';
        ctx.font = (isSel ? 'bold ' : '') + '11px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(n.id, p.x, p.y + r + 4);
      }
    });
  },

  _kgUpdateInfo() {
    const kg = this._kg;
    const el = document.getElementById('ms-graph-info');
    if (!el || !kg) return;
    const sel = kg.selected;
    if (!sel) {
      el.innerHTML = `<div class="ms-graph-tip">👆 点击左侧图谱中的任意<b>知识点节点</b>，查看它的<strong class="pre">前置依赖</strong>（掌握它需要先学的内容）与<strong class="suc">后继应用</strong>（学会它能解锁的内容）。点击空白处可取消。<br><br>节点描红表示你在该知识点上有<b>薄弱指数</b>，红圈越深代表越需要巩固。</div>`;
      return;
    }
    const node = kg.graph.nodes.find(n => n.id === sel);
    if (!node) return;
    const pre = (kg.prereqs[sel] || []);
    const suc = (kg.succ[sel] || []);
    const weak = node.weak || 0;
    el.innerHTML = `
      <div class="ms-graph-card">
        <div class="ms-gi-name" style="border-color:${kg.chapterColor(node.chapter)}">
          <span class="ms-gi-dot" style="background:${kg.chapterColor(node.chapter)}"></span>${this._esc(node.id)}
        </div>
        <div class="ms-gi-row"><span>所属章节</span><b>${this._esc(node.chapter)}</b></div>
        <div class="ms-gi-row"><span>薄弱指数</span><b class="${weak > 0 ? 'warn' : 'ok'}">${weak > 0 ? weak.toFixed(2) + ' ⚠️ 需巩固' : '0.00 ✅ 良好'}</b></div>
        <div class="ms-gi-block">
          <div class="ms-gi-label pre">⬅ 前置依赖（先学）</div>
          <div class="ms-gi-chips">${pre.length ? pre.map(p => `<span class="ms-gi-chip">${this._esc(p)}</span>`).join('') : '<span class="ms-gi-none">无（基础起点）</span>'}</div>
        </div>
        <div class="ms-gi-block">
          <div class="ms-gi-label suc">后继应用（后学） ➡</div>
          <div class="ms-gi-chips">${suc.length ? suc.map(s => `<span class="ms-gi-chip">${this._esc(s)}</span>`).join('') : '<span class="ms-gi-none">无（应用终点）</span>'}</div>
        </div>
        <button class="ms-gi-practice" data-kp="${this._esc(sel)}">针对此知识点做练习</button>
      </div>`;
    const btn = el.querySelector('.ms-gi-practice');
    if (btn) btn.addEventListener('click', () => this.startPracticeByKP(sel));
  },



  _addMistakeFromForm() {
    const q = document.getElementById('ms-add-q').value.trim();
    const ua = document.getElementById('ms-add-ua').value.trim();
    const ca = document.getElementById('ms-add-ca').value.trim();
    if (!q) return alert('请填写题目内容');
    Auth._fetch('/api/mistakes', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({question: q, user_answer: ua, correct_answer: ca})
    }).then(r => r.json()).then(() => {
      this.renderMistakesHome();
    }).catch(() => alert('记录失败，请登录后重试'));
  },

  _deleteMistake(id) {
    if (!confirm('确定删除这条错题记录？')) return;
    Auth._fetch(`/api/mistakes/${id}`, {method: 'DELETE'}).then(() => this.renderMistakesHome())
      .catch(() => alert('删除失败'));
  },
  renderMistakesList(filter) {
    let list = [...QuizSystem.mistakes];
    if (filter === 'active') list = list.filter(m => !m.mastered);
    else if (filter === 'mastered') list = list.filter(m => m.mastered);

    list.sort((a, b) => new Date(b.lastTime) - new Date(a.lastTime));

    if (list.length === 0) {
      return '<div class="mistakes-empty-small">暂无错题</div>';
    }

    return list.map(m => `
      <div class="mistake-item ${m.mastered ? 'mastered' : ''}" id="mistake-${m.id}">
        <div class="mi-header">
          <div class="mi-meta">
            <span class="qq-type qq-type-${m.type}">${this.typeLabel(m.type)}</span>
            <span class="qq-diff qq-diff-${m.difficulty}">${this.diffLabel(m.difficulty)}</span>
            <span class="mi-chapter">${QuizBank.getChapterInfo(m.chapter)?.title || ''}</span>
            ${m.times > 1 ? `<span class="mi-times">⚠ 错${m.times}次</span>` : ''}
          </div>
          <div class="mi-actions">
            ${!m.mastered ? `<button class="mi-btn mi-btn-redo" onclick="QuizUI.redoMistake('${m.id}')">🔄 重做</button>` : ''}
            <button class="mi-btn mi-btn-toggle" onclick="QuizUI.toggleMastered('${m.id}')">
              ${m.mastered ? '↩ 取消掌握' : '✓ 标记掌握'}
            </button>
            <button class="mi-btn mi-btn-delete" onclick="QuizUI.deleteMistake('${m.id}')">🗑</button>
          </div>
        </div>
        <div class="mi-question">${this.formatQuestion(m.question)}</div>
        <div class="mi-answers">
          <div class="mi-ans mi-wrong">你的答案：${this.displayAnswer({type: m.type, options: QuizBank.getById(m.id)?.options}, m.userAnswer)}</div>
          <div class="mi-ans mi-right">正确答案：${this.displayAnswer({type: m.type, options: QuizBank.getById(m.id)?.options}, m.correctAnswer)}</div>
        </div>
        <div class="mi-explanation">💡 ${m.explanation}</div>
        <div class="mi-kp">📌 ${m.knowledgePoint}</div>

        <!-- 反思笔记 -->
        <div class="mi-reflection">
          <div class="mir-label">✍ 反思笔记</div>
          <textarea class="mir-input" placeholder="记录你的反思：为什么做错了？下次怎么避免？"
            onblur="QuizSystem.updateReflection('${m.id}', this.value)">${m.reflection || ''}</textarea>
        </div>

        ${m.reflection ? '' : ''}
      </div>
    `).join('');
  },

  filterMistakes(btn, filter) {
    document.querySelectorAll('.ms-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('mistakes-list').innerHTML = this.renderMistakesList(filter);
  },

  toggleMastered(id) {
    const m = QuizSystem.mistakes.find(m => m.id === id);
    if (m) {
      m.mastered = !m.mastered;
      QuizSystem.saveMistakes();
      this.renderMistakesHome();
    }
  },

  deleteMistake(id) {
    QuizSystem.removeMistake(id);
    this.renderMistakesHome();
  },

  redoMistake(id) {
    const m = QuizSystem.mistakes.find(m => m.id === id);
    if (!m) return;

    const container = document.getElementById('mistakes-content');
    const q = QuizBank.getById(id);
    if (!q) return;

    container.innerHTML = `
      <div class="practice-taking">
        <div class="pt-back">
          <button onclick="QuizUI.renderMistakesHome()">← 返回错题本</button>
        </div>
        <div class="quiz-question-card">
          <div class="qq-meta">
            <span class="qq-type qq-type-${q.type}">${this.typeLabel(q.type)}</span>
            <span class="qq-diff qq-diff-${q.difficulty}">${this.diffLabel(q.difficulty)}</span>
            <span class="qq-chapter">${QuizBank.getChapterInfo(q.chapter)?.title || ''}</span>
          </div>
          <div class="qq-question">${this.formatQuestion(q.question)}</div>
          <div class="qq-answer-area" id="redo-answer-area">
            ${this.renderAnswerInput(q)}
          </div>
          <div class="qq-actions">
            <button class="qq-btn qq-btn-submit" onclick="QuizUI.submitRedo('${id}')">提交答案</button>
          </div>
          <div id="redo-feedback"></div>
        </div>
      </div>
    `;

    setTimeout(() => {
      const input = document.querySelector('#redo-answer-area input, #redo-answer-area textarea');
      if (input) input.focus();
    }, 100);
    // v=20260877 渲染重做题目 KaTeX
    this._renderQuestionsLatex(container);
  },

  submitRedo(id) {
    const q = QuizBank.getById(id);
    let answer = '';

    // 多选题
    const multiSelected = document.querySelectorAll('#redo-answer-area .qq-option-multi.selected');
    if (multiSelected.length > 0) {
      answer = Array.from(multiSelected).map(e => e.dataset.letter).sort().join('');
    } else {
      const selected = document.querySelector('#redo-answer-area .qq-option.selected');
      if (selected) {
        const onclickAttr = selected.getAttribute('onclick') || '';
        const match = onclickAttr.match(/'([A-D]|true|false)'/);
        if (match) answer = match[1];
      } else {
        const input = document.querySelector('#redo-answer-area input, #redo-answer-area textarea');
        if (input) answer = input.value;
      }
    }

    if (!answer || answer.trim() === '') {
      this.showToast('请先作答');
      return;
    }

    const correct = QuizSystem.checkAnswer(q, answer);
    QuizSystem.markQuestionDone(q.id, correct);

    const feedbackEl = document.getElementById('redo-feedback');
    feedbackEl.innerHTML = `
      <div class="pt-feedback ${correct ? 'correct' : 'wrong'}">
        <div class="ptf-result">
          ${correct ? '✅ 这次答对了！' : '❌ 还是答错了，继续加油'}
        </div>
        ${!correct ? `
          <div class="ptf-answers">
            <div class="ptf-row wrong">你的答案：${this.displayAnswer(q, answer)}</div>
            <div class="ptf-row right">正确答案：${this.displayAnswer(q, q.answer)}</div>
          </div>
        ` : ''}
        <div class="ptf-explanation">💡 ${q.explanation}</div>
        <div class="ptf-kp">📌 知识点：${q.knowledgePoint}</div>
        <div class="ptf-actions">
          <button class="ptf-btn" onclick="QuizUI.renderMistakesHome()">返回错题本</button>
        </div>
      </div>
    `;

    if (correct) {
      const m = QuizSystem.mistakes.find(m => m.id === id);
      if (m) {
        m.mastered = true;
        QuizSystem.saveMistakes();
      }
    } else {
      QuizSystem.addMistake(q, answer);
    }
  },

  viewMistakesFromQuiz() {
    App.switchView('mistakes');
  },

  // ============ 工具 ============

  // ───────── v=20260872 一变十 · 智能变式训练 ─────────
  _VGEN_TASKS: [
    { id: 'inverse', label: '求逆矩阵 A⁻¹', icon: '🔁' },
    { id: 'det', label: '行列式 det A', icon: '🔢' },
    { id: 'eigenvalues', label: '特征值 λ', icon: 'λ' },
    { id: 'rank', label: '矩阵的秩 rank(A)', icon: '📏' },
    { id: 'diagonalize', label: '相似对角化', icon: '📐' },
    { id: 'qr', label: 'QR 分解', icon: '🧩' },
    { id: 'svd', label: 'SVD 分解', icon: '🪞' },
    { id: 'nullspace', label: '零空间 N(A)', icon: '🕳️' },
    { id: 'solve_linear', label: '解方程组 Ax=b', icon: '⚖️' }
  ],

  /** 知识点名 → 变式任务(宽松匹配) */
  _kpToVgenTask(kp) {
    const t = String(kp || '').toLowerCase();
    if (t.includes('逆')) return 'inverse';
    if (t.includes('行列式') || t.includes('det')) return 'det';
    if (t.includes('特征')) return 'eigenvalues';
    if (t.includes('秩')) return 'rank';
    if (t.includes('对角')) return 'diagonalize';
    if (t.includes('正交') || t.includes('qr')) return 'qr';
    if (t.includes('svd') || t.includes('奇异')) return 'svd';
    if (t.includes('零空间') || t.includes('null')) return 'nullspace';
    if (t.includes('方程')) return 'solve_linear';
    return 'det';
  },

  /** 按知识点打开变式面板(错题本薄弱路径入口用) */
  showVariantsPanelByKP(kp) {
    this.showVariantsPanel(this._kpToVgenTask(kp), 5, kp);
  },

  /** 变式训练弹窗:选任务/数量 → 生成一组 → 展示题目+答案+验证状态 */
  showVariantsPanel(task, count, kpId) {
    const overlay = document.createElement('div');
    overlay.className = 'vg-overlay';
    const esc = s => { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; };
    overlay.innerHTML = `
      <div class="vg-modal">
        <div class="vg-head">
          <h3>🎲 一变十 · 智能变式训练</h3>
          <button class="vg-close" title="关闭">×</button>
        </div>
        <div class="vg-controls">
          <select id="vg-task">${this._VGEN_TASKS.map(t => `<option value="${t.id}" ${t.id === task ? 'selected' : ''}>${t.icon} ${esc(t.label)}</option>`).join('')}</select>
          <select id="vg-count">
            <option value="3">3 题</option>
            <option value="5" ${(!count || count === 5) ? 'selected' : ''}>5 题</option>
            <option value="8" ${count === 8 ? 'selected' : ''}>8 题</option>
            <option value="10" ${count === 10 ? 'selected' : ''}>10 题</option>
          </select>
          <select id="vg-mode">
            <option value="list">📋 列表模式</option>
            <option value="one" selected>🎯 逐题模式</option>
          </select>
          <button class="vg-btn" id="vg-gen">🔄 换一组</button>
        </div>
        <div class="vg-body"><div class="vg-loading">⏳ 正在生成变式题…</div></div>
        <div class="vg-foot">
          <span class="vg-note">🤖 AI 生成内容 · 每题由 SymPy 实时求解并交叉验证</span>
          <button class="vg-btn ghost" id="vg-close2">关闭</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('.vg-close').addEventListener('click', close);
    overlay.querySelector('#vg-close2').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    const gen = () => {
      const t = overlay.querySelector('#vg-task').value;
      const c = parseInt(overlay.querySelector('#vg-count').value, 10) || 5;
      this._loadVariants(overlay, t, c, kpId);
    };
    overlay.querySelector('#vg-gen').addEventListener('click', gen);
    overlay.querySelector('#vg-task').addEventListener('change', gen);
    // 模式切换(列表/逐题) → 重渲染当前数据
    overlay.querySelector('#vg-mode').addEventListener('change', () => this._vgRenderBody(overlay));
    // 逐题导航事件委托(prev/next/dot)
    overlay.addEventListener('click', e => {
      const nav = e.target.closest && e.target.closest('[data-vg-nav], [data-vg-idx]');
      if (!nav || !overlay._vgData || !overlay._vgData.variants) return;
      const len = overlay._vgData.variants.length;
      const cur = overlay._vgIdx || 0;
      if (nav.dataset.vgIdx !== undefined) overlay._vgIdx = Math.max(0, Math.min(len - 1, parseInt(nav.dataset.vgIdx, 10) || 0));
      else if (nav.dataset.vgNav === 'prev') overlay._vgIdx = Math.max(0, cur - 1);
      else if (nav.dataset.vgNav === 'next') overlay._vgIdx = Math.min(len - 1, cur + 1);
      this._vgRenderBody(overlay);
    });

    // 首次自动生成
    this._loadVariants(overlay, task, count || 5, kpId);
  },

  async _loadVariants(overlay, task, count, kpId) {
    const body = overlay.querySelector('.vg-body');
    if (!body) return;
    body.innerHTML = '<div class="vg-loading">⏳ 正在生成变式题…</div>';
    try {
      const resp = await Auth.fetchWithAuth('/api/practice/generate_variants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task, count, kp_id: kpId || undefined })
      });
      const d = await resp.json();
      if (!resp.ok || !d.variants) throw new Error(d.detail || '生成失败');
      this._renderVariants(overlay, d);
    } catch (e) {
      body.innerHTML = `<div class="vg-error">⚠️ 生成失败：${this._escHtml(e.message || e)}</div>`;
    }
  },

  _escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  },

  /** 渲染单个变式题卡片(列表/逐题共用) */
  _vgItemHtml(v) {
    const esc = this._escHtml.bind(this);
    const ans = v.answer || {};
    const ok = ans.verified_ok;
    const verHtml = (ok !== undefined && ok !== null)
      ? `<span class="vg-ver ${ok ? 'ok' : 'fail'}">${ok ? '✓ 已交叉验证' : '✗ 验证未通过'}</span>`
      : '';
    const ansHtml = ans.symbolic
      ? `<div class="vg-ans"><b>答案</b> ${esc(ans.symbolic)}</div>`
      : (ans.error ? `<div class="vg-ans err">${esc(ans.error)}</div>` : '');
    return `
      <div class="vg-item">
        <div class="vg-item-head"><span class="vg-num">第 ${v.index} 题</span>${verHtml}</div>
        <div class="vg-problem">${esc(v.problem)}</div>
        ${ansHtml}
      </div>`;
  },

  /** 按当前模式(列表/逐题)渲染变式题主体 */
  _vgRenderBody(overlay) {
    const body = overlay.querySelector('.vg-body');
    const d = overlay._vgData;
    if (!body || !d) return;
    const esc = this._escHtml.bind(this);
    const modeEl = overlay.querySelector('#vg-mode');
    const mode = modeEl ? modeEl.value : 'list';
    const variants = d.variants || [];

    let inner;
    if (mode === 'one' && variants.length > 0) {
      // ── 逐题模式 ──
      if (overlay._vgIdx === undefined || overlay._vgIdx === null) overlay._vgIdx = 0;
      if (overlay._vgIdx >= variants.length) overlay._vgIdx = variants.length - 1;
      const idx = Math.max(0, overlay._vgIdx);
      const v = variants[idx];
      const dots = variants.map((_, i) =>
        `<span class="vg-dot ${i === idx ? 'on' : ''}" data-vg-idx="${i}"></span>`).join('');
      inner = `
        <div class="vg-summary">已生成 <b>${d.count}</b> 道「${esc(d.task)}」变式题 · 逐题浏览</div>
        ${this._vgItemHtml(v).replace('<div class="vg-item"', '<div class="vg-item vg-item-one"')}
        <div class="vg-nav">
          <button class="vg-nav-btn" data-vg-nav="prev" ${idx === 0 ? 'disabled' : ''}>← 上一题</button>
          <div class="vg-dots">${dots}</div>
          <button class="vg-nav-btn" data-vg-nav="next" ${idx === variants.length - 1 ? 'disabled' : ''}>下一题 →</button>
        </div>
        <div class="vg-count-hint">第 ${idx + 1} / ${variants.length} 题</div>`;
    } else {
      // ── 列表模式 ──
      inner = `
        <div class="vg-summary">已生成 <b>${d.count}</b> 道「${esc(d.task)}」变式题，答案由 SymPy 实时计算并交叉验证</div>
        <div class="vg-list">${variants.map(v => this._vgItemHtml(v)).join('') || '<div class="vg-error">未生成任何题目</div>'}</div>`;
    }
    body.innerHTML = inner;

    // 渲染题目中的 $LaTeX$
    if (window.App && App.renderLatexInElement) {
      body.querySelectorAll('.vg-problem').forEach(el => {
        try { App.renderLatexInElement(el); } catch (e) {}
      });
    }
  },

  _renderVariants(overlay, d) {
    const body = overlay.querySelector('.vg-body');
    if (!body) return;
    overlay._vgData = d;
    overlay._vgIdx = 0;
    this._vgRenderBody(overlay);
    // 注：「换一组」按钮的点击绑定在 showVariantsPanel 中统一用 addEventListener(gen) 完成，
    // 此处不再重复赋值 onclick（避免同一按钮被绑定两次、每次重渲染叠加回调）。
  },

  showToast(msg) {
    let toast = document.getElementById('quiz-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'quiz-toast';
      toast.className = 'quiz-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
  },

  // v=20260916 工具方法(此前多处 this._esc 调用但对象未定义,补齐)
  _esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
};
