# Generator構造の比較

## 現在の実装（loopStackベース）

### 構造の概要

```
run() Generator
├─ 外側ループ: while (currentLineIndex < length || loopStack.length > 0)
│  │
│  ├─ 【分岐1】loopStack処理（ブロック内ステートメント実行）
│  │  ├─ loopStack[top] を取得
│  │  ├─ bodyIndex が終端？
│  │  │  ├─ YES → 次のイテレーション判定
│  │  │  │  ├─ FOR: 変数更新 → 条件チェック
│  │  │  │  │  ├─ 継続 → bodyIndex=0、最初のステートメント実行、yield
│  │  │  │  │  └─ 終了 → loopStack.pop()、yield
│  │  │  │  └─ WHILE: 条件再評価
│  │  │  │     ├─ 真 → bodyIndex=0、最初のステートメント実行、yield
│  │  │  │     └─ 偽 → loopStack.pop()、yield
│  │  │  └─ NO → 次のステートメント実行
│  │  │     ├─ stmt = body[bodyIndex]
│  │  │     ├─ executeStatement(stmt)
│  │  │     ├─ bodyIndex++
│  │  │     └─ yield
│  │  └─ continue（外側ループの先頭へ）
│  │
│  └─ 【分岐2】通常行処理（loopStackが空の場合）
│     ├─ line = program.body[currentLineIndex]
│     ├─ for (const statement of line.statements)
│     │  ├─ executeStatement(statement)
│     │  └─ yield
│     └─ currentLineIndex++（ジャンプしていなければ）
│
└─ 終了
```

### 実際のコード構造（約120行）

```typescript
*run(): Generator<void, void, void> {
    this.loopStack = [];
    
    // 外側ループ（2つの条件）
    while (this.currentLineIndex < this.program.body.length || this.loopStack.length > 0) {
        
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 【分岐1】loopStack処理（約70行）
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        if (this.loopStack.length > 0) {
            const currentLoop = this.loopStack[this.loopStack.length - 1]!;
            
            // bodyIndexが終端に達した？
            if (currentLoop.bodyIndex >= currentLoop.body.length) {
                
                // ━━━━ FOR: 次のイテレーション ━━━━
                if (currentLoop.type === 'for') {
                    const newValue = currentLoop.currentValue! + currentLoop.step!;
                    const shouldContinue = /* 条件チェック */;
                    
                    if (shouldContinue) {
                        // 継続: 変数更新、bodyIndex=0
                        this.variables.set(currentLoop.variable!, newValue);
                        currentLoop.currentValue = newValue;
                        currentLoop.bodyIndex = 0;
                        
                        // 最初のステートメント実行
                        if (currentLoop.body.length > 0) {
                            const stmt = currentLoop.body[0]!;
                            const result = this.executeStatement(stmt);
                            if (result.jump || result.halt) {
                                if (result.halt) return;
                            }
                            currentLoop.bodyIndex = 1;
                            yield;
                            continue;  // ← loopStack処理を続ける
                        }
                    } else {
                        // 終了
                        this.loopStack.pop();
                        yield;
                        continue;
                    }
                }
                
                // ━━━━ WHILE: 次のイテレーション ━━━━
                else if (currentLoop.type === 'while') {
                    const condition = this.assertNumber(
                        this.evaluateExpression(currentLoop.condition!),
                        'WHILEループの条件は数値でなければなりません'
                    );
                    
                    if (condition !== 0) {
                        // 継続: bodyIndex=0
                        currentLoop.bodyIndex = 0;
                        
                        // 最初のステートメント実行
                        if (currentLoop.body.length > 0) {
                            const stmt = currentLoop.body[0]!;
                            const result = this.executeStatement(stmt);
                            if (result.jump || result.halt) {
                                if (result.halt) return;
                            }
                            currentLoop.bodyIndex = 1;
                            yield;
                            continue;
                        }
                    } else {
                        // 終了
                        this.loopStack.pop();
                        yield;
                        continue;
                    }
                }
            }
            
            // ━━━━ 次のステートメント実行 ━━━━
            if (currentLoop.bodyIndex < currentLoop.body.length) {
                const stmt = currentLoop.body[currentLoop.bodyIndex]!;
                const result = this.executeStatement(stmt);
                if (result.jump || result.halt) {
                    if (result.halt) return;
                }
                currentLoop.bodyIndex++;
                yield;
                continue;  // ← loopStack処理を続ける
            }
        }
        
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 【分岐2】通常行処理（約30行）
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const line = this.program.body[this.currentLineIndex];
        if (!line) break;

        let skipRemaining = false;
        let jumped = false;

        for (const statement of line.statements) {
            if (skipRemaining) {
                yield;
                continue;
            }
            
            const result = this.executeStatement(statement);
            
            if (result.jump) {
                jumped = true;
                yield;
                break;
            }
            
            if (result.halt) {
                return;
            }
            
            if (result.skipRemaining) {
                skipRemaining = true;
            }
            
            yield;
        }

        // ジャンプしていない場合のみ次の行へ
        if (!jumped) {
            this.currentLineIndex++;
        }
    }
}
```

### 問題点

1. **二重のセマンティクス**
   - loopStack処理: インデックスベース（`bodyIndex`）
   - 通常行処理: イテレータベース（`for...of`）

2. **複雑な状態管理**
   - `currentLineIndex`: 現在の行
   - `loopStack[].bodyIndex`: ブロック内のステートメント位置
   - 両方を同期させる必要がある

3. **入力待ち実装の困難さ**
   - **4箇所**に`waitingForInput`チェックが必要:
     1. FOR最初のステートメント（30行）
     2. WHILE最初のステートメント（30行）
     3. ループ内次のステートメント（10行）
     4. 通常行処理（30行）
   - 各箇所でインデックスを進めない制御が必要

4. **制御フローの複雑さ**
   - 3箇所の`continue`でループを制御
   - loopStack処理と通常行処理の切り替え
   - 読みにくい、保守しにくい

---

## 再帰的Generator実装（提案）

### 構造の概要

```
run() Generator
├─ for (line of program.body)
│  └─ yield* executeStatements(line.statements)
│     └─ return ExecutionResult
│
└─ 終了


executeStatements(statements) Generator
├─ for (stmt of statements)
│  ├─ executeStatement(stmt)
│  │  ├─ 通常ステートメント → 直接実行
│  │  ├─ FOR/WHILE → executeForBlock() / executeWhileBlock()
│  │  │  └─ yield* executeStatements(body)  ← 再帰的委譲
│  │  └─ return ExecutionResult
│  │
│  ├─ waitingForInput チェック
│  │  └─ true → yield、continue（再実行）
│  │
│  ├─ jump/halt チェック
│  │  └─ return result（呼び出し元に伝播）
│  │
│  └─ yield
│
└─ return { jump: false, halt: false, skipRemaining: false }


executeForBlock(stmt)
├─ 初期化（start, end, step）
├─ for (value = start; shouldContinue; value += step)
│  ├─ 変数設定
│  ├─ yield* executeStatements(stmt.body)  ← Generatorを委譲
│  └─ jump/halt チェック → return result
└─ return { jump: false, halt: false, skipRemaining: false }
```

### 実際のコード構造（約50行）

```typescript
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// トップレベル（約10行）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*run(): Generator<void, void, void> {
    for (const line of this.program.body) {
        // Generatorを委譲（yield*）
        const result = yield* this.executeStatements(line.statements);
        
        if (result.halt) {
            return;
        }
        // jump の場合も正常に継続（GOTOが行を変更済み）
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ステートメント列実行（約20行）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
private *executeStatements(statements: Statement[]): Generator<void, ExecutionResult, void> {
    for (const stmt of statements) {
        // 入力待ちフラグをリセット
        this.waitingForInput = false;
        
        // ステートメント実行（通常 or FOR/WHILE）
        const result = this.executeStatement(stmt);
        
        // ━━━━ 入力待ちチェック（唯一の箇所）━━━━
        if (this.waitingForInput) {
            yield;  // 制御を返す
            continue;  // 再開時: 同じステートメントを再実行
        }
        
        // ━━━━ jump/halt チェック ━━━━
        if (result.jump || result.halt) {
            return result;  // 呼び出し元に伝播
        }
        
        // 1ステートメント実行完了
        yield;
    }
    
    // 正常終了
    return { jump: false, halt: false, skipRemaining: false };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FORブロック実行（約20行）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
private *executeForBlock(stmt: ForBlockStatement): Generator<void, ExecutionResult, void> {
    const start = this.evaluateExpression(stmt.start);
    const end = this.evaluateExpression(stmt.end);
    const step = stmt.step ? this.evaluateExpression(stmt.step) : 1;
    
    this.variables.set(stmt.variable, start);
    
    // FORループ
    for (let value = start; shouldContinue(value, end, step); value += step) {
        this.variables.set(stmt.variable, value);
        
        // ━━━━ 本体を実行（Generatorを委譲）━━━━
        const result = yield* this.executeStatements(stmt.body);
        
        // jump/halt の場合はループを抜ける
        if (result.jump || result.halt) {
            return result;  // 呼び出し元に伝播
        }
    }
    
    // ループ正常終了
    return { jump: false, halt: false, skipRemaining: false };
}

// WHILEブロックも同様（約20行）
```

### メリット

1. **単一のセマンティクス**
   - すべてが`for...of`イテレータベース
   - `executeStatements()`が統一的に処理

2. **シンプルな状態管理**
   - `currentLineIndex`のみ（GOTOで変更）
   - インデックス管理不要（イテレータが自動管理）

3. **入力待ち実装が簡単**
   - **1箇所**のみ: `executeStatements()`内
   - 10行の追加で完了
   - すべてのブロック構造に自動的に適用される

4. **制御フローが明確**
   - `yield*`でGeneratorを委譲
   - `return`で結果を伝播
   - 読みやすい、保守しやすい

5. **再帰的構造が自然**
   - ネストしたループ: `executeForBlock()` → `executeStatements()` → `executeForBlock()` ...
   - JavaScriptのGeneratorが自動的に処理

---

## 具体例: 入力待ちの処理

### 現在の実装（4箇所に修正が必要）

```typescript
*run(): Generator<void, void, void> {
    this.loopStack = [];
    
    while (this.currentLineIndex < this.program.body.length || this.loopStack.length > 0) {
        if (this.loopStack.length > 0) {
            const currentLoop = this.loopStack[this.loopStack.length - 1]!;
            
            if (currentLoop.bodyIndex >= currentLoop.body.length) {
                if (currentLoop.type === 'for') {
                    // ... 条件チェック
                    if (shouldContinue) {
                        currentLoop.bodyIndex = 0;
                        
                        // ━━━━ 【修正箇所1】FOR最初のステートメント（30行）━━━━
                        if (currentLoop.body.length > 0) {
                            const stmt = currentLoop.body[0]!;
                            
                            this.waitingForInput = false;  // ← 追加
                            const result = this.executeStatement(stmt);
                            
                            if (this.waitingForInput) {     // ← 追加
                                // bodyIndexを進めない
                                yield;
                                continue;
                            }
                            
                            if (result.jump || result.halt) {
                                if (result.halt) return;
                            }
                            currentLoop.bodyIndex = 1;
                            yield;
                            continue;
                        }
                    }
                    // ... 省略
                }
                
                // ━━━━ 【修正箇所2】WHILE最初のステートメント（30行）━━━━
                else if (currentLoop.type === 'while') {
                    // ... 同様のロジック
                }
            }
            
            // ━━━━ 【修正箇所3】ループ内次のステートメント（10行）━━━━
            if (currentLoop.bodyIndex < currentLoop.body.length) {
                const stmt = currentLoop.body[currentLoop.bodyIndex]!;
                
                this.waitingForInput = false;  // ← 追加
                const result = this.executeStatement(stmt);
                
                if (this.waitingForInput) {     // ← 追加
                    // bodyIndexを進めない
                    yield;
                    continue;
                }
                
                if (result.jump || result.halt) {
                    if (result.halt) return;
                }
                currentLoop.bodyIndex++;
                yield;
                continue;
            }
        }
        
        // ━━━━ 【修正箇所4】通常行処理（30行）━━━━
        const line = this.program.body[this.currentLineIndex];
        // ... (同様のロジック)
    }
}
```

**問題**: 4箇所に同じパターンのコードをコピー&ペースト

### 再帰的Generator実装（1箇所のみ）

```typescript
*run(): Generator<void, void, void> {
    for (const line of this.program.body) {
        const result = yield* this.executeStatements(line.statements);
        
        if (result.halt) {
            return;
        }
    }
}

// ━━━━ 【修正箇所】ここだけ（10行）━━━━
private *executeStatements(statements: Statement[]): Generator<void, ExecutionResult, void> {
    for (const stmt of statements) {
        this.waitingForInput = false;  // ← 追加
        const result = this.executeStatement(stmt);
        
        if (this.waitingForInput) {     // ← 追加（入力待ち処理）
            yield;
            continue;  // 再実行
        }
        
        if (result.jump || result.halt) {
            return result;
        }
        
        yield;
    }
    
    return { jump: false, halt: false, skipRemaining: false };
}

// executeForBlock()は修正不要！
private *executeForBlock(stmt: ForBlockStatement): Generator<void, ExecutionResult, void> {
    // ... 初期化
    
    for (let value = start; shouldContinue; value += step) {
        this.variables.set(stmt.variable, value);
        
        // executeStatements()が入力待ちを自動処理
        const result = yield* this.executeStatements(stmt.body);
        
        if (result.jump || result.halt) {
            return result;
        }
    }
    
    return { jump: false, halt: false, skipRemaining: false };
}
```

**メリット**: 
- ✅ 修正箇所: **1箇所のみ**（`executeStatements()`内）
- ✅ 修正行数: **10行**
- ✅ すべてのブロック構造（FOR、WHILE、IF）に自動適用
- ✅ バグリスク: 低（1箇所のみ）

---

## yield* の魔法

### yield* とは？

`yield*` は**Generator委譲**の構文です。別のGeneratorに制御を委譲し、その結果を透過的に呼び出し元に返します。

```typescript
function* outer() {
    console.log('outer: start');
    const result = yield* inner();  // ← innerのyieldを透過的に伝播
    console.log('outer: result =', result);
}

function* inner() {
    console.log('inner: before yield');
    yield;  // ← これがouterのyieldとして見える
    console.log('inner: after yield');
    return 'done';  // ← outerのresultに返される
}

const gen = outer();
gen.next();  // outer: start, inner: before yield
gen.next();  // inner: after yield, outer: result = done
```

### 再帰的Generatorでの使用例

```typescript
*executeStatements(statements: Statement[]): Generator<void, ExecutionResult, void> {
    for (const stmt of statements) {
        const result = this.executeStatement(stmt);
        
        // resultがGeneratorの場合（FOR/WHILEブロック）
        if (result.type === 'generator') {
            // Generatorを委譲
            const blockResult = yield* result.generator;
            // blockResult = ブロック実行の最終結果
            
            if (blockResult.jump || blockResult.halt) {
                return blockResult;  // 呼び出し元に伝播
            }
        }
        
        yield;
    }
    
    return { jump: false, halt: false, skipRemaining: false };
}

*executeForBlock(stmt: ForBlockStatement): Generator<void, ExecutionResult, void> {
    for (let value = start; shouldContinue; value += step) {
        this.variables.set(stmt.variable, value);
        
        // ━━━━ ここで委譲 ━━━━
        const result = yield* this.executeStatements(stmt.body);
        // ↑ stmt.body内の各yieldが、外側のrun()まで透過的に伝播
        
        if (result.jump || result.halt) {
            return result;
        }
    }
    
    return { jump: false, halt: false, skipRemaining: false };
}
```

### 入力待ちの透過的な伝播

```
run()
├─ yield* executeStatements(line.statements)
   └─ executeStatement(stmt)
      └─ yield* executeForBlock(stmt)
         └─ yield* executeStatements(stmt.body)
            └─ executeStatement(innerStmt)
               └─ evaluateInputNumberExpression()
                  └─ waitingForInput = true
                  
【巻き戻し】
executeStatements() が waitingForInput をチェック
   ↓
yield  ← ここで制御を返す
   ↓
yield* が透過的に伝播
   ↓
yield* が透過的に伝播
   ↓
run() の呼び出し元に到達

【次のnext()呼び出し】
run()
   ↓
yield* が再開
   ↓
yield* が再開
   ↓
executeStatements() の continue
   ↓
同じステートメントを再実行
```

---

## コード量の比較

| 項目 | 現在（loopStack） | 再帰的Generator | 差分 |
|------|------------------|----------------|------|
| run() | 約120行 | 約10行 | **-110行** |
| executeStatements() | （loopStack処理に内包） | 約20行 | +20行 |
| executeForBlock() | 約30行 | 約20行 | -10行 |
| executeWhileBlock() | 約20行 | 約20行 | 0行 |
| 入力待ち修正 | 4箇所×25行 = 100行 | 1箇所×10行 = 10行 | **-90行** |
| **合計** | 約270行 | 約80行 | **-190行（70%削減）** |

---

## まとめ

### 現在の実装（loopStackベース）
- ❌ 二重のセマンティクス（loopStack vs 通常行）
- ❌ 複雑な状態管理（currentLineIndex + bodyIndex）
- ❌ 入力待ち実装が困難（4箇所、100行）
- ❌ 読みにくい、保守しにくい（120行）

### 再帰的Generator実装
- ✅ 単一のセマンティクス（executeStatements統一）
- ✅ シンプルな状態管理（currentLineIndexのみ）
- ✅ 入力待ち実装が簡単（1箇所、10行）
- ✅ 読みやすい、保守しやすい（10+20+20=50行）
- ✅ **70%のコード削減**

### yield* の威力
- Generatorを委譲し、yieldを透過的に伝播
- 入力待ちがブロック構造を超えて自動的に処理される
- 再帰的な構造が自然に表現できる

再帰的Generatorは、JavaScriptのGenerator機能を最大限活用した、エレガントで保守しやすい実装です。
