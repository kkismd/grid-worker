# ExecutionResultを受け取り処理するメソッド一覧

## 概要

`ExecutionResult`を受け取ってその`jump`や`halt`の値をチェックし、必要な処理を行うメソッドは、すべて**WorkerInterpreterクラス内**にあります。
外部クラスは`ExecutionResult`を直接扱いません。

## ExecutionResultを処理するメソッド一覧

### 1. `executeStatements()` - 中核的な処理メソッド

**役割:** ステートメント列を順次実行し、jump/haltが発生したら即座に呼び出し元に伝播

**シグネチャ:**
```typescript
private *executeStatements(statements: Statement[]): Generator<void, ExecutionResult, void>
```

**処理内容:**

#### パターンA: ForBlockStatementの場合
```typescript
if (stmt.type === 'ForBlockStatement') {
    const result = yield* this.executeForBlockGenerator(stmt);
    if (result.jump || result.halt) {
        return result;  // 伝播
    }
}
```

#### パターンB: WhileBlockStatementの場合
```typescript
else if (stmt.type === 'WhileBlockStatement') {
    const result = yield* this.executeWhileBlockGenerator(stmt);
    if (result.jump || result.halt) {
        return result;  // 伝播
    }
}
```

#### パターンC: 通常のステートメント
```typescript
else {
    const result = this.executeStatement(stmt);
    
    // jump/haltの場合は即座に呼び出し元に伝播
    if (result.jump || result.halt) {
        return result;  // 伝播
    }
}
```

**呼び出し元:**
- `run()` メソッド（メイン実行ループ）
- `executeForBlockGenerator()`（FORループ本体）
- `executeWhileBlockGenerator()`（WHILEループ本体）

---

### 2. `executeForBlockGenerator()` - FORループ実行

**役割:** FORループを実行し、ループ本体内で発生したjump/haltを呼び出し元に伝播

**シグネチャ:**
```typescript
private *executeForBlockGenerator(statement: ForBlockStatement): Generator<void, ExecutionResult, void>
```

**処理内容:**
```typescript
for (let currentValue = startValue; 
     stepValue > 0 ? currentValue <= endValue : currentValue >= endValue; 
     currentValue += stepValue) {
    
    this.variables.set(varName, currentValue);
    
    // ブロック内のステートメントを再帰的に実行
    const result = yield* this.executeStatements(statement.body);
    
    if (result.jump || result.halt) {
        return result;  // 伝播
    }
}
```

**処理の意味:**
- `result.jump`の場合: ループを中断してGOTO/GOSUB/RETURNの効果を伝播
- `result.halt`の場合: ループを中断してプログラム停止を伝播

**呼び出し元:**
- `executeStatements()` メソッド

---

### 3. `executeWhileBlockGenerator()` - WHILEループ実行

**役割:** WHILEループを実行し、ループ本体内で発生したjump/haltを呼び出し元に伝播

**シグネチャ:**
```typescript
private *executeWhileBlockGenerator(statement: WhileBlockStatement): Generator<void, ExecutionResult, void>
```

**処理内容:**
```typescript
while (true) {
    const condition = this.assertNumber(
        this.evaluateExpression(statement.condition),
        'WHILEループの条件は数値でなければなりません'
    );
    
    if (condition === 0) {
        break;
    }
    
    // ブロック内のステートメントを再帰的に実行
    const result = yield* this.executeStatements(statement.body);
    
    if (result.jump || result.halt) {
        return result;  // 伝播
    }
}
```

**処理の意味:**
- `result.jump`の場合: ループを中断してGOTO/GOSUB/RETURNの効果を伝播
- `result.halt`の場合: ループを中断してプログラム停止を伝播

**呼び出し元:**
- `executeStatements()` メソッド

---

### 4. `run()` - メイン実行ループ（最終的な処理決定）

**役割:** ExecutionResultを受け取り、**実際に処理を決定する最上位メソッド**

**シグネチャ:**
```typescript
public *run(): Generator<void, void, void>
```

**処理内容:**
```typescript
while (this.currentLineIndex < this.program.body.length) {
    // ブレークポイントチェック
    if (this.shouldBreak()) {
        yield;
        continue;
    }

    const line = this.program.body[this.currentLineIndex];
    if (!line) break;

    // 行内のステートメントを実行
    const result = yield* this.executeStatements(line.statements);
    
    // ★ halt の処理
    if (result.halt) {
        return;  // プログラム停止
    }
    
    // ★ jump の処理
    if (!result.jump) {
        this.currentLineIndex++;  // ジャンプしていない場合のみ次の行へ
    }
    // ※ jumpがtrueの場合は、currentLineIndexは既に変更済み
    //    （executeGoto/executeGosub/executeReturnで設定済み）
}
```

**処理の意味:**

#### `result.halt === true` の場合
- **動作:** `return;` でジェネレーターを終了
- **効果:** プログラム実行が完全に停止
- **発生元:** `HaltStatement` (`#=-1`)

#### `result.jump === true` の場合
- **動作:** `currentLineIndex` を増やさない
- **理由:** `executeGoto()` / `executeGosub()` / `executeReturn()` が既に `currentLineIndex` を変更済み
- **効果:** ジャンプ先の行から実行が継続される
- **発生元:** `GotoStatement` (`#=^LABEL`), `GosubStatement` (`!=^LABEL`), `ReturnStatement` (`#=!`)

#### `result.jump === false && result.halt === false` の場合
- **動作:** `currentLineIndex++` で次の行へ進む
- **効果:** 通常の順次実行
- **発生元:** すべての通常ステートメント

**呼び出し元:**
- 外部（RealTimeCLIRunner等）が `interpreter.run()` を呼び出す

---

### 5. `executeIfBlock()` - ブロックIF文実行

**役割:** IF文のthen/elseブロック内で発生したjump/haltを呼び出し元に伝播

**シグネチャ:**
```typescript
private executeIfBlock(statement: any): ExecutionResult
```

**処理内容:**
```typescript
// 条件が真の場合
if (condition !== 0) {
    for (const stmt of statement.thenBody || []) {
        const result = this.executeStatement(stmt);
        if (result.jump || result.halt) {
            return result;  // 伝播
        }
    }
} else {
    // 条件が偽の場合
    for (const stmt of statement.elseBody || []) {
        const result = this.executeStatement(stmt);
        if (result.jump || result.halt) {
            return result;  // 伝播
        }
    }
}
return { jump: false, halt: false };
```

**処理の意味:**
- then/elseブロック内のステートメントで発生したjump/haltを外側に伝える
- すべてのステートメントが正常に実行された場合は `{ jump: false, halt: false }` を返す

**呼び出し元:**
- `executeStatements()` メソッド（通常のステートメントとして）

---

## 処理の流れ（データフロー図）

```
┌─────────────────────────────────────────────────────────┐
│  execute* メソッド (ステートメント実行)                 │
│  - executeGoto() → { jump: true, halt: false }         │
│  - executeHalt() → { jump: false, halt: true }         │
│  - executeAssignment() → { jump: false, halt: false }  │
└──────────────────┬──────────────────────────────────────┘
                   │ ExecutionResult を返す
                   ▼
┌─────────────────────────────────────────────────────────┐
│  executeStatement() (ディスパッチャー)                  │
│  - statementExecutors.get(type)(statement)              │
└──────────────────┬──────────────────────────────────────┘
                   │ ExecutionResult を返す
                   ▼
┌─────────────────────────────────────────────────────────┐
│  executeStatements() (ステートメント列の実行)           │
│  - result.jump || result.halt → return result (伝播)   │
└──────────────────┬──────────────────────────────────────┘
                   │ ExecutionResult を返す
                   ▼
┌─────────────────────────────────────────────────────────┐
│  executeForBlockGenerator() / executeWhileBlockGenerator│
│  - result.jump || result.halt → return result (伝播)   │
└──────────────────┬──────────────────────────────────────┘
                   │ ExecutionResult を返す
                   ▼
┌─────────────────────────────────────────────────────────┐
│  executeStatements() (再帰呼び出し)                     │
│  - result.jump || result.halt → return result (伝播)   │
└──────────────────┬──────────────────────────────────────┘
                   │ ExecutionResult を返す
                   ▼
┌─────────────────────────────────────────────────────────┐
│  run() メソッド (メイン実行ループ)                     │
│  ★ 最終的な処理決定 ★                                 │
│  - result.halt → return (プログラム停止)              │
│  - result.jump → currentLineIndex++ をスキップ         │
│  - 通常 → currentLineIndex++ (次の行へ)                │
└─────────────────────────────────────────────────────────┘
```

## 重要なポイント

### 1. 伝播チェーン

ExecutionResultは以下のような伝播チェーンで処理されます：

```
ステートメント実行
  ↓ ExecutionResult
executeStatements()  → jump/halt なら即座に return
  ↓ ExecutionResult
executeForBlock/WhileBlock  → jump/halt なら即座に return
  ↓ ExecutionResult
executeStatements()  → jump/halt なら即座に return
  ↓ ExecutionResult
run()  → halt なら return、jump ならスキップ、通常なら次行へ
```

### 2. 最終的な処理決定は run() のみ

- **`run()` 以外のメソッド:** ExecutionResultを**伝播**するだけ（判断しない）
- **`run()` メソッド:** ExecutionResultを見て**実際の処理を決定**する
  - `halt` → プログラム停止
  - `jump` → 次の行に進まない（既にジャンプ済み）
  - 通常 → 次の行に進む

### 3. jump の場合の currentLineIndex 操作

- `executeGoto()` / `executeGosub()` / `executeReturn()` が `currentLineIndex` を**変更する**
- `run()` は `result.jump === true` の場合、`currentLineIndex++` を**スキップする**
- つまり、`jump: true` は「currentLineIndexは既に変更済みなので触るな」というフラグ

### 4. halt の場合の処理

- `executeHalt()` は `{ jump: false, halt: true }` を返すだけ
- 実際のプログラム停止（`return;`）は `run()` が行う
- すべての中間メソッドは `result.halt` を見つけたら即座に伝播

## まとめ

| メソッド | 役割 | jump/halt の処理 |
|---------|------|-----------------|
| `executeStatements()` | ステートメント列の実行 | 伝播（即座に return） |
| `executeForBlockGenerator()` | FORループの実行 | 伝播（即座に return） |
| `executeWhileBlockGenerator()` | WHILEループの実行 | 伝播（即座に return） |
| `executeIfBlock()` | IF文の実行 | 伝播（即座に return） |
| **`run()`** | **メイン実行ループ** | **最終処理決定** |

**結論:** ExecutionResultの`jump`/`halt`を受け取って**実際に処理を決定する**のは、WorkerInterpreterクラスの**`run()`メソッドのみ**です。
