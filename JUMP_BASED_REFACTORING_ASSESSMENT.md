# 行ジャンプベース実装への変更難易度評価

## 概要

現在の`loopStack`ベースの再帰的ブロック実行から、VTL2オリジナルの行ジャンプベース実装に戻した場合の難易度を評価します。

## 問題の本質

### 現在の複雑さの根本原因

ユーザーの指摘通り、**FOR/WHILE/block-IFの再帰的ブロック実行が複雑さの根源**です：

1. **二重の実行ループ**
   - `run()`の外側ループ: 通常の行処理
   - `run()`の内側ループ: `loopStack`処理
   - 2つのセマンティクスが混在

2. **状態管理の複雑化**
   - `currentLineIndex`: 通常行処理用
   - `loopStack[].bodyIndex`: ブロック内ステートメント処理用
   - 入力待ちの場合、**両方**のインデックス制御が必要

3. **修正箇所の増大**
   - 通常行処理: 1箇所
   - FORループ最初のステートメント: 1箇所
   - WHILEループ最初のステートメント: 1箇所
   - ループ内次のステートメント: 1箇所
   - **合計4箇所**に同じパターンの修正

## VTL2オリジナルの行ジャンプ仕様

### 構造化制御のセマンティクス

```workerscript
100 @=I,1,10        // FOR I=1 TO 10
200   ?=I           // ステートメント
300 #=@             // ループ終端 → 100の次へジャンプ（行200）

400 @=(X<100)       // WHILE X<100
500   X=X+1         // ステートメント
600 #=@             // ループ終端 → 400の次へジャンプ（行500）
```

### キーポイント

1. **`@=` (FOR/WHILE)は「次の行」へ進むだけ**
   - ブロック本体をpushしない
   - 条件が偽なら`#=@`まで**スキップ**

2. **`#=@` (ループ終端)が制御**
   - 対応する`@=`の位置を記憶
   - 条件チェック後、`@=`の**次の行**へジャンプ
   - または`#=@`の次の行へ進む

3. **すべての制御が`currentLineIndex`の操作**
   - `loopStack`不要
   - 単一の実行ループ
   - 単一のインデックス

## 行ジャンプベース実装への変更

### 1. データ構造の簡略化

#### 削除するもの
```typescript
// 削除
interface LoopBlockInfo {
    type: 'for' | 'while';
    variable?: string;
    start?: number;
    end?: number;
    step?: number;
    condition?: Expression;
    body: Statement[];        // ← 不要
    bodyIndex: number;        // ← 不要
    currentValue?: number;
}

private loopStack: LoopBlockInfo[] = [];  // ← 削除
```

#### 追加するもの
```typescript
// ループ実行状態（ジャンプ用）
interface LoopState {
    type: 'for' | 'while';
    startLineIndex: number;   // @= の行インデックス
    variable?: string;        // FOR変数名
    start?: number;
    end?: number;
    step?: number;
    currentValue?: number;
    condition?: Expression;   // WHILE条件
}

private loopStates: LoopState[] = [];  // スタック（ネスト対応）
```

**変更量**: 約20行（型定義の簡略化）

### 2. Parserの変更

#### AST定義の変更
```typescript
// 現在: ブロック構造
export interface ForBlockStatement {
    type: 'ForBlockStatement';
    variable: string;
    start: Expression;
    end: Expression;
    step?: Expression;
    body: Statement[];  // ← 削除
}

// 変更後: ジャンプ構造
export interface ForStatement {
    type: 'ForStatement';
    variable: string;
    start: Expression;
    end: Expression;
    step?: Expression;
    // bodyフィールドなし
}

export interface LoopEndStatement {
    type: 'LoopEndStatement';  // #=@
}
```

#### Parserの修正箇所

1. **`@=` (FOR/WHILE)のパース**: 
   - `body`を収集する処理を削除
   - 単純に`ForStatement`/`WhileStatement`を返す
   - **変更量**: 約50行削減（ブロック収集ロジック削除）

2. **`#=@`のパース**: 
   - 新しい`LoopEndStatement`を返す
   - **変更量**: 約10行追加

**変更量**: 約40行削減（差し引き）

### 3. Interpreterの変更

#### run()メソッドの簡略化

##### 現在（120行）
```typescript
*run(): Generator<void, void, void> {
    this.loopStack = [];
    
    while (this.currentLineIndex < program.length || this.loopStack.length > 0) {
        // loopStack処理（約70行）
        if (this.loopStack.length > 0) {
            // FOR/WHILEの次のイテレーション判定（30行）
            // ループ内ステートメント実行（30行）
            // bodyIndex管理（10行）
        }
        
        // 通常行処理（約30行）
        const line = this.program.body[this.currentLineIndex];
        for (const statement of line.statements) {
            this.executeStatement(statement);
            yield;
        }
    }
}
```

##### 変更後（約40行）
```typescript
*run(): Generator<void, void, void> {
    this.loopStates = [];
    
    while (this.currentLineIndex < program.length) {
        const line = this.program.body[this.currentLineIndex];
        
        for (const statement of line.statements) {
            this.executeStatement(statement);
            // executeStatement内でcurrentLineIndexが変更される
            // （GOTO, ループジャンプなど）
            yield;
        }
        
        // ジャンプしていなければ次の行へ
        this.currentLineIndex++;
    }
}
```

**削減量**: 約80行（120行 → 40行）

#### ステートメント実行メソッド

##### executeForStatement()
```typescript
// 現在（約30行）: bodyをloopStackにpush
private executeForBlock(statement: any): ExecutionResult {
    // 開始値・終了値・ステップを評価（10行）
    // 条件チェック（5行）
    // loopStack.push({ body: forStmt.body, bodyIndex: 0, ... })（15行）
    return { jump: false, halt: false, skipRemaining: false };
}

// 変更後（約25行）: loopStatesにpush、次の行へ
private executeForStatement(statement: any): ExecutionResult {
    // 開始値・終了値・ステップを評価（10行）
    // 条件チェック（5行）
    if (shouldSkip) {
        // #=@ までスキップ
        this.skipToLoopEnd();  // 新規ヘルパー関数（後述）
        return { jump: false, halt: false, skipRemaining: false };
    }
    
    // loopStates.push({ startLineIndex: this.currentLineIndex, ... })（5行）
    // 次の行へ進む（5行）
    return { jump: false, halt: false, skipRemaining: false };
}
```

**変更量**: 約5行削減、ロジックはシンプル化

##### executeLoopEnd()（新規）
```typescript
private executeLoopEnd(statement: any): ExecutionResult {
    if (this.loopStates.length === 0) {
        throw new Error('#=@ に対応する @= がありません');
    }
    
    const currentLoop = this.loopStates[this.loopStates.length - 1]!;
    
    if (currentLoop.type === 'for') {
        // 変数を更新
        const newValue = currentLoop.currentValue! + currentLoop.step!;
        const shouldContinue = currentLoop.step! > 0
            ? newValue <= currentLoop.end!
            : newValue >= currentLoop.end!;
        
        if (shouldContinue) {
            this.variables.set(currentLoop.variable!, newValue);
            currentLoop.currentValue = newValue;
            
            // @= の次の行へジャンプ
            this.currentLineIndex = currentLoop.startLineIndex + 1;
            return { jump: true, halt: false, skipRemaining: false };
        } else {
            // ループ終了
            this.loopStates.pop();
            return { jump: false, halt: false, skipRemaining: false };
        }
    } else if (currentLoop.type === 'while') {
        // 条件を再評価
        const condition = this.assertNumber(
            this.evaluateExpression(currentLoop.condition!),
            'WHILEループの条件は数値でなければなりません'
        );
        
        if (condition !== 0) {
            // @= の次の行へジャンプ
            this.currentLineIndex = currentLoop.startLineIndex + 1;
            return { jump: true, halt: false, skipRemaining: false };
        } else {
            // ループ終了
            this.loopStates.pop();
            return { jump: false, halt: false, skipRemaining: false };
        }
    }
    
    return { jump: false, halt: false, skipRemaining: false };
}
```

**追加量**: 約40行（新規メソッド）

##### skipToLoopEnd()（新規ヘルパー）
```typescript
private skipToLoopEnd(): void {
    let depth = 1;
    this.currentLineIndex++;
    
    while (this.currentLineIndex < this.program.body.length) {
        const line = this.program.body[this.currentLineIndex]!;
        for (const stmt of line.statements) {
            if (stmt.type === 'ForStatement' || stmt.type === 'WhileStatement') {
                depth++;
            } else if (stmt.type === 'LoopEndStatement') {
                depth--;
                if (depth === 0) {
                    return;  // #=@ の行で停止
                }
            }
        }
        this.currentLineIndex++;
    }
    
    throw new Error('対応する #=@ が見つかりません');
}
```

**追加量**: 約20行（新規ヘルパー）

### 4. 入力待ち処理の簡略化

#### 現在の複雑さ
- 4箇所に`waitingForInput`チェックが必要
- 各箇所で`statementIndex`または`bodyIndex`を管理

#### 変更後
```typescript
*run(): Generator<void, void, void> {
    this.loopStates = [];
    
    while (this.currentLineIndex < program.length) {
        const line = this.program.body[this.currentLineIndex];
        
        let statementIndex = 0;
        while (statementIndex < line.statements.length) {
            const statement = line.statements[statementIndex]!;
            
            this.waitingForInput = false;
            const result = this.executeStatement(statement);
            
            if (this.waitingForInput) {
                // インデックスを進めない → 次のnext()で再実行
                yield;
                continue;
            }
            
            if (result.jump || result.halt) {
                if (result.halt) return;
                break;  // ジャンプ時は行の残りをスキップ
            }
            
            statementIndex++;
            yield;
        }
        
        // ジャンプしていなければ次の行へ
        if (!jumped) {
            this.currentLineIndex++;
        }
    }
}
```

**変更箇所**: **1箇所のみ**（通常行処理）

**削減量**: 4箇所 → 1箇所（修正箇所75%削減）

## 変更量の総計

| 箇所 | 現在の行数 | 変更後の行数 | 差分 |
|------|-----------|-------------|------|
| **AST定義** | 約60行 | 約40行 | -20行 |
| **Parser** | 約200行 | 約160行 | -40行 |
| **Interpreter データ構造** | 約40行 | 約30行 | -10行 |
| **run()メソッド** | 約120行 | 約50行 | -70行 |
| **executeForBlock()** | 約30行 | 約25行 | -5行 |
| **executeWhileBlock()** | 約20行 | 約20行 | 0行 |
| **executeLoopEnd()** | 0行 | 約40行 | +40行 |
| **skipToLoopEnd()** | 0行 | 約20行 | +20行 |
| **executeIfBlock()** | 約30行 | 約30行 | 0行（同様に変更可能） |
| **入力待ち修正** | 4箇所×25行 | 1箇所×10行 | -90行 |
| **合計** | 約500行 | 約415行 | **-85行** |

## 難易度評価

### 変更の性質

1. **構造的な変更**: AST、Parser、Interpreterのアーキテクチャ変更
2. **セマンティクスの変更**: ブロック実行 → 行ジャンプ
3. **既存テストへの影響**: 動作は同じなので、**テストは変更不要**

### 難易度スコア（10点満点）

| 項目 | スコア | 理由 |
|------|--------|------|
| **変更範囲** | 7/10 | AST+Parser+Interpreter全体に及ぶ |
| **ロジック複雑度** | 4/10 | 行ジャンプはシンプル、理解しやすい |
| **バグリスク** | 5/10 | 構造変更だが、テストでカバー可能 |
| **テスト修正** | 2/10 | 動作は同じ、テスト修正ほぼ不要 |
| **保守性向上** | 9/10 | 大幅に改善、単一ループに統一 |
| **総合難易度** | 5.4/10 | **中程度**（2-3日の作業） |

### 現在の入力待ち実装との比較

| 項目 | ブロッキング入力実装<br/>（loopStackベース） | 行ジャンプ実装<br/>（入力待ち含む） |
|------|----------------------------------------|--------------------------------|
| **修正箇所** | 4箇所（通常行+FOR+WHILE+次） | 1箇所（通常行のみ） |
| **修正行数** | 約100行 | 約10行 |
| **修正率** | 83% | 20% |
| **バグリスク** | 高（状態管理複雑） | 低（単純なインデックス制御） |
| **保守性** | 低（4箇所に同じロジック散在） | 高（1箇所に集約） |
| **見積もり** | 3-4時間（実装+テスト） | 30分（実装+テスト） |

## 推奨事項

### オプション1: 行ジャンプベースにリファクタリング（推奨）

**メリット**:
1. **根本的な複雑さの解消**: `loopStack`の二重ループを排除
2. **入力待ち実装が簡単**: 1箇所のみの修正で済む（10行）
3. **保守性の大幅向上**: 単一の実行ループ、理解しやすい
4. **VTL2仕様に忠実**: 行ジャンプベースが本来のセマンティクス
5. **将来の拡張が容易**: BREAK、CONTINUE、マルチレベルループ脱出など

**デメリット**:
1. **初期投資が大**: 約85行の変更（AST+Parser+Interpreter全体）
2. **構造的な変更**: アーキテクチャレベルの修正
3. **時間が必要**: 2-3日の作業（テスト含む）

**手順**:
1. AST定義の変更（20行）
2. Parserの修正（40行削減）
3. Interpreterの修正（85行変更）
4. 既存テストの実行（修正不要のはず）
5. 入力待ち機能の実装（10行）

**見積もり**: 2-3日

### オプション2: 現在のloopStackベースで入力待ち実装

**メリット**:
1. **短期的には早い**: 3-4時間で入力待ち機能完成
2. **リスクが限定的**: 既存のアーキテクチャを変更しない

**デメリット**:
1. **複雑さが残る**: 4箇所に同じパターンの修正
2. **保守性が低い**: 将来の拡張が困難
3. **バグリスク**: 状態管理が複雑、コピー&ペーストエラー

**見積もり**: 3-4時間

## 結論

**行ジャンプベースへのリファクタリングを強く推奨します。**

### 理由

1. **複雑さの根本原因を解消**
   - 二重ループ → 単一ループ
   - 4箇所の修正 → 1箇所の修正
   - 保守性が大幅に向上

2. **入力待ち実装が劇的に簡単**
   - 100行の修正 → 10行の修正
   - 修正率83% → 20%
   - バグリスク高 → 低

3. **初期投資は大きいが、長期的にはメリット大**
   - 2-3日の投資で、将来の拡張が容易に
   - BREAK、CONTINUE、エラーハンドリングなども簡単

4. **VTL2仕様に忠実**
   - 行ジャンプが本来のセマンティクス
   - GOTO、GOSUBと統一的な制御フロー

### 次のステップ

1. ユーザーの承認を得る
2. 新しいブランチ作成: `feature/jump-based-refactoring`
3. 段階的な実装:
   - Phase 1: AST定義変更
   - Phase 2: Parser修正
   - Phase 3: Interpreter修正
   - Phase 4: テスト実行
   - Phase 5: 入力待ち機能追加
4. マージ前に包括的なテスト

### タイムライン

| フェーズ | 作業内容 | 見積もり |
|---------|---------|---------|
| Phase 1 | AST定義変更 | 1時間 |
| Phase 2 | Parser修正 | 3時間 |
| Phase 3 | Interpreter修正 | 4時間 |
| Phase 4 | テスト実行・修正 | 2時間 |
| Phase 5 | 入力待ち実装 | 1時間 |
| Phase 6 | 包括的テスト | 2時間 |
| **合計** | | **13時間（2日）** |

この投資により、コードベースが劇的に改善され、今後の機能追加が容易になります。
