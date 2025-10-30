# ExecutionResult構造体の役割と位置づけ

## 概要

`ExecutionResult`は、WorkerInterpreterにおいて**ステートメント実行の結果を表現する構造体**です。
個々のステートメント実行が、プログラムのコントロールフロー（制御の流れ）にどのような影響を与えたかを伝えるための情報を保持します。

## 定義

```typescript
/**
 * ステートメント実行結果を表すインターフェース。
 * ジャンプ、停止の情報を保持します。
 */
interface ExecutionResult {
    jump: boolean;         // GOTO/GOSUB/RETURNによるジャンプが発生したか
    halt: boolean;         // HaltStatementによるプログラム停止か
}
```

## 役割と責務

### 1. コントロールフローの通知

`ExecutionResult`は、ステートメント実行メソッド（`execute*`）が、実行結果として以下の情報を呼び出し元に返すために使用されます：

- **jump**: プログラムカウンタ（`currentLineIndex`）が変更されたか
- **halt**: プログラムを停止すべきか

### 2. 制御フローの伝播

ネストされた構造（FOR, WHILE, IFブロック）において、内部のステートメントで発生したジャンプや停止を外側のコンテキストに**伝播**させるために使用されます。

#### 伝播の例：FORループ内でのGOTO

```workerscript
@=I,1,10
    ;=I>5 #=^EXIT_LOOP
#=@

^EXIT_LOOP
    ?="Exited early" /
```

この場合の実行フロー：
1. `#=^EXIT_LOOP`（GOTO）が実行される → `executeGoto()` が `{ jump: true, halt: false }` を返す
2. `executeStatements()` がこの結果を受け取り、即座に呼び出し元に伝播 → `return result`
3. `executeForBlockGenerator()` が結果を受け取り、ループを中断して呼び出し元に伝播
4. `run()` メソッドの主ループが `result.jump === true` を検知し、`currentLineIndex` が既に変更されているため次の行に進まない

### 3. 制御フローの判定基準

実行ループ（`run()`メソッド）やブロック実行メソッド（`executeStatements()`など）は、`ExecutionResult`を使って以下を判定します：

```typescript
// 例1: executeStatements() での判定
const result = this.executeStatement(stmt);

if (result.jump || result.halt) {
    return result;  // 即座に伝播
}

// 例2: run() での判定
const result = yield* this.executeStatements(line.statements);

if (result.halt) {
    return;  // プログラム停止
}

if (!result.jump) {
    this.currentLineIndex++;  // ジャンプしてなければ次の行へ
}
```

## ExecutionResultを返すステートメント一覧

### jump: true を返すステートメント

これらのステートメントは、プログラムカウンタ（`currentLineIndex`）を変更します：

1. **GotoStatement** (`#=^LABEL`)
   ```typescript
   this.currentLineIndex = targetLine;
   return { jump: true, halt: false };
   ```

2. **GosubStatement** (`!=^LABEL`)
   ```typescript
   this.callStack.push(this.currentLineIndex + 1);
   this.currentLineIndex = targetLine;
   return { jump: true, halt: false };
   ```

3. **ReturnStatement** (`#=!`)
   ```typescript
   const returnLine = this.callStack.pop()!;
   this.currentLineIndex = returnLine;
   return { jump: true, halt: false };
   ```

### halt: true を返すステートメント

プログラムを停止させるステートメント：

1. **HaltStatement** (`#=-1`)
   ```typescript
   return { jump: false, halt: true };
   ```

### 通常のステートメント（jump: false, halt: false）

その他のすべてのステートメントは、制御フローに影響を与えません：

- AssignmentStatement (`A=10`)
- OutputStatement (`?="Hello"`)
- NewlineStatement (`/`)
- IfBlockStatement（ブロック内で発生したjump/haltは伝播）
- PokeStatement (`` ` =100``)
- IoPutStatement (`$=65`)
- ArrayAssignmentStatement (`[0]=10`)
- ArrayInitializationStatement (`[0]=1,2,3`)

## ExecutionResultとInterpreterStateの関係

### 現在の設計（ExecutionResultのみ）

```
┌─────────────────────┐
│  ステートメント実行  │
└──────────┬──────────┘
           │
           ▼
    ExecutionResult
    { jump, halt }
           │
           ▼
┌─────────────────────┐
│  呼び出し元が判定   │
│  - jump → PC変更済  │
│  - halt → 停止      │
└─────────────────────┘
```

**特徴：**
- ステートメント実行の**結果**を表現（過去形）
- 呼び出し元が結果を見て**次の動作を決定**
- 一時的な情報（戻り値として伝播）

### 追加予定のInterpreterState

```
┌─────────────────────┐
│ InterpreterState    │
│ (インスタンス変数)  │
└──────────┬──────────┘
           │
    Running / Halted / WaitingForNextFrame
           │
           ▼
┌─────────────────────┐
│  実行可能性の判定   │
│  canExecute()       │
└─────────────────────┘
```

**特徴：**
- インタプリタの**現在の状態**を表現（現在形）
- 外部（WorkerManager）から状態を**問い合わせ可能**
- 永続的な情報（インスタンス変数として保持）

## InterpreterState導入時の設計方針

### 1. ExecutionResultは維持する

`ExecutionResult`は**ステートメント実行の結果通知**として引き続き重要な役割を果たします。
なぜなら：

- ネストされたブロック構造での制御フロー伝播に必要
- jump/haltの即座の検出と対応が可能
- ジェネレーター関数の戻り値として適切

### 2. InterpreterStateは新規追加

`InterpreterState`は**インタプリタ全体の実行状態**を表現する新しい概念です：

```typescript
enum InterpreterState {
    Running = 'running',              // 通常実行中
    Halted = 'halted',                // プログラム停止（#=-1）
    WaitingForNextFrame = 'waiting'   // 次フレーム待機（#=`）
}
```

### 3. 役割分担

| 概念 | 用途 | スコープ | 持続性 |
|------|------|---------|--------|
| **ExecutionResult** | ステートメント実行結果の通知 | ステートメント実行 | 一時的（戻り値） |
| **InterpreterState** | インタプリタ全体の状態管理 | インタプリタ全体 | 永続的（インスタンス変数） |

### 4. 具体的な統合方法

#### パターン1: HaltStatementの場合

```typescript
// 現在の実装
private executeHalt(): ExecutionResult {
    return { jump: false, halt: true };
}

// 新しい実装
private executeHalt(): ExecutionResult {
    this.state = InterpreterState.Halted;  // 状態を更新
    return { jump: false, halt: true };    // ExecutionResultも返す
}
```

**理由：**
- `ExecutionResult.halt`は即座の停止通知（内部のブロックから外側への伝播用）
- `InterpreterState.Halted`は永続的な状態（外部からの問い合わせ用）

#### パターン2: WaitForNextFrameStatementの場合（新規）

```typescript
private executeWaitForNextFrame(statement: any): ExecutionResult {
    this.state = InterpreterState.WaitingForNextFrame;
    return { jump: false, halt: false };  // jump/haltではない特別な状態
}
```

**重要な違い：**
- `halt: true`と異なり、WaitingForNextFrameは**再開可能**
- `ExecutionResult`では表現しない（新しい状態だから）
- 代わりに`InterpreterState`で管理

#### パターン3: run()での状態チェック

```typescript
public *run(): Generator<void, void, void> {
    while (this.currentLineIndex < this.program.body.length) {
        // 状態チェック: 停止または待機中なら処理をスキップ
        if (this.state === InterpreterState.Halted) {
            break;
        }
        
        if (this.state === InterpreterState.WaitingForNextFrame) {
            yield;  // 制御を返すが、currentLineIndexは維持
            continue;
        }
        
        const line = this.program.body[this.currentLineIndex];
        const result = yield* this.executeStatements(line.statements);
        
        // ExecutionResultでも停止をチェック（内部伝播用）
        if (result.halt) {
            return;
        }
        
        // WaitingForNextFrameになった場合
        if (this.state === InterpreterState.WaitingForNextFrame) {
            yield;
            continue;
        }
        
        if (!result.jump) {
            this.currentLineIndex++;
        }
    }
}
```

## まとめ

### ExecutionResultの位置づけ

1. **ステートメント実行の結果を通知する構造体**
   - jump: プログラムカウンタが変更されたか
   - halt: プログラムを停止すべきか

2. **制御フロー伝播のメカニズム**
   - ネストされたブロック構造で内部から外部へ結果を伝播
   - ジェネレーター関数の戻り値として機能

3. **一時的な情報**
   - メソッドの戻り値として使用
   - インスタンス変数としては保持されない

### InterpreterStateとの関係

- **ExecutionResult**: 「何が起きたか」（過去形、一時的）
- **InterpreterState**: 「今どんな状態か」（現在形、永続的）

### 設計指針

1. ✅ **ExecutionResultは維持する**
   - 既存の制御フロー伝播メカニズムとして重要
   - jump/haltの即座の検出に必要

2. ✅ **InterpreterStateを追加する**
   - インタプリタ全体の状態管理用
   - 外部（WorkerManager）からの問い合わせ用
   - WaitingForNextFrameなど新しい状態の表現用

3. ✅ **両者は補完的な関係**
   - ExecutionResult: 内部での制御フロー管理
   - InterpreterState: 外部インターフェースと全体状態管理

4. ✅ **一貫性のある状態管理**
   - `halt: true` → `InterpreterState.Halted` への移行時に両方を設定
   - 状態の同期を確実に保つ
