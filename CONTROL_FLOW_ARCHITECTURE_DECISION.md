# 制御フロー・アーキテクチャの決定

## エグゼクティブサマリー

現在のインタプリタは**行ベース（インラインIF、GOTO/GOSUB）とブロックベース（FOR/WHILE/block-IF）が混在**しており、この二重のセマンティクスが複雑さの根本原因です。

**推奨**: **ブロックベース完全移行**（オプションB）を採用し、すべての制御フローを統一的なASTベース実行に移行します。

## 歴史的経緯

### Phase 1: 初期実装（行ベース）
- インラインIF（`;=<条件> <ステートメント>`）
- 行志向のFOR（`FOR I=1 TO 10` + `NEXT I`）
- **課題**: 「次のNEXTを探す」ロジックが複雑

### Phase 2: ブロック構造導入（現在）
- ブロックIF（`;=<条件>` ... `#=;`）
- ブロックFOR/WHILE（`@=I,1,10` ... `#=@`）
- **現状**: `NextStatement`はno-op、ブロック構造がメイン
- **課題**: 行ベースとブロックベースが混在、`loopStack`による二重ループ

### Phase 3の選択肢

以下の3つのアーキテクチャを評価します：

## オプションA: 行ジャンプベース完全移行

### 概要
すべての制御フローを行ジャンプ（GOTOライク）で実装。

### セマンティクス

```workerscript
100 @=I,1,10        // FOR開始 → 次の行へ（条件偽なら#=@までスキップ）
200   ?=I           // ループ本体
300 #=@             // ループ終端 → 100の次（200）へジャンプ

400 ;=A>5           // IF → 条件真なら次の行、偽なら;までスキップ
500   ?="yes"       // THEN部
600 ;               // ELSE開始
700   ?="no"        // ELSE部
800 #=;             // IF終了
```

### 実装

#### データ構造
```typescript
interface LoopState {
    type: 'for' | 'while';
    startLineIndex: number;   // @= の行
    variable?: string;
    start?: number;
    end?: number;
    step?: number;
    currentValue?: number;
    condition?: Expression;
}

private loopStates: LoopState[] = [];
private currentLineIndex: number = 0;
```

#### run()メソッド（約50行）
```typescript
*run(): Generator<void, void, void> {
    this.loopStates = [];
    
    while (this.currentLineIndex < this.program.body.length) {
        const line = this.program.body[this.currentLineIndex];
        
        for (const statement of line.statements) {
            this.executeStatement(statement);
            // executeStatement内でcurrentLineIndexが変更される可能性
            yield;
        }
        
        this.currentLineIndex++;
    }
}
```

#### ステートメント実行
```typescript
// @=I,1,10
private executeForStatement(stmt: any): ExecutionResult {
    // 初期化・条件チェック
    if (shouldSkip) {
        this.skipToLoopEnd();  // #=@までスキップ
        return { jump: false, halt: false, skipRemaining: false };
    }
    
    this.loopStates.push({ startLineIndex: this.currentLineIndex, ... });
    return { jump: false, halt: false, skipRemaining: false };
}

// #=@
private executeLoopEnd(stmt: any): ExecutionResult {
    const loop = this.loopStates[this.loopStates.length - 1]!;
    
    // 条件チェック
    if (shouldContinue) {
        this.currentLineIndex = loop.startLineIndex + 1;  // ジャンプ
        return { jump: true, halt: false, skipRemaining: false };
    }
    
    this.loopStates.pop();
    return { jump: false, halt: false, skipRemaining: false };
}
```

### メリット
- ✅ **単一の実行ループ**: `run()`がシンプル（約50行）
- ✅ **GOTO/GOSUBと統一**: すべてが行ジャンプ
- ✅ **VTL2に忠実**: オリジナル仕様に近い
- ✅ **入力待ち実装が簡単**: 1箇所のみの修正（10行）

### デメリット
- ❌ **スキップロジックが必要**: `skipToLoopEnd()`、`skipToElse()`など
- ⚠️ **過去の問題が再現**: 「次のNEXTを探す」と同じ複雑さ
- ❌ **ネストカウント必須**: depth管理が必要
- ❌ **エラー検出が遅い**: 実行時まで`#=@`の不一致を検出できない

### 実装規模
- AST変更: -20行
- Parser変更: -40行
- Interpreter変更: +60行（skipロジック）
- 合計: **約2-3日**

### 致命的な問題: 過去の失敗の再現

**「次のNEXTを探す」ロジックが複雑だった**という過去の経験が、そのまま`skipToLoopEnd()`として再現されます：

```typescript
private skipToLoopEnd(): void {
    let depth = 1;
    this.currentLineIndex++;
    
    while (this.currentLineIndex < this.program.body.length) {
        const line = this.program.body[this.currentLineIndex]!;
        for (const stmt of line.statements) {
            if (stmt.type === 'ForStatement' || stmt.type === 'WhileStatement') {
                depth++;  // ネストしたループ
            } else if (stmt.type === 'LoopEndStatement') {
                depth--;
                if (depth === 0) {
                    return;  // 対応する#=@を発見
                }
            }
        }
        this.currentLineIndex++;
    }
    
    throw new Error('対応する #=@ が見つかりません');
}
```

このロジックは：
1. **ネストカウントが必要**（過去と同じ複雑さ）
2. **O(n)の線形探索**（大きなプログラムで遅い）
3. **エラー検出が遅い**（実行時まで不一致を検出できない）

## オプションB: ブロックベース完全移行（推奨）⭐⭐⭐

### 概要
すべての制御フローをASTのブロック構造（`body: Statement[]`）で表現。

### セマンティクス

```workerscript
@=I,1,10
  ?=I
#=@
```

↓ ASTとして解析

```typescript
{
  type: 'ForBlockStatement',
  variable: 'I',
  start: 1,
  end: 10,
  body: [
    { type: 'OutputStatement', expression: { type: 'Identifier', name: 'I' } }
  ]
}
```

### 実装

#### データ構造（現在とほぼ同じ）
```typescript
interface ForBlockStatement {
    type: 'ForBlockStatement';
    variable: string;
    start: Expression;
    end: Expression;
    step?: Expression;
    body: Statement[];  // パース時に確定
}
```

#### run()メソッド（約30行）
```typescript
*run(): Generator<void, void, void> {
    for (const line of this.program.body) {
        for (const statement of line.statements) {
            this.waitingForInput = false;
            const result = this.executeStatement(statement);
            
            if (this.waitingForInput) {
                // 入力待ち
                yield;
                continue;  // 同じステートメントを再実行
            }
            
            if (result.jump || result.halt) {
                if (result.halt) return;
            }
            
            yield;
        }
    }
}
```

#### ステートメント実行
```typescript
private executeForBlock(stmt: ForBlockStatement): ExecutionResult {
    const start = this.evaluateExpression(stmt.start);
    const end = this.evaluateExpression(stmt.end);
    const step = stmt.step ? this.evaluateExpression(stmt.step) : 1;
    
    this.variables.set(stmt.variable, start);
    
    for (let value = start; shouldContinue(value, end, step); value += step) {
        this.variables.set(stmt.variable, value);
        
        for (const bodyStmt of stmt.body) {
            this.waitingForInput = false;
            const result = this.executeStatement(bodyStmt);
            
            if (this.waitingForInput) {
                // 入力待ち → Generatorをreturnして外側に委譲
                // （実装の詳細は後述）
                yield;
                // 再開時に続きから
            }
            
            if (result.jump || result.halt) {
                return result;
            }
            
            yield;
        }
    }
    
    return { jump: false, halt: false, skipRemaining: false };
}
```

### キーポイント: 再帰的Generator

ブロック内のステートメント実行を**Generator化**することで、入力待ちをエレガントに処理：

```typescript
private *executeStatements(statements: Statement[]): Generator<void, ExecutionResult, void> {
    for (const stmt of statements) {
        this.waitingForInput = false;
        const result = this.executeStatement(stmt);
        
        if (this.waitingForInput) {
            yield;
            // 再開時: 同じステートメントを再実行
            continue;
        }
        
        if (result.jump || result.halt) {
            return result;
        }
        
        yield;
    }
    
    return { jump: false, halt: false, skipRemaining: false };
}

private executeForBlock(stmt: ForBlockStatement): ExecutionResult {
    const start = this.evaluateExpression(stmt.start);
    const end = this.evaluateExpression(stmt.end);
    const step = stmt.step ? this.evaluateExpression(stmt.step) : 1;
    
    this.variables.set(stmt.variable, start);
    
    for (let value = start; shouldContinue(value, end, step); value += step) {
        this.variables.set(stmt.variable, value);
        
        // Generatorを委譲
        const result = yield* this.executeStatements(stmt.body);
        
        if (result.jump || result.halt) {
            return result;
        }
    }
    
    return { jump: false, halt: false, skipRemaining: false };
}
```

**これにより**:
- ✅ 入力待ち処理が**1箇所**に集約（`executeStatements()`内）
- ✅ ブロック構造が再帰的に処理される
- ✅ `yield*`で委譲されるため、外側の`run()`から見ても透過的

### メリット
- ✅ **パース時に構造が確定**: エラー検出が早い
- ✅ **スキップロジック不要**: `body`配列を実行しないだけ
- ✅ **ネストが自然**: 再帰的な構造
- ✅ **型安全**: ASTの型で構造を保証
- ✅ **入力待ち処理が簡単**: 1箇所に集約
- ✅ **過去の問題を解決**: 「次のNEXTを探す」不要

### デメリット
- ⚠️ **現在の`loopStack`問題が残る**: しかし、これは再帰的Generatorで解決可能
- ⚠️ **GOTOとの混在**: 行ジャンプとブロック実行が共存

### GOTO/GOSUBとの共存

GOTOはどうするか？

#### Option B-1: GOTO禁止（最もシンプル）
```workerscript
@=I,1,10
  #=^SKIP  // エラー: ループ内からGOTO不可
#=@
```

#### Option B-2: GOTOをループ脱出として扱う
```typescript
private executeForBlock(stmt: ForBlockStatement): ExecutionResult {
    for (...) {
        const result = yield* this.executeStatements(stmt.body);
        
        if (result.jump) {
            // GOTOが発生 → ループを抜けて外側に伝播
            return result;
        }
    }
}
```

**推奨**: Option B-2（GOTOでループ脱出可能）

### 実装規模
- AST変更: 0行（現状維持）
- Parser変更: 0行（現状維持）
- Interpreter変更: 
  - `executeStatements()` Generator追加: +20行
  - `executeForBlock()` 修正: +10行
  - `executeWhileBlock()` 修正: +10行
  - `run()` 簡略化: -80行
- 合計: **約40行削減、1日の作業**

### 段階的移行パス

1. **Phase 1**: `executeStatements()` Generator追加
2. **Phase 2**: `run()`から`loopStack`削除、`executeStatements()`使用
3. **Phase 3**: `executeForBlock()`/`executeWhileBlock()`を再帰的Generatorに変更
4. **Phase 4**: テスト実行
5. **Phase 5**: 入力待ち機能追加（10行）

## オプションC: ハイブリッド（最悪）

行ベースとブロックベースを両方サポート。

### デメリット
- ❌ **複雑さが倍増**: 2つのセマンティクスを永続的に維持
- ❌ **保守コスト**: バグが2箇所で発生
- ❌ **入力待ち処理**: 両方のパスで実装が必要

**非推奨**: 現在の混乱状態を固定化するだけ

## 比較マトリクス

| 項目 | オプションA<br/>行ジャンプ | オプションB<br/>ブロック完全移行⭐ | オプションC<br/>ハイブリッド |
|------|------------------------|------------------------------|------------------------|
| **単一ループ** | ✅ | ✅ | ❌ |
| **スキップロジック** | ❌ 必要 | ✅ 不要 | ❌ 必要 |
| **エラー検出** | ❌ 実行時 | ✅ パース時 | ⚠️ 混在 |
| **入力待ち実装** | ⚠️ 1箇所（10行） | ✅ 1箇所（10行） | ❌ 2箇所 |
| **過去の問題** | ❌ 再現 | ✅ 解決 | ❌ 再現 |
| **VTL2準拠** | ✅ | ⚠️ | ⚠️ |
| **実装規模** | 2-3日 | **1日** | 5-7日 |
| **保守性** | ⚠️ 中 | ✅ 高 | ❌ 低 |
| **総合評価** | ⚠️ | ⭐⭐⭐ | ❌ |

## 決定: オプションB（ブロックベース完全移行）

### 理由

1. **過去の失敗を繰り返さない**
   - 「次のNEXTを探す」ロジックが複雑だった
   - オプションAの`skipToLoopEnd()`は同じ複雑さ
   - オプションBはスキップ不要（`body`を実行しないだけ）

2. **入力待ち実装が簡単**
   - 再帰的Generator（`yield*`）で透過的に処理
   - 1箇所に集約（`executeStatements()`内）
   - 10行の追加で完了

3. **エラー検出が早い**
   - パース時にブロック構造を検証
   - `#=@`の不一致をパース時に検出
   - 実行時エラーが減少

4. **実装規模が最小**
   - 約40行削減
   - 1日の作業
   - リスクが低い

5. **保守性が高い**
   - 単一のセマンティクス
   - 型安全（ASTで保証）
   - コードが短い

### GOTOとの共存方針

- **基本**: ブロック内からのGOTOはループ脱出として扱う
- **実装**: `ExecutionResult.jump`をブロック実行から伝播
- **VTL2との違い**: 
  - VTL2: すべてが行ジャンプ
  - 本実装: ブロック構造 + GOTO脱出
  - **影響**: ほぼなし（使用パターンは同じ）

### 段階的実装計画

#### Phase 1: 再帰的Generator導入（3時間）

```typescript
// 新規ヘルパー
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

#### Phase 2: run()簡略化（2時間）

```typescript
*run(): Generator<void, void, void> {
    for (const line of this.program.body) {
        const result = yield* this.executeStatements(line.statements);
        
        if (result.halt) {
            return;
        }
    }
}
```

#### Phase 3: ループブロック修正（2時間）

```typescript
private executeForBlock(stmt: ForBlockStatement): ExecutionResult {
    const start = this.evaluateExpression(stmt.start);
    const end = this.evaluateExpression(stmt.end);
    const step = stmt.step ? this.evaluateExpression(stmt.step) : 1;
    
    this.variables.set(stmt.variable, start);
    
    for (let value = start; shouldContinue(value, end, step); value += step) {
        this.variables.set(stmt.variable, value);
        
        const result = yield* this.executeStatements(stmt.body);
        
        if (result.jump || result.halt) {
            return result;
        }
    }
    
    return { jump: false, halt: false, skipRemaining: false };
}
```

#### Phase 4: テスト実行（1時間）

```bash
npm test
npm run lint
```

#### Phase 5: 入力待ち機能追加（1時間）

`executeStatements()`内の`waitingForInput`チェックで完結。

### タイムライン

| フェーズ | 作業内容 | 見積もり |
|---------|---------|---------|
| Phase 1 | executeStatements() Generator追加 | 3時間 |
| Phase 2 | run() 簡略化（loopStack削除） | 2時間 |
| Phase 3 | executeForBlock/WhileBlock修正 | 2時間 |
| Phase 4 | テスト実行・修正 | 1時間 |
| Phase 5 | 入力待ち機能実装 | 1時間 |
| **合計** | | **9時間（1日強）** |

## 次のステップ

1. ✅ この決定をユーザーに確認
2. 新しいブランチ作成: `feature/block-based-refactoring`
3. Phase 1から順次実装
4. 各Phaseでテスト実行
5. マージ前に包括的なテスト

## 補足: VTL2との違い

### VTL2オリジナル
```vtl2
10 @=I,1,10
20   ?=I
30 #=@
```
- 行10: FOR開始、次の行（20）へ
- 行20: ステートメント実行
- 行30: 条件チェック → 行20へジャンプ

### 本実装
```workerscript
@=I,1,10
  ?=I
#=@
```
- パース時: `ForBlockStatement { body: [OutputStatement] }`
- 実行時: ブロック構造として実行

### 動作の違い

**ない**。どちらも同じ結果になる。

### 仕様書への記載

```markdown
## 実装上の違い

本実装では、FOR/WHILE/block-IFはVTL2の行ジャンプではなく、
ブロック構造（AST）として実装されています。
この違いは実行結果に影響しませんが、以下の点で異なります：

1. パース時にブロック構造が確定
2. #=@ の不一致をパース時に検出
3. ブロック内からのGOTOはループ脱出として動作
```

## まとめ

**推奨**: オプションB（ブロックベース完全移行）

- ✅ 過去の失敗（「次のNEXTを探す」複雑さ）を回避
- ✅ 入力待ち実装が簡単（1箇所、10行）
- ✅ 実装規模が最小（1日強）
- ✅ 保守性が高い（単一セマンティクス）
- ✅ エラー検出が早い（パース時）

オプションAは行ジャンプに統一されますが、過去の複雑さが再現されます。
オプションCはハイブリッドで、複雑さが倍増します。

ブロックベースへの完全移行により、シンプルで保守しやすいコードベースを実現します。
