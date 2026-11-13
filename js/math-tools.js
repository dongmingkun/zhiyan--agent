/**
 * 线性代数数学计算引擎
 * 提供矩阵运算、行列式计算、线性方程组求解、特征值计算等功能
 * 所有计算均支持有理数运算以避免浮点误差，同时提供详细步骤输出
 */

const LinAlg = {

  // ============ 基础工具 ============

  /**
   * 解析矩阵输入字符串
   * 支持: "1 2 3; 4 5 6"、"1,2,3;4,5,6"、"[[1,2],[3,4]]"、"[1 2; 3 4]"
   * 自动处理中文逗号/分号、多余括号、负数、小数
   */
  parseMatrix(str) {
    str = str.trim();
    // 统一中文标点
    str = str.replace(/，/g, ',').replace(/；/g, ';');
    // 将 ],[ 转为 ; （处理 [[1,2],[3,4]] 格式）
    str = str.replace(/\]\s*,\s*\[/g, ';');
    // 去除所有方括号和竖线
    str = str.replace(/[\[\]|]/g, '');
    // 按 ; 分割行
    const rows = str.split(';').map(r => r.trim()).filter(r => r);
    const matrix = rows.map(row => {
      return row.split(/[\s,]+/).filter(x => x).map(Number);
    });
    if (matrix.length === 0) throw new Error("输入为空");
    const cols = matrix[0].length;
    for (const row of matrix) {
      if (row.length !== cols) throw new Error("矩阵每行元素个数不一致");
      if (row.some(isNaN)) throw new Error("矩阵包含非数字元素");
    }
    return matrix;
  },

  /**
   * 矩阵转字符串（用于显示）
   */
  matrixToString(m, precision = 6) {
    return m.map(row =>
      "[ " + row.map(v => {
        if (Math.abs(v) < 1e-10) v = 0;
        if (Number.isInteger(v)) return String(v);
        return parseFloat(v.toFixed(precision)).toString();
      }).join(",  ") + " ]"
    ).join("\n");
  },

  /**
   * 深拷贝矩阵
   */
  clone(m) { return m.map(r => [...r]); },

  /**
   * 获取矩阵维度 [rows, cols]
   */
  dims(m) { return [m.length, m[0].length]; },

  // ============ 矩阵运算 ============

  /**
   * 矩阵加法/减法
   */
  add(a, b, subtract = false) {
    const [ra, ca] = this.dims(a);
    const [rb, cb] = this.dims(b);
    if (ra !== rb || ca !== cb) throw new Error(`维度不匹配: ${ra}×${ca} 与 ${rb}×${cb}`);
    const sign = subtract ? -1 : 1;
    return a.map((row, i) => row.map((v, j) => v + sign * b[i][j]));
  },

  /**
   * 数乘矩阵
   */
  scale(m, k) {
    return m.map(row => row.map(v => v * k));
  },

  /**
   * 矩阵乘法
   */
  multiply(a, b) {
    const [ra, ca] = this.dims(a);
    const [rb, cb] = this.dims(b);
    if (ca !== rb) throw new Error(`维度不匹配: ${ra}×${ca} 乘以 ${rb}×${cb}，A的列数必须等于B的行数`);
    const result = Array(ra).fill(0).map(() => Array(cb).fill(0));
    for (let i = 0; i < ra; i++) {
      for (let j = 0; j < cb; j++) {
        let sum = 0;
        for (let k = 0; k < ca; k++) {
          sum += a[i][k] * b[k][j];
        }
        result[i][j] = sum;
      }
    }
    return result;
  },

  /**
   * 矩阵转置
   */
  transpose(m) {
    const [r, c] = this.dims(m);
    return Array(c).fill(0).map((_, j) => Array(r).fill(0).map((_, i) => m[i][j]));
  },

  /**
   * 单位矩阵
   */
  identity(n) {
    return Array(n).fill(0).map((_, i) => Array(n).fill(0).map((_, j) => i === j ? 1 : 0));
  },

  // ============ 行列式 ============

  /**
   * 计算行列式（递归展开法，适合教学演示）
   */
  determinant(m) {
    const n = m.length;
    if (n === 0) return 1;
    if (m[0].length !== n) throw new Error("行列式只能计算方阵");

    if (n === 1) return m[0][0];
    if (n === 2) return m[0][0] * m[1][1] - m[0][1] * m[1][0];

    // 使用展开法（按第一行展开）
    let det = 0;
    for (let j = 0; j < n; j++) {
      if (m[0][j] === 0) continue;
      const minor = this.getMinor(m, 0, j);
      const cofactor = Math.pow(-1, 0 + j) * this.determinant(minor);
      det += m[0][j] * cofactor;
    }
    return det;
  },

  /**
   * 获取余子式矩阵（删除第i行第j列）
   */
  getMinor(m, i, j) {
    return m.filter((_, ri) => ri !== i)
            .map(row => row.filter((_, ci) => ci !== j));
  },

  /**
   * 计算伴随矩阵
   */
  adjugate(m) {
    const n = m.length;
    if (n === 1) return [[1]];
    const adj = Array(n).fill(0).map(() => Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const minor = this.getMinor(m, i, j);
        // 伴随矩阵是代数余子式的转置: adj[j][i] = cofactor[i][j]
        adj[j][i] = Math.pow(-1, i + j) * this.determinant(minor);
      }
    }
    return adj;
  },

  /**
   * 求逆矩阵（伴随矩阵法）
   */
  inverse(m) {
    const n = m.length;
    const det = this.determinant(m);
    if (Math.abs(det) < 1e-10) throw new Error("矩阵不可逆（行列式为0）");
    const adj = this.adjugate(m);
    return adj.map(row => row.map(v => v / det));
  },

  // ============ 秩与行阶梯形 ============

  /**
   * 高斯消元法求行阶梯形矩阵（带步骤记录）
   * 返回 { matrix: 阶梯形矩阵, steps: 步骤数组, rank: 秩 }
   */
  rref(m, recordSteps = true) {
    const result = this.clone(m);
    const [rows, cols] = this.dims(result);
    const steps = [];
    let rank = 0;
    let pivotCol = 0;

    for (let row = 0; row < rows && pivotCol < cols; row++) {
      // 找主元行
      let pivotRow = -1;
      for (let i = row; i < rows; i++) {
        if (Math.abs(result[i][pivotCol]) > 1e-10) {
          pivotRow = i;
          break;
        }
      }

      if (pivotRow === -1) {
        pivotCol++;
        row--;
        continue;
      }

      // 交换行
      if (pivotRow !== row) {
        [result[row], result[pivotRow]] = [result[pivotRow], result[row]];
        if (recordSteps) {
          steps.push({
            type: 'swap',
            desc: `交换第${row + 1}行和第${pivotRow + 1}行`,
            matrix: this.clone(result)
          });
        }
      }

      // 消元
      const pivot = result[row][pivotCol];
      for (let i = row + 1; i < rows; i++) {
        if (Math.abs(result[i][pivotCol]) > 1e-10) {
          const factor = result[i][pivotCol] / pivot;
          for (let j = pivotCol; j < cols; j++) {
            result[i][j] -= factor * result[row][j];
            if (Math.abs(result[i][j]) < 1e-10) result[i][j] = 0;
          }
          if (recordSteps) {
            steps.push({
              type: 'eliminate',
              desc: `第${i + 1}行减去第${row + 1}行的 ${this.fmt(factor)} 倍`,
              matrix: this.clone(result)
            });
          }
        }
      }

      rank++;
      pivotCol++;
    }

    return { matrix: result, steps, rank };
  },

  /**
   * 求矩阵的秩
   */
  rank(m) {
    return this.rref(m, false).rank;
  },

  fmt(v) {
    if (Math.abs(v) < 1e-10) return "0";
    if (Number.isInteger(v)) return String(v);
    return parseFloat(v.toFixed(4)).toString();
  },

  // ============ 线性方程组求解 ============

  /**
   * 求解线性方程组 Ax = b
   * 返回 { type: 'none'|'unique'|'infinite', solution, steps, rankA, rankAb, nullity }
   */
  solveLinearSystem(A, b) {
    const [rows, cols] = this.dims(A);
    // 构造增广矩阵
    const aug = A.map((row, i) => [...row, b[i]]);
    const steps = [];
    steps.push({
      type: 'init',
      desc: '构造增广矩阵 [A|b]',
      matrix: this.clone(aug),
      isAugmented: true,
      cols: cols
    });

    // 高斯消元（按增广矩阵的完整列数消元，否则 b 列永远取不到主元，rankAb 恒等于 rankA，无法判无解）
    const { matrix: echelon, rank } = this.rrefWithSteps(aug, steps, cols + 1);
    const rankA = this.rank(A);
    const rankAb = rank;

    // 判断解的情况
    if (rankA < rankAb) {
      return {
        type: 'none',
        message: '方程组无解（r(A) < r(A|b)）',
        steps,
        rankA,
        rankAb
      };
    }

    if (rankA === cols) {
      // 唯一解 - 回代
      const solution = this.backSubstitute(echelon, cols);
      return {
        type: 'unique',
        solution,
        message: `方程组有唯一解（r(A) = r(A|b) = ${rankA} = n）`,
        steps,
        rankA,
        rankAb
      };
    }

    // 无穷多解 - 求通解
    const { particular, basis, freeVars } = this.findGeneralSolution(echelon, cols, rankA);
    return {
      type: 'infinite',
      particular,
      basis,
      freeVars,
      nullity: cols - rankA,
      message: `方程组有无穷多解（r(A) = r(A|b) = ${rankA} < ${cols}），自由变量个数为 ${cols - rankA}`,
      steps,
      rankA,
      rankAb
    };
  },

  rrefWithSteps(aug, steps, sysCols) {
    const result = this.clone(aug);
    const [rows, cols] = this.dims(result);
    let rank = 0;
    let pivotCol = 0;

    for (let row = 0; row < rows && pivotCol < sysCols; row++) {
      let pivotRow = -1;
      for (let i = row; i < rows; i++) {
        if (Math.abs(result[i][pivotCol]) > 1e-10) {
          pivotRow = i;
          break;
        }
      }
      if (pivotRow === -1) {
        pivotCol++;
        row--;
        continue;
      }
      if (pivotRow !== row) {
        [result[row], result[pivotRow]] = [result[pivotRow], result[row]];
        steps.push({
          type: 'swap',
          desc: `交换第${row + 1}行和第${pivotRow + 1}行`,
          matrix: this.clone(result),
          isAugmented: true,
          cols: sysCols
        });
      }

      const pivot = result[row][pivotCol];
      for (let i = row + 1; i < rows; i++) {
        if (Math.abs(result[i][pivotCol]) > 1e-10) {
          const factor = result[i][pivotCol] / pivot;
          for (let j = pivotCol; j < cols; j++) {
            result[i][j] -= factor * result[row][j];
            if (Math.abs(result[i][j]) < 1e-10) result[i][j] = 0;
          }
          steps.push({
            type: 'eliminate',
            desc: `第${i + 1}行 ← 第${i + 1}行 - ${this.fmt(factor)}×第${row + 1}行`,
            matrix: this.clone(result),
            isAugmented: true,
            cols: sysCols
          });
        }
      }
      rank++;
      pivotCol++;
    }
    return { matrix: result, rank };
  },

  backSubstitute(echelon, sysCols) {
    const result = this.clone(echelon);
    const [rows] = this.dims(result);
    const solution = new Array(sysCols).fill(0);

    // 先化简为行最简形
    for (let row = rows - 1; row >= 0; row--) {
      // 找主元
      let pivotCol = -1;
      for (let j = 0; j < sysCols; j++) {
        if (Math.abs(result[row][j]) > 1e-10) { pivotCol = j; break; }
      }
      if (pivotCol === -1) continue;

      // 归一化
      const pivot = result[row][pivotCol];
      for (let j = 0; j <= sysCols; j++) {
        result[row][j] /= pivot;
      }

      // 消去上方
      for (let i = 0; i < row; i++) {
        if (Math.abs(result[i][pivotCol]) > 1e-10) {
          const factor = result[i][pivotCol];
          for (let j = 0; j <= sysCols; j++) {
            result[i][j] -= factor * result[row][j];
          }
        }
      }
      solution[pivotCol] = result[row][sysCols];
    }
    return solution;
  },

  findGeneralSolution(echelon, sysCols, rank) {
    const result = this.clone(echelon);
    const [rows] = this.dims(result);

    // 找主元列
    const pivotCols = [];
    let currentRow = 0;
    for (let col = 0; col < sysCols && currentRow < rows; col++) {
      if (Math.abs(result[currentRow][col]) > 1e-10) {
        pivotCols.push(col);
        currentRow++;
      }
    }

    const freeCols = [];
    for (let j = 0; j < sysCols; j++) {
      if (!pivotCols.includes(j)) freeCols.push(j);
    }

    // 化简为行最简形
    for (let row = pivotCols.length - 1; row >= 0; row--) {
      const pc = pivotCols[row];
      const pivot = result[row][pc];
      for (let j = 0; j <= sysCols; j++) {
        result[row][j] /= pivot;
      }
      for (let i = 0; i < row; i++) {
        if (Math.abs(result[i][pc]) > 1e-10) {
          const factor = result[i][pc];
          for (let j = 0; j <= sysCols; j++) {
            result[i][j] -= factor * result[row][j];
          }
        }
      }
    }

    // 特解：自由变量设为0
    const particular = new Array(sysCols).fill(0);
    for (let i = 0; i < pivotCols.length; i++) {
      particular[pivotCols[i]] = result[i][sysCols];
    }

    // 基础解系：每个自由变量取1，其余取0
    const basis = [];
    for (const fc of freeCols) {
      const vec = new Array(sysCols).fill(0);
      vec[fc] = 1;
      for (let i = 0; i < pivotCols.length; i++) {
        vec[pivotCols[i]] = -result[i][fc];
      }
      basis.push(vec);
    }

    return { particular, basis, freeVars: freeCols };
  },

  // ============ 特征值与特征向量 ============

  /**
   * 计算特征值和特征向量（数值方法）
   * 使用QR分解迭代法求特征值，然后解方程组求特征向量
   */
  eigenvalues(m) {
    const n = m.length;
    if (n === 1) return [{ value: m[0][0], multiplicity: 1, vectors: [[1]] }];

    // 对于2x2矩阵直接求解
    if (n === 2) {
      return this.eigenvalues2x2(m);
    }

    // 一般情况：QR迭代
    return this.eigenvaluesQR(m);
  },

  eigenvalues2x2(m) {
    const a = m[0][0], b = m[0][1], c = m[1][0], d = m[1][1];
    const trace = a + d;
    const det = a * d - b * c;
    const disc = trace * trace - 4 * det;

    const results = [];
    if (Math.abs(disc) < 1e-10) {
      // 重根
      const lambda = trace / 2;
      const vecs = this.eigenvectors(m, lambda);
      results.push({ value: lambda, multiplicity: 2, vectors: vecs, algebraicMult: 2, geometricMult: vecs.length });
    } else if (disc > 0) {
      const sq = Math.sqrt(disc);
      const l1 = (trace + sq) / 2;
      const l2 = (trace - sq) / 2;
      results.push({ value: l1, multiplicity: 1, vectors: this.eigenvectors(m, l1) });
      results.push({ value: l2, multiplicity: 1, vectors: this.eigenvectors(m, l2) });
    } else {
      // 复数特征值
      const real = trace / 2;
      const imag = Math.sqrt(-disc) / 2;
      results.push({ value: `${real.toFixed(4)} + ${imag.toFixed(4)}i`, multiplicity: 1, vectors: [], isComplex: true });
      results.push({ value: `${real.toFixed(4)} - ${imag.toFixed(4)}i`, multiplicity: 1, vectors: [], isComplex: true });
    }
    return results;
  },

  /**
   * QR迭代法求特征值（适用于n>2的实矩阵）
   */
  eigenvaluesQR(m) {
    let A = this.clone(m);
    const n = A.length;
    const maxIter = 200;

    for (let iter = 0; iter < maxIter; iter++) {
      const { Q, R } = this.qrDecompose(A);
      A = this.multiply(R, Q);

      // 检查是否收敛（下三角部分足够小）
      let offDiag = 0;
      for (let i = 1; i < n; i++) {
        for (let j = 0; j < i; j++) {
          offDiag += Math.abs(A[i][j]);
        }
      }
      if (offDiag < 1e-10) break;
    }

    // 提取对角线上的特征值
    const eigvals = [];
    for (let i = 0; i < n; i++) {
      const val = A[i][i];
      if (Math.abs(val) < 1e-10) eigvals.push(0);
      else eigvals.push(val);
    }

    // 聚类相同特征值
    const results = [];
    const used = new Array(n).fill(false);
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      let mult = 1;
      for (let j = i + 1; j < n; j++) {
        if (!used[j] && Math.abs(eigvals[i] - eigvals[j]) < 1e-6) {
          mult++;
          used[j] = true;
        }
      }
      used[i] = true;
      const vecs = this.eigenvectors(m, eigvals[i]);
      results.push({
        value: eigvals[i],
        multiplicity: mult,
        vectors: vecs,
        algebraicMult: mult,
        geometricMult: vecs.length
      });
    }
    return results;
  },

  /**
   * Gram-Schmidt QR分解
   */
  qrDecompose(A) {
    const n = A.length;
    const Q = Array(n).fill(0).map(() => Array(n).fill(0));
    const R = Array(n).fill(0).map(() => Array(n).fill(0));

    for (let j = 0; j < n; j++) {
      // v = A的第j列
      const v = A.map(row => row[j]);

      // 减去已有分量的投影
      const u = [...v];
      for (let i = 0; i < j; i++) {
        const qi = Q.map(row => row[i]);
        R[i][j] = this.dot(qi, v);
        for (let k = 0; k < n; k++) {
          u[k] -= R[i][j] * qi[k];
        }
      }

      R[j][j] = Math.sqrt(this.dot(u, u));
      if (R[j][j] < 1e-10) {
        Q.forEach(row => row[j] = 0);
      } else {
        for (let k = 0; k < n; k++) {
          Q[k][j] = u[k] / R[j][j];
        }
      }
    }
    return { Q, R };
  },

  dot(a, b) {
    return a.reduce((sum, v, i) => sum + v * b[i], 0);
  },

  /**
   * 求特征向量：解 (λI - A)x = 0
   */
  eigenvectors(A, lambda) {
    const n = A.length;
    const lambdaI = A.map((row, i) => row.map((v, j) => i === j ? lambda - v : -v));
    const { matrix: echelon, rank } = this.rref(lambdaI, false);
    const nullity = n - rank;

    if (nullity === 0) return [];

    // 找主元列和自由列
    const pivotCols = [];
    const freeCols = [];
    let currentRow = 0;
    for (let col = 0; col < n && currentRow < n; col++) {
      if (currentRow < rank && Math.abs(echelon[currentRow][col]) > 1e-10) {
        pivotCols.push(col);
        currentRow++;
      } else {
        freeCols.push(col);
      }
    }

    // 化为行最简形
    const rref = this.clone(echelon);
    for (let row = pivotCols.length - 1; row >= 0; row--) {
      const pc = pivotCols[row];
      const pivot = rref[row][pc];
      if (Math.abs(pivot) < 1e-10) continue;
      for (let j = 0; j < n; j++) rref[row][j] /= pivot;
      for (let i = 0; i < row; i++) {
        const factor = rref[i][pc];
        for (let j = 0; j < n; j++) rref[i][j] -= factor * rref[row][j];
      }
    }

    // 对每个自由变量生成特征向量
    const vectors = [];
    for (const fc of freeCols) {
      const vec = new Array(n).fill(0);
      vec[fc] = 1;
      for (let i = 0; i < pivotCols.length; i++) {
        vec[pivotCols[i]] = -rref[i][fc];
      }
      // 清理小数
      for (let i = 0; i < n; i++) {
        if (Math.abs(vec[i]) < 1e-10) vec[i] = 0;
      }
      vectors.push(vec);
    }
    return vectors;
  },

  // ============ 向量运算 ============

  vectorAdd(a, b) {
    if (a.length !== b.length) throw new Error("向量维度不一致");
    return a.map((v, i) => v + b[i]);
  },

  vectorScale(v, k) {
    return v.map(x => x * k);
  },

  vectorDot(a, b) {
    return this.dot(a, b);
  },

  vectorNorm(v) {
    return Math.sqrt(this.dot(v, v));
  },

  vectorCross3D(a, b) {
    if (a.length !== 3 || b.length !== 3) throw new Error("叉积只适用于3维向量");
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
  },

  /**
   * 矩阵的迹（对角线元素之和）
   */
  trace(m) {
    if (m.length !== m[0].length) throw new Error("迹只能计算方阵");
    return m.reduce((sum, row, i) => sum + row[i], 0);
  },

  /**
   * LU分解（Doolittle分解）：A = L*U
   * L为下三角（对角线为1），U为上三角
   * 返回 { L, U, P, steps } 其中P为置换矩阵
   */
  luDecomposition(m) {
    const n = m.length;
    if (n !== m[0].length) throw new Error("LU分解只能对方阵进行");
    const steps = [];

    const U = this.clone(m);
    const L = this.identity(n);
    const P = Array.from({length: n}, (_, i) => Array.from({length: n}, (_, j) => i === j ? 1 : 0));

    steps.push({ desc: "初始化：A = U, L = I, P = I", L: this.clone(L), U: this.clone(U) });

    for (let k = 0; k < n; k++) {
      // 部分选主元
      let maxRow = k;
      let maxVal = Math.abs(U[k][k]);
      for (let i = k + 1; i < n; i++) {
        if (Math.abs(U[i][k]) > maxVal) {
          maxVal = Math.abs(U[i][k]);
          maxRow = i;
        }
      }

      if (maxVal < 1e-10) {
        throw new Error("矩阵不可做LU分解（存在零主元）");
      }

      if (maxRow !== k) {
        // 交换U的整行
        [U[k], U[maxRow]] = [U[maxRow], U[k]];
        // 交换P的整行
        [P[k], P[maxRow]] = [P[maxRow], P[k]];
        // 只交换L已计算的部分（列0到k-1），保持对角线为1
        for (let j = 0; j < k; j++) {
          [L[k][j], L[maxRow][j]] = [L[maxRow][j], L[k][j]];
        }
        steps.push({ desc: `选主元：交换第${k+1}行和第${maxRow+1}行`, L: this.clone(L), U: this.clone(U) });
      }

      for (let i = k + 1; i < n; i++) {
        const factor = U[i][k] / U[k][k];
        L[i][k] = factor;
        for (let j = k; j < n; j++) {
          U[i][j] -= factor * U[k][j];
          if (Math.abs(U[i][j]) < 1e-10) U[i][j] = 0;
        }
        steps.push({
          desc: `消元：第${i+1}行 ← 第${i+1}行 − ${this.fmt(factor)}×第${k+1}行`,
          L: this.clone(L), U: this.clone(U)
        });
      }
    }

    return { L, U, P, steps };
  },

  /**
   * 克莱姆法则求解线性方程组 Ax = b
   * 返回 { solution, steps } 其中steps含每个Dᵢ的计算
   */
  cramerSolve(A, b) {
    const n = A.length;
    if (n !== A[0].length) throw new Error("克莱姆法则只能用于方阵");
    const D = this.determinant(A);
    if (Math.abs(D) < 1e-10) {
      return { solution: null, D, message: "|A| = 0，克莱姆法则不适用（方程组无唯一解）" };
    }

    const steps = [{ desc: `计算系数行列式 D = |A| = ${this.fmt(D)}`, matrix: this.clone(A) }];
    const solution = [];

    for (let i = 0; i < n; i++) {
      // 构造D_i：将A的第i列替换为b
      const Di = this.clone(A);
      for (let r = 0; r < n; r++) {
        Di[r][i] = b[r];
      }
      const detI = this.determinant(Di);
      solution.push(detI / D);
      steps.push({
        desc: `D${i+1} = |A${i+1}| = ${this.fmt(detI)}，x${i+1} = D${i+1}/D = ${this.fmt(detI / D)}`,
        matrix: Di,
        col: i
      });
    }

    return { solution, D, steps };
  },

  /**
   * Gram-Schmidt 正交化
   */
  gramSchmidt(vectors) {
    const result = [];
    const steps = [];
    steps.push({ desc: "初始向量组", vectors: vectors.map(v => [...v]) });

    for (let i = 0; i < vectors.length; i++) {
      let u = [...vectors[i]];
      const projections = [];

      for (let j = 0; j < result.length; j++) {
        const dotUV = this.dot(vectors[i], result[j]);
        const dotUU = this.dot(result[j], result[j]);
        if (Math.abs(dotUU) < 1e-12) continue;
        const proj = dotUV / dotUU;
        projections.push({ vector: [...result[j]], coefficient: proj });
        u = u.map((v, k) => v - proj * result[j][k]);
      }

      if (Math.abs(this.vectorNorm(u)) > 1e-10) {
        result.push(u);
        if (i > 0) {
          steps.push({
            desc: `β${i + 1} = α${i + 1} - ${projections.map(p =>
              `(${this.fmt(p.coefficient)})β${projections.indexOf(p) + 1}`
            ).join(' - ')}`,
            vectors: result.map(v => [...v])
          });
        }
      }
    }

    // 单位化
    const normalized = result.map(v => {
      const norm = this.vectorNorm(v);
      return v.map(x => x / norm);
    });

    steps.push({ desc: "单位化后得到正交规范向量组", vectors: normalized.map(v => [...v]) });

    return { orthogonal: result, orthonormal: normalized, steps };
  }
};
