# run()メソッド修正の複雑さ評価

**作成日**: 2025年10月21日  
**目的**: ブロッキング入力実装の複雑さを評価し、アプローチを再検討

---

## 現状の進捗

### ✅ 完了した作業

1. **LineInputResult型定義** - シンプル
   ```typescript
   export interface LineInputResult {
       complete: boolean;
       value: string;
   }
   ```

2. **WorkerInterpreterフィールド追加** - シンプル
   ```typescript
   private waitingForInput: boolean = false;
   private echoedLength: number = 0;
   private getLineFn: (() => LineInputResult) | undefined;
   ```

3. **evaluateInputNumberExpression()修正** - シンプル（約35行）
   ```typescript
   if (!result.complete) {
       this.waitingForInput = true;
       // ポインタ方式エコーバック
       if (result.value.length > this.echoedLength) {
           const newChars = result.value.substring(this.echoedLength);
           this.logFn(newChars);
           this.echoedLength = result.value.length;
       }
       return 0;
   }
   
   // 入力完了
   this.waitingForInput = false;
   this.echoedLength = 0;
   return parseInt(result.value, 10);
   ```

---

## 未完了の作業（複雑な部分）

### ❌ run()メソッドの修正

現在の構造:
```typescript
*run(): Generator<void, void, unknown> {
    while (currentLineIndex < program.body.length || loopStack.length > 0) {
        // 1. loopStack処理（約70行）
        if (loopStack.length > 0) {
            // FORループの次のイテレーション（約30行）
            if (currentLoop.type === 'for') {
                // 最初のステートメント実行
                const stmt = currentLoop.body[0]!;
                const result = this.executeStatement(stmt);
                // ...
            }
            
            // WHILEループの次のイテレーション（約30行）
            else if (currentLoop.type === 'while') {
                // 最初のステートメント実行
                const stmt = currentLoop.body[0]!;
                const result = this.executeStatement(stmt);
                // ...
            }
            
            // 次のステートメント実行（約10行）
            const stmt = currentLoop.body[currentLoop.bodyIndex]!;
            const result = this.executeStatement(stmt);
            // ...
        }
        
        // 2. 通常の行処理（約30行）
        for (const statement of line.statements) {
            const result = this.executeStatement(statement);
            // ...
            yield;
        }
    }
}
```

**必要な修正**:

#### A. for...of → whileループへ変更

```typescript
// 現在
for (const statement of line.statements) {
    const result = this.executeStatement(statement);
    yield;
}

// 修正後
let statementIndex = 0;
while (statementIndex < line.statements.length) {
    const statement = line.statements[statementIndex]!;
    
    // 入力待ちフラグをリセット
    this.waitingForInput = false;
    
    const result = this.executeStatement(statement);
    
    if (this.waitingForInput) {
        // statementIndexを進めない
        yield;
        continue;
    }
    
    // 正常: 次へ進む
    statementIndex++;
    
    if (result.jump) { ... }
    if (result.halt) { ... }
    if (result.skipRemaining) { ... }
    
    yield;
}
```

**影響範囲**: 約30行

---

#### B. loopStack内の3箇所を修正

**箇所1: FORループの最初のステートメント**（約30行）
```typescript
if (currentLoop.body.length > 0) {
    // 修正前
    const stmt = currentLoop.body[0]!;
    const result = this.executeStatement(stmt);
    currentLoop.bodyIndex = 1;
    yield;
    continue;
    
    // 修正後
    this.waitingForInput = false;
    const stmt = currentLoop.body[0]!;
    const result = this.executeStatement(stmt);
    
    if (this.waitingForInput) {
        // bodyIndexを進めない
        yield;
        continue;
    }
    
    currentLoop.bodyIndex = 1;
    yield;
    continue;
}
```

**箇所2: WHILEループの最初のステートメント**（約30行）
- FORループと同様の修正

**箇所3: ループ内の次のステートメント**（約10行）
```typescript
if (currentLoop.bodyIndex < currentLoop.body.length) {
    // 修正前
    const stmt = currentLoop.body[currentLoop.bodyIndex]!;
    const result = this.executeStatement(stmt);
    currentLoop.bodyIndex++;
    yield;
    continue;
    
    // 修正後
    this.waitingForInput = false;
    const stmt = currentLoop.body[currentLoop.bodyIndex]!;
    const result = this.executeStatement(stmt);
    
    if (this.waitingForInput) {
        // bodyIndexを進めない
        yield;
        continue;
    }
    
    currentLoop.bodyIndex++;
    yield;
    continue;
}
```

---

## 複雑さの定量評価

### 修正箇所

| 箇所 | 行数 | 複雑度 | リスク |
|------|------|--------|--------|
| 通常の行処理（for...of → while） | 30行 | 中 | 中 |
| FORループ最初のステートメント | 30行 | 中 | 中 |
| WHILEループ最初のステートメント | 30行 | 中 | 中 |
| ループ内の次のステートメント | 10行 | 低 | 低 |
| **合計** | **100行** | **高** | **高** |

### 影響範囲

- run()メソッド全体: 約120行
- 修正箇所: 4箇所
- 修正行数: 約100行
- **修正率: 83%**

### リスク評価

1. **バグ混入の可能性**: 高
   - 複数の箇所に同じパターンの修正
   - コピー&ペーストエラーのリスク
   - ループの状態管理ミス

2. **テストの必要性**: 高
   - 通常行での入力待ち
   - FORループ内での入力待ち
   - WHILEループ内での入力待ち
   - ネストしたループでの入力待ち

3. **保守性**: 低
   - run()メソッドがさらに複雑化
   - 4箇所に同じロジックが散在
   - 将来の機能追加が困難

---

## 代替アプローチの検討

### 案A: 現在のアプローチを続行

**メリット**:
- ✅ 設計は完了している
- ✅ evaluateInputNumberExpression()は実装済み

**デメリット**:
- ❌ run()メソッドが非常に複雑
- ❌ 4箇所に同じ修正が必要
- ❌ バグリスク高
- ❌ テストが複雑

**見積もり**: 3-4時間（実装 + テスト）

---

### 案B: executeStatement()でwaitingForInputを返す

**アイディア**: ExecutionResultを拡張

```typescript
interface ExecutionResult {
    jump: boolean;
    halt: boolean;
    skipRemaining: boolean;
    waitingForInput: boolean;  // ← 追加
}

private executeStatement(statement: Statement): ExecutionResult {
    if (statement.type === 'AssignmentStatement') {
        const value = this.evaluateExpression(statement.value);
        this.setVariable(statement.variable, value);
        
        return {
            jump: false,
            halt: false,
            skipRemaining: false,
            waitingForInput: this.waitingForInput  // ← フラグを返す
        };
    }
    // ...
}
```

**run()での利用**:
```typescript
// 通常の行処理
for (const statement of line.statements) {
    this.waitingForInput = false;
    const result = this.executeStatement(statement);
    
    if (result.waitingForInput) {
        // for...ofでは同じ要素に戻れない
        // → やはりwhileループが必要
    }
    
    yield;
}
```

**問題**: for...ofはイテレータを進めてしまうため、やはりwhileループが必要

**メリット**:
- ⚠️ わずかにコードが整理される程度

**デメリット**:
- ❌ 根本的な解決にならない
- ❌ やはり4箇所の修正が必要
- ❌ ExecutionResultの変更による影響

---

### 案C: ノンブロッキング仕様に戻す

**アイディア**: A=? は改行がなければ0を返す（ブロッキングしない）

```typescript
private evaluateInputNumberExpression(): number {
    const result = this.getLineFn();
    
    if (!result.complete) {
        // 入力途中 → 0を返す（ブロッキングしない）
        return 0;
    }
    
    return parseInt(result.value, 10);
}
```

**メリット**:
- ✅ run()メソッドの修正不要
- ✅ シンプル
- ✅ すぐに動作

**デメリット**:
- ❌ VTL2オリジナル仕様と異なる
- ❌ ユーザーがループを書く必要

**ユーザーコード**:
```workerscript
?="Enter a number: "
^WAIT
A=?
IF A=0 CONT
?="You entered: " ?=A /
```

---

## 推奨

### 判断基準

1. **VTL2仕様への忠実度 vs 実装の複雑さ**
   - ブロッキング実装: 複雑度が非常に高い
   - ノンブロッキング実装: シンプル

2. **実用性**
   - ブロッキング: ユーザーコードがシンプル
   - ノンブロッキング: ユーザーが明示的にループ

3. **保守性**
   - ブロッキング: 将来の変更が困難
   - ノンブロッキング: 保守しやすい

---

## 選択肢

### オプション1: ブロッキング実装を完了させる

- run()メソッドを修正（4箇所、約100行）
- 包括的なテスト
- 見積もり: 3-4時間
- リスク: 高

### オプション2: ノンブロッキング仕様に変更

- run()メソッドの修正不要
- evaluateInputNumberExpression()を簡略化
- ドキュメントに「VTL2との差異」を明記
- 見積もり: 30分
- リスク: 低

---

## 質問

**どちらのアプローチを選択されますか？**

1. オプション1: ブロッキング実装を完了（複雑だが仕様通り）
2. オプション2: ノンブロッキング仕様に変更（シンプルだが仕様と異なる）
3. その他のアイディア

ご判断をお願いします。
