# AST構造の変更必要性評価

## 結論

**AST構造の変更は不要です。** ✅

現在のAST定義は既にブロック構造を完全にサポートしています。

## 現在のAST構造

### 1. ForBlockStatement（既に完璧）

```typescript
export interface ForBlockStatement extends ASTNode {
    type: 'ForBlockStatement';
    variable: Identifier;    // ループ変数
    start: Expression;       // 開始値
    end: Expression;         // 終了値
    step?: Expression;       // ステップ値（省略時は1）
    body: Statement[];       // ← ループボディ（既に存在）
}
```

✅ **`body: Statement[]`が既にある** → ブロック構造完全対応

### 2. WhileBlockStatement（既に完璧）

```typescript
export interface WhileBlockStatement extends ASTNode {
    type: 'WhileBlockStatement';
    condition: Expression;    // 継続条件
    body: Statement[];        // ← ループボディ（既に存在）
}
```

✅ **`body: Statement[]`が既にある** → ブロック構造完全対応

### 3. IfBlockStatement（既に完璧）

```typescript
export interface IfBlockStatement extends ASTNode {
    type: 'IfBlockStatement';
    condition: Expression;
    thenBody: Statement[];    // ← THEN部（既に存在）
    elseBody?: Statement[];   // ← ELSE部（既に存在）
}
```

✅ **`thenBody`と`elseBody`が既にある** → ブロック構造完全対応

## 不要な定義（削除候補）

### NextStatement（使用されていない）

```typescript
export interface NextStatement extends ASTNode {
    type: 'NextStatement';
    variable?: Identifier;    // ループ変数（統一構造 #=@ では省略）
}
```

**現状**:
```typescript
// workerInterpreter.ts
this.statementExecutors.set('NextStatement', () => noOpResult);
```

NextStatementは**no-op**（何もしない）として実装されています。

**理由**: 
- 現在は`ForBlockStatement`の`body`配列で処理
- `#=@`はParserが`ForBlockStatement`の終端マーカーとして処理
- 実行時にはNextStatementは不要

**提案**: 
- ❌ 削除しない（互換性のため残す）
- ✅ no-opとして維持（現状維持）

### ForStatement / WhileStatement（インライン版）

```typescript
export interface ForStatement extends ASTNode {
    type: 'ForStatement';
    // ... (body フィールドなし)
}

export interface WhileStatement extends ASTNode {
    type: 'WhileStatement';
    condition: Expression;
    // ... (body フィールドなし)
}
```

**現状**:
```typescript
// workerInterpreter.ts
this.statementExecutors.set('ForStatement', () => noOpResult);
this.statementExecutors.set('WhileStatement', () => noOpResult);
```

これらもno-opです。

**理由**:
- Parserは常に`ForBlockStatement`/`WhileBlockStatement`を生成
- インライン版は使用されていない

**提案**: 
- ❌ 削除しない（将来の拡張のため残す）
- ✅ no-opとして維持（現状維持）

## 変更が必要な箇所

### AST定義（src/ast.ts）

**変更不要** ✅

### Parser（src/parser.ts）

**変更不要** ✅

Parserは既に`ForBlockStatement`/`WhileBlockStatement`を生成しています。

確認のため、Parserの該当箇所を見てみましょう：

```typescript
// parser.ts（予想）
parseForStatement() {
    // @=I,1,10 を解析
    // ... #=@ まで本体を収集
    return {
        type: 'ForBlockStatement',
        variable: ...,
        start: ...,
        end: ...,
        step: ...,
        body: [...]  // ← 既にbodyを収集している
    };
}
```

### Interpreter（src/workerInterpreter.ts）

**変更必要** ⚠️（ただしAST構造は関係ない）

変更が必要なのは**実行ロジック**のみ：
- `run()` メソッドの簡略化
- `executeForBlock()` / `executeWhileBlock()` の再帰的Generator化
- `executeStatements()` ヘルパーの追加

**AST構造は一切変更しない**

## ブロックベース移行で変更する箇所

### 変更対象

| ファイル | 変更内容 | AST構造への影響 |
|---------|---------|----------------|
| `src/ast.ts` | **変更なし** | なし ✅ |
| `src/parser.ts` | **変更なし** | なし ✅ |
| `src/workerInterpreter.ts` | run()とexecuteブロックメソッドを修正 | なし ✅ |

### 変更の詳細（workerInterpreter.tsのみ）

#### 1. loopStack削除
```typescript
// 削除
private loopStack: LoopBlockInfo[] = [];
```

#### 2. executeStatements() 追加
```typescript
// 追加（新規ヘルパー）
private *executeStatements(statements: Statement[]): Generator<void, ExecutionResult, void> {
    for (const stmt of statements) {
        this.waitingForInput = false;
        const result = this.executeStatement(stmt);
        
        if (this.waitingForInput) {
            yield;
            continue;
        }
        
        if (result.jump || result.halt) {
            return result;
        }
        
        yield;
    }
    
    return { jump: false, halt: false, skipRemaining: false };
}
```

#### 3. run() 簡略化
```typescript
// 変更前（120行）
*run(): Generator<void, void, void> {
    this.loopStack = [];
    while (this.currentLineIndex < length || this.loopStack.length > 0) {
        // loopStack処理（70行）
        if (this.loopStack.length > 0) { ... }
        
        // 通常行処理（30行）
        const line = this.program.body[this.currentLineIndex];
        for (const statement of line.statements) { ... }
    }
}

// 変更後（10行）
*run(): Generator<void, void, void> {
    for (const line of this.program.body) {
        const result = yield* this.executeStatements(line.statements);
        
        if (result.halt) {
            return;
        }
    }
}
```

#### 4. executeForBlock() 修正
```typescript
// 変更前（30行）
private executeForBlock(statement: any): ExecutionResult {
    // ... 初期化
    
    this.loopStack.push({
        type: 'for',
        variable: varName,
        start: startValue,
        end: endValue,
        step: stepValue,
        body: forStmt.body,  // ← AST構造はそのまま使用
        bodyIndex: 0,
        currentValue: startValue,
    });
    
    return { jump: false, halt: false, skipRemaining: false };
}

// 変更後（20行）
private *executeForBlock(stmt: ForBlockStatement): Generator<void, ExecutionResult, void> {
    const start = this.evaluateExpression(stmt.start);
    const end = this.evaluateExpression(stmt.end);
    const step = stmt.step ? this.evaluateExpression(stmt.step) : 1;
    
    this.variables.set(stmt.variable.name, start);
    
    for (let value = start; shouldContinue(value, end, step); value += step) {
        this.variables.set(stmt.variable.name, value);
        
        // stmt.body をそのまま使用（AST構造は変更なし）
        const result = yield* this.executeStatements(stmt.body);
        
        if (result.jump || result.halt) {
            return result;
        }
    }
    
    return { jump: false, halt: false, skipRemaining: false };
}
```

**重要**: `stmt.body`（AST構造）はそのまま使用します。

## まとめ

### AST構造の変更

**不要です。** ✅

現在のAST定義は既に完璧で、ブロック構造を完全にサポートしています：
- `ForBlockStatement.body: Statement[]`
- `WhileBlockStatement.body: Statement[]`
- `IfBlockStatement.thenBody / elseBody: Statement[]`

### 必要な変更

**Interpreterの実行ロジックのみ**:
1. `loopStack`削除
2. `executeStatements()` Generator追加
3. `run()` 簡略化（120行 → 10行）
4. `executeForBlock()` / `executeWhileBlock()` を再帰的Generatorに変更

**AST構造は一切触らない**

### 理由

現在の実装は、**既にAST構造としてはブロックベース**です。

問題は**実行ロジック**にあります：
- loopStackを使ったインデックスベース実行（複雑）
- 二重のループ構造（loopStack処理 vs 通常行処理）

再帰的Generatorへの移行は、**AST構造はそのままに、実行方法だけを変更**します。

### 比較

| 項目 | 現在 | 再帰的Generator | AST変更 |
|------|------|----------------|---------|
| AST構造 | ForBlockStatement.body | ForBlockStatement.body | **なし** ✅ |
| 実行方法 | loopStack + bodyIndex | yield* executeStatements(body) | - |
| run()行数 | 120行 | 10行 | - |
| 変更箇所 | - | workerInterpreter.tsのみ | - |

### 作業量

- AST変更: **0行** ✅
- Parser変更: **0行** ✅
- Interpreter変更: 約100行（削減分含めて差し引き約-40行）

**総変更量**: workerInterpreter.tsのみ、約100行の修正

これは非常に良い状況です。AST構造が既に正しく設計されているため、実行ロジックだけを改善すれば良いということです。
