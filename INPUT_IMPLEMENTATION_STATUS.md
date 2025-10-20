# 入力機能の実装状況と仕様分析

**作成日**: 2025年10月21日  
**対象**: `A=$`（1文字入力）と`A=?`（数値入力）の実装状況

---

## ユーザーの意図する仕様

### `A=$` (1文字入力)
- **ノンブロッキング**: 入力がなければ即座に0を返して実行継続
- **挙動**: キューに値があれば取得、なければ0

### `A=?` (数値入力)
- **ブロッキング**: 入力があるまで**そのワーカーは待機**
- **マルチワーカー**: 他のワーカーは実行継続
- **挙動**: 入力があるまでそのステートメントで停止

---

## 現在の実装状況

### 1. インタプリタ (workerInterpreter.ts)

#### `A=$` - evaluateIoGetExpression()
```typescript
private evaluateIoGetExpression(): number {
    if (this.getFn) {
        const value = this.getFn();
        return Math.max(0, Math.min(255, Math.floor(value)));
    } else {
        throw new Error('1byte入力機能が設定されていません');
    }
}
```
**状態**: ✅ **仕様通り**
- `getFn()`は即座に値を返す（0 or キーコード）
- エラーなし、ブロックなし

#### `A=?` - evaluateInputNumberExpression()
```typescript
private evaluateInputNumberExpression(): number {
    if (this.getLineFn) {
        const line = this.getLineFn();
        const value = parseInt(line.trim(), 10);
        if (isNaN(value)) {
            return 0;
        }
        return (value << 16) >> 16;
    } else {
        throw new Error('行入力機能が設定されていません');
    }
}
```
**状態**: ⚠️ **問題あり**
- `getLineFn()`が空文字列を返す場合、即座に`0`を返す
- **ブロックしない** - 仕様と不一致

**問題**: 入力待ちの概念がない

---

### 2. Web環境 (index.ts)

#### `A=$` - getKeyInput()
```typescript
function getKeyInput(): number {
    if (keyQueue.length > 0) {
        const key = keyQueue.shift()!;
        updateKeyboardStatus();
        return key;
    }
    return 0; // 何も押されていない場合
}
```
**状態**: ✅ **仕様通り（ノンブロッキング）**
- キューに値があれば取得
- なければ即座に0を返す

#### `A=?` - getLineFn
**状態**: ❌ **未実装**
- `getLineFn`がWorkWerInterpreterに渡されていない
- 現在`A=?`を実行すると例外がスローされる

---

### 3. CLI環境 (cliRunner.ts)

#### `A=$` - get1Byte()
```typescript
private get1Byte(): number {
    const demoValue = 42; // デモ用固定値
    if (this.config.debug) {
        console.log(`[DEBUG] 1byte入力: ${demoValue}`);
    }
    return demoValue;
}
```
**状態**: ⚠️ **デモ実装（固定値）**
- 常に42を返す
- ノンブロッキング（仕様通り）だが、実用性なし

**改善案**: 
```typescript
// ノンブロッキングで標準入力から読み取る（可能なら）
private get1Byte(): number {
    // process.stdin からノンブロッキング読み取り
    // 実装は複雑だが可能
    return 0; // デフォルト
}
```

#### `A=?` - getLineFn
**状態**: ❌ **未実装**
- `getLineFn`がWorkWerInterpreterに渡されていない

---

## 問題点のまとめ

### 🔴 Critical: `A=?`のブロッキング実装

**現在の問題**:
```typescript
// evaluateInputNumberExpression()
const line = this.getLineFn();  // ← ここで空文字列が返る可能性
if (isNaN(value)) {
    return 0;  // ← 即座に0を返して実行継続してしまう
}
```

**期待される動作**:
```typescript
const line = this.getLineFn();
if (line === '') {
    // 入力待ち状態を示す特別な処理
    // → ワーカーを停止させる
}
```

---

## 修正が必要な箇所

### 1. インタプリタ (workerInterpreter.ts)

#### 方針A: 例外ベース（推奨） ⭐⭐⭐⭐⭐

```typescript
// 新しいエラークラス
class InputWaitingError extends Error {
    constructor() {
        super('Waiting for user input');
        this.name = 'InputWaitingError';
    }
}

// evaluateInputNumberExpression（修正版）
private evaluateInputNumberExpression(): number {
    if (this.getLineFn) {
        const line = this.getLineFn();
        
        // 空文字列 = 入力待ち
        if (line === '') {
            throw new InputWaitingError();
        }
        
        const value = parseInt(line.trim(), 10);
        if (isNaN(value)) {
            return 0;
        }
        return (value << 16) >> 16;
    } else {
        throw new Error('行入力機能が設定されていません');
    }
}
```

**利点**:
- ✅ 明示的な制御フロー
- ✅ 既存のエラーハンドリングと統一
- ✅ Generator実行を中断できる

#### 方針B: 戻り値ベース

```typescript
// getLineFnの戻り値を拡張
type InputResult = string | { waiting: true };

private evaluateInputNumberExpression(): number {
    const result = this.getLineFn();
    if (typeof result === 'object' && result.waiting) {
        // 入力待ち処理
        // → でもGeneratorを停止する方法がない
    }
    // ...
}
```

**問題**: Generator実行を中断できない

---

### 2. Web環境 (index.ts)

#### 必要な実装

```typescript
// Workerインターフェース拡張
interface Worker {
    id: number;
    interpreter: WorkerInterpreter | null;
    generator: Generator<void, void, unknown> | null;
    status: 'stopped' | 'running' | 'paused' | 'waiting-input'; // 追加
    stepCount: number;
    inputBuffer: string[];  // 追加: 入力バッファ
}

// getLineFn実装
function getLineInput(workerId: number): string {
    const worker = workers.get(workerId);
    if (!worker || worker.inputBuffer.length === 0) {
        return '';  // 空 = 入力待ち
    }
    return worker.inputBuffer.shift()!;
}

// WorkerInterpreter生成時
worker.interpreter = new WorkerInterpreter({
    gridData: gridData,
    peekFn: peek,
    pokeFn: poke,
    logFn: (...args) => logWorkerOutput(workerId, ...args),
    getFn: getKeyInput,
    putFn: (value: number) => putOutput(workerId, value),
    getLineFn: () => getLineInput(workerId),  // 追加
});

// 実行ループ（修正版）
function executeWorkerStep(workerId: number) {
    const worker = workers.get(workerId);
    if (!worker || !worker.generator || worker.status !== 'running') return;
    
    try {
        const result = worker.generator.next();
        if (result.done) {
            worker.status = 'stopped';
            updateWorkerStatus(workerId);
        }
    } catch (error) {
        if (error instanceof InputWaitingError) {
            // 入力待ち状態
            worker.status = 'waiting-input';
            updateWorkerStatus(workerId);
            logSystem(`Worker ${workerId} is waiting for input...`);
            // Generatorは進まない → 次のフレームで同じステートメントを再実行
        } else {
            // 通常のエラー
            worker.status = 'stopped';
            updateWorkerStatus(workerId);
            logSystem(`Worker ${workerId} error: ${error.message}`);
        }
    }
}

// 入力フィールドのEnterイベント
inputField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const worker = workers.get(workerId);
        if (worker) {
            worker.inputBuffer.push(inputField.value);
            inputField.value = '';
            
            // 入力待ちだったワーカーを再開
            if (worker.status === 'waiting-input') {
                worker.status = 'running';
                updateWorkerStatus(workerId);
            }
        }
    }
});
```

---

### 3. CLI環境 (cliRunner.ts)

#### `A=$`の改善（ノンブロッキング標準入力）

```typescript
// ノンブロッキング標準入力の実装（難しい）
private inputQueue: number[] = [];

constructor(config: CLIRunnerConfig) {
    // ...
    this.setupNonBlockingInput();
}

private setupNonBlockingInput() {
    // Node.jsでノンブロッキング標準入力は困難
    // 代替案: 事前入力ファイルを使う
}

private get1Byte(): number {
    if (this.inputQueue.length > 0) {
        return this.inputQueue.shift()!;
    }
    return 0;  // ノンブロッキング
}
```

#### `A=?`の実装（ブロッキング標準入力）

```typescript
// readline-syncライブラリを使用（同期的）
import * as readlineSync from 'readline-sync';

private getLine(): string {
    // ブロッキング入力
    const line = readlineSync.question('> ');
    return line;
}

// WorkerInterpreter生成時
const interpreter = new WorkerInterpreter({
    // ...
    getLineFn: () => this.getLine(),  // 追加
});
```

**問題**: Node.jsでは同期的な標準入力はプロセス全体をブロックする
- **解決策**: CLIでは`A=?`を使うスクリプトは実用的でない旨を警告

---

## 実装優先順位

### Phase 1: インタプリタ修正（必須） ⭐⭐⭐⭐⭐
- [ ] `InputWaitingError`クラス追加
- [ ] `evaluateInputNumberExpression()`修正
- [ ] テスト追加（モック）

### Phase 2: Web環境実装（必須） ⭐⭐⭐⭐⭐
- [ ] Workerインターフェース拡張（`inputBuffer`, `waiting-input`）
- [ ] `getLineInput()`実装
- [ ] 入力フィールドUI追加
- [ ] `executeWorkerStep()`修正（InputWaitingError処理）
- [ ] 入力イベントハンドラ

### Phase 3: CLI環境実装（オプション） ⭐⭐
- [ ] `getLine()`実装（readline-sync使用）
- [ ] 注意書き追加（`A=?`はインタラクティブモードでのみ推奨）

---

## 実装見積もり

### Phase 1: インタプリタ修正
- **時間**: 30分
- **ファイル**: `src/workerInterpreter.ts`, `src/__tests__/workerInterpreter.test.ts`

### Phase 2: Web環境実装
- **時間**: 2-3時間
- **ファイル**: `src/index.ts`, `index.html`

### Phase 3: CLI環境実装
- **時間**: 1時間
- **ファイル**: `src/cliRunner.ts`, `package.json`（readline-sync追加）

**合計**: 約4-5時間

---

## 結論

### 現在の実装状態

| 機能 | Web環境 | CLI環境 | インタプリタ | 仕様適合 |
|------|---------|---------|-------------|---------|
| **`A=$`（ノンブロッキング）** | ✅ 実装済み | ⚠️ 固定値 | ✅ 正常 | ✅ 適合 |
| **`A=?`（ブロッキング）** | ❌ 未実装 | ❌ 未実装 | ⚠️ ブロックしない | ❌ **不適合** |

### 最大の問題

**`evaluateInputNumberExpression()`が入力待ちをサポートしていない**

```typescript
// 現在: 空文字列でも0を返して実行継続
const line = this.getLineFn();
const value = parseInt(line.trim(), 10);
return isNaN(value) ? 0 : ...;  // ← 問題

// あるべき姿: 空文字列で例外をスロー
const line = this.getLineFn();
if (line === '') {
    throw new InputWaitingError();  // ← ワーカーを停止
}
```

### 推奨対応

1. **Phase 1実装**（必須）: インタプリタ修正
2. **Phase 2実装**（必須）: Web環境実装
3. **Phase 3実装**（オプション）: CLI環境は後回し

---

## 次のアクション

1. `InputWaitingError`クラスを追加
2. `evaluateInputNumberExpression()`を修正
3. テストを追加
4. Web環境の実装に進む
