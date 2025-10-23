# HTMLインプットフォーム方式による入力実装

**作成日**: 2025年1月
**提案**: 各ワーカーカードにHTMLインプットフォームを配置し、`A=?`による数値入力を実装する

---

## 概要

現在のキーボード入力は`keyQueue`を使ったグローバルなキュー方式で、`A=$`（1文字入力）にのみ対応しています。
`A=?`（数値入力）については、HTMLのインプットフォームを使った方式を採用することで、以下のメリットが得られます：

- ✅ ワーカーごとに独立した入力バッファ
- ✅ 視覚的にわかりやすいUI（入力待ちが明確）
- ✅ 複数桁の数値入力が自然に実現できる
- ✅ モバイル環境でも使いやすい（ソフトウェアキーボードが自動で表示される）

---

## 現在の実装状況

### 既存コード（index.ts）

```typescript
// --- Worker Management ---
interface Worker {
    id: number;
    interpreter: WorkerInterpreter | null;
    generator: Generator<void, void, unknown> | null;
    status: 'stopped' | 'running' | 'paused';
    stepCount: number;
}

// --- Keyboard Input State ---
const keyQueue: number[] = []; // グローバルなキーキュー（A=$用）
let keyboardInputEnabled = false;

// getFn: キー入力を取得する関数（A=$用）
function getKeyInput(): number {
    if (keyQueue.length > 0) {
        const key = keyQueue.shift()!;
        updateKeyboardStatus();
        return key;
    }
    return 0; // バッファが空なら0
}

// WorkerInterpreter初期化時（startWorker関数内）
worker.interpreter = new WorkerInterpreter({
    gridData: gridData,
    peekFn: peek,
    pokeFn: (x, y, value) => poke(x, y, value),
    logFn: (...args) => logWorkerOutput(workerId, ...args),
    getFn: getKeyInput,  // A=$用
    putFn: (value: number) => putOutput(workerId, value),
    // getLineFn: 未実装
});
```

### WorkerInterpreter側の実装（workerInterpreter.ts）

```typescript
private getLineFn: (() => string) | undefined; // 行入力関数（文字列を返す、A=?用）

private evaluateInputNumberExpression(): number {
    // C言語の fgets() + atoi() 相当
    if (this.getLineFn) {
        const line = this.getLineFn();
        const value = parseInt(line.trim(), 10);
        if (isNaN(value)) {
            return 0;
        }
        // 16ビット符号あり整数にラップアラウンド
        return (value << 16) >> 16;
    } else {
        throw new Error('行入力機能が設定されていません');
    }
}
```

**現在の問題点**:
- `getLineFn`が設定されていないため、`A=?`を実行するとエラーになる
- 行入力をどう実装するかが未定

---

## 提案: HTMLインプットフォーム方式

### アーキテクチャ

```
+----------------------------------+
|  Worker Card #1                  |
|  +----------------------------+  |
|  | Script Editor              |  |
|  +----------------------------+  |
|  | [Start] [Pause] [Stop]     |  |
|  +----------------------------+  |
|  | Status: Running...         |  |
|  +----------------------------+  |
|  | Input: [________] [Enter]  |  | ← 新規追加
|  +----------------------------+  |
+----------------------------------+
```

### ワーカーごとの入力バッファ

```typescript
interface Worker {
    id: number;
    interpreter: WorkerInterpreter | null;
    generator: Generator<void, void, unknown> | null;
    status: 'stopped' | 'running' | 'paused' | 'waiting-input';  // ← 'waiting-input'を追加
    stepCount: number;
    inputBuffer: string | null;  // ← 新規追加：入力バッファ
}
```

### 動作フロー

#### 1. 通常の実行フロー

```workerscript
?="Enter a number: "
A=?  // ← ここで入力待ち
?="You entered: " ?=A /
```

**実行手順**:

1. `?="Enter a number: "`が実行される → トランスクリプトに表示
2. `A=?`が実行される
   - `getLineFn(workerId)`が呼ばれる
   - `worker.inputBuffer`が`null`（未入力）の場合
     - ワーカーのステータスを`'waiting-input'`に変更
     - インプットフォームを有効化（フォーカスを当てる）
     - `null`を返す（または特殊な値）
3. インタプリタは入力待ちと判断し、yieldで一時停止
4. ユーザーが数値を入力してEnterを押す
5. `worker.inputBuffer`に入力値が設定される
6. ワーカーのステータスを`'running'`に戻す
7. 次のフレームで`A=?`が再評価される
   - `worker.inputBuffer`に値があるので、その値を返す
   - `worker.inputBuffer`を`null`にクリア
8. 実行が継続される

#### 2. HTML構造の追加

```html
<!-- Worker Card -->
<div class="worker-card" data-worker-id="1">
    <div class="worker-header">
        <span class="worker-title">Worker #1</span>
        <button class="worker-remove">×</button>
    </div>
    <textarea class="worker-script">...</textarea>
    <div class="worker-controls">
        <button class="btn-start">Start</button>
        <button class="btn-pause">Pause</button>
        <button class="btn-stop">Stop</button>
    </div>
    <div class="worker-status">Status: Stopped</div>
    
    <!-- 新規追加: 入力フォーム -->
    <div class="worker-input-section" style="display: none;">
        <label class="worker-input-label">Input:</label>
        <input type="text" class="worker-input-field" placeholder="Enter number...">
        <button class="worker-input-submit">Enter</button>
    </div>
</div>
```

#### 3. スタイル追加

```css
/* 入力フォームセクション */
.worker-input-section {
    margin-top: 10px;
    padding: 10px;
    background-color: #fff3cd;
    border: 2px solid #ffc107;
    border-radius: 4px;
    display: flex;
    align-items: center;
    gap: 8px;
}

.worker-input-label {
    font-size: 14px;
    font-weight: bold;
    color: #856404;
}

.worker-input-field {
    flex: 1;
    padding: 6px 10px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 14px;
    font-family: 'Courier New', monospace;
}

.worker-input-field:focus {
    outline: none;
    border-color: #ffc107;
    box-shadow: 0 0 0 3px rgba(255, 193, 7, 0.2);
}

.worker-input-submit {
    padding: 6px 16px;
    background-color: #ffc107;
    color: #000;
    border: none;
    border-radius: 4px;
    font-size: 14px;
    font-weight: bold;
    cursor: pointer;
}

.worker-input-submit:hover {
    background-color: #e0a800;
}

.worker-input-section.active {
    animation: pulse 0.5s ease-in-out;
}

@keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.02); }
}
```

---

## 実装詳細

### Phase 1: 基本構造の追加（1-2時間）

#### 1-1. Worker構造の拡張

```typescript
// src/index.ts
interface Worker {
    id: number;
    interpreter: WorkerInterpreter | null;
    generator: Generator<void, void, unknown> | null;
    status: 'stopped' | 'running' | 'paused' | 'waiting-input';  // ← 追加
    stepCount: number;
    inputBuffer: string | null;  // ← 新規追加
}

// createWorker()を修正
function createWorker(): number {
    const workerId = nextWorkerId++;
    const worker: Worker = {
        id: workerId,
        interpreter: null,
        generator: null,
        status: 'stopped',
        stepCount: 0,
        inputBuffer: null,  // ← 初期化
    };
    workers.set(workerId, worker);
    
    // UI作成時に入力フォームも追加
    renderWorkerCard(workerId);
    return workerId;
}
```

#### 1-2. HTMLの動的生成

```typescript
// src/index.ts
function renderWorkerCard(workerId: number) {
    const card = document.createElement('div');
    card.className = 'worker-card';
    card.dataset.workerId = String(workerId);
    
    card.innerHTML = `
        <div class="worker-header">
            <span class="worker-title">Worker #${workerId}</span>
            <button class="worker-remove" data-worker-id="${workerId}">×</button>
        </div>
        <textarea class="worker-script" 
                  data-worker-id="${workerId}"
                  placeholder="Enter WorkerScript here..."
                  spellcheck="false"></textarea>
        <div class="worker-controls">
            <button class="btn-start worker-btn" data-worker-id="${workerId}">Start</button>
            <button class="btn-pause worker-btn" data-worker-id="${workerId}">Pause</button>
            <button class="btn-stop worker-btn" data-worker-id="${workerId}">Stop</button>
        </div>
        <div class="worker-status" data-worker-id="${workerId}">Status: Stopped</div>
        
        <!-- 入力フォームセクション（初期は非表示） -->
        <div class="worker-input-section" data-worker-id="${workerId}" style="display: none;">
            <label class="worker-input-label">Input:</label>
            <input type="text" 
                   class="worker-input-field" 
                   data-worker-id="${workerId}"
                   placeholder="Enter number...">
            <button class="worker-input-submit" data-worker-id="${workerId}">Enter</button>
        </div>
    `;
    
    workersContainer.appendChild(card);
    
    // イベントリスナーの設定
    setupWorkerCardListeners(workerId);
}
```

#### 1-3. イベントリスナーの設定

```typescript
// src/index.ts
function setupWorkerCardListeners(workerId: number) {
    // 既存のボタンリスナー...
    
    // 入力フォームのリスナー
    const inputField = document.querySelector(
        `.worker-input-field[data-worker-id="${workerId}"]`
    ) as HTMLInputElement;
    const submitButton = document.querySelector(
        `.worker-input-submit[data-worker-id="${workerId}"]`
    ) as HTMLButtonElement;
    
    // Enterキーで送信
    inputField?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            submitInput(workerId);
        }
    });
    
    // ボタンクリックで送信
    submitButton?.addEventListener('click', () => {
        submitInput(workerId);
    });
}

// 入力を送信する関数
function submitInput(workerId: number) {
    const worker = workers.get(workerId);
    if (!worker || worker.status !== 'waiting-input') {
        return;
    }
    
    const inputField = document.querySelector(
        `.worker-input-field[data-worker-id="${workerId}"]`
    ) as HTMLInputElement;
    
    if (!inputField) return;
    
    // 入力値を取得してバッファに設定
    const inputValue = inputField.value;
    worker.inputBuffer = inputValue;
    
    // 入力フィールドをクリア
    inputField.value = '';
    
    // 入力フォームを非表示
    hideInputForm(workerId);
    
    // ワーカーを再開
    worker.status = 'running';
    updateWorkerStatus(workerId);
    
    logSystem(`Worker ${workerId} received input: "${inputValue}"`);
}
```

#### 1-4. 入力フォームの表示/非表示

```typescript
// src/index.ts
function showInputForm(workerId: number) {
    const inputSection = document.querySelector(
        `.worker-input-section[data-worker-id="${workerId}"]`
    ) as HTMLDivElement;
    
    if (inputSection) {
        inputSection.style.display = 'flex';
        inputSection.classList.add('active');
        
        // 入力フィールドにフォーカス
        const inputField = inputSection.querySelector('.worker-input-field') as HTMLInputElement;
        inputField?.focus();
    }
}

function hideInputForm(workerId: number) {
    const inputSection = document.querySelector(
        `.worker-input-section[data-worker-id="${workerId}"]`
    ) as HTMLDivElement;
    
    if (inputSection) {
        inputSection.style.display = 'none';
        inputSection.classList.remove('active');
    }
}
```

#### 1-5. getLineFn の実装

```typescript
// src/index.ts
function getLineInput(workerId: number): string | null {
    const worker = workers.get(workerId);
    if (!worker) {
        return null;
    }
    
    // inputBufferに値がある場合はそれを返す
    if (worker.inputBuffer !== null) {
        const value = worker.inputBuffer;
        worker.inputBuffer = null; // バッファをクリア
        return value;
    }
    
    // inputBufferが空の場合は入力待ち
    // この場合、インタプリタ側で適切に処理する必要がある
    return null;
}
```

#### 1-6. WorkerInterpreterの初期化を修正

```typescript
// src/index.ts（startWorker関数内）
worker.interpreter = new WorkerInterpreter({
    gridData: gridData,
    peekFn: peek,
    pokeFn: (x, y, value) => poke(x, y, value),
    logFn: (...args) => logWorkerOutput(workerId, ...args),
    getFn: getKeyInput,
    putFn: (value: number) => putOutput(workerId, value),
    getLineFn: () => getLineInput(workerId),  // ← 追加
});
```

---

### Phase 2: 入力待ち状態の実装（2-3時間）

#### 2-1. evaluateInputNumberExpression の修正（選択肢A: ノンブロッキング）

```typescript
// src/workerInterpreter.ts
private evaluateInputNumberExpression(): number {
    if (this.getLineFn) {
        const line = this.getLineFn();
        
        // 入力がない場合は0を返す（ノンブロッキング）
        if (line === null || line === '') {
            return 0;
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

**使用例（ノンブロッキング）**:
```workerscript
?="Enter a number: "
^WAIT
A=?
IF A=0 CONT  // 入力がなければ次のフレームで再試行
?="You entered: " ?=A /
```

#### 2-2. evaluateInputNumberExpression の修正（選択肢B: ブロッキング）

より自然なユーザー体験のため、入力待ちで自動的に停止する方式を実装できます。

```typescript
// src/workerInterpreter.ts

// カスタムエラークラス
class InputWaitingError extends Error {
    constructor(message: string = 'Waiting for input') {
        super(message);
        this.name = 'InputWaitingError';
    }
}

private evaluateInputNumberExpression(): number {
    if (this.getLineFn) {
        const line = this.getLineFn();
        
        // 入力がない場合は入力待ちエラーをスロー
        if (line === null || line === '') {
            throw new InputWaitingError('Waiting for number input');
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

**executeWorkerStep の修正**:

```typescript
// src/index.ts
function executeWorkerStep(workerId: number) {
    const worker = workers.get(workerId);
    if (!worker || !worker.generator || worker.status !== 'running') {
        return;
    }
    
    try {
        const result = worker.generator.next();
        worker.stepCount++;
        
        if (result.done) {
            worker.status = 'stopped';
            updateWorkerStatus(workerId);
            logSystem(`Worker ${workerId} completed.`);
        }
    } catch (error) {
        // InputWaitingErrorの場合は入力待ち状態に
        if (error instanceof Error && error.name === 'InputWaitingError') {
            worker.status = 'waiting-input';
            updateWorkerStatus(workerId);
            showInputForm(workerId);
            logSystem(`Worker ${workerId} waiting for input...`);
            return;
        }
        
        // その他のエラーは従来通り処理
        worker.status = 'stopped';
        updateWorkerStatus(workerId);
        if (error instanceof Error) {
            logSystem(`Worker ${workerId} error: ${error.message}`);
        }
    }
}
```

**使用例（ブロッキング）**:
```workerscript
?="Enter a number: "
A=?  // Enterが押されるまで自動的に待機
?="You entered: " ?=A /
```

#### 2-3. ステータス表示の更新

```typescript
// src/index.ts
function updateWorkerStatus(workerId: number) {
    const worker = workers.get(workerId);
    if (!worker) return;
    
    const statusDiv = document.querySelector(
        `.worker-status[data-worker-id="${workerId}"]`
    ) as HTMLDivElement;
    
    if (!statusDiv) return;
    
    let statusText = '';
    let statusClass = '';
    
    switch (worker.status) {
        case 'running':
            statusText = `Running (${worker.stepCount} steps)`;
            statusClass = 'status-running';
            break;
        case 'paused':
            statusText = `Paused (${worker.stepCount} steps)`;
            statusClass = 'status-paused';
            break;
        case 'waiting-input':  // ← 追加
            statusText = `⏸ Waiting for input... (${worker.stepCount} steps)`;
            statusClass = 'status-waiting';
            break;
        case 'stopped':
        default:
            statusText = 'Stopped';
            statusClass = 'status-stopped';
            break;
    }
    
    statusDiv.textContent = `Status: ${statusText}`;
    statusDiv.className = `worker-status ${statusClass}`;
}
```

#### 2-4. CSSの追加

```css
/* index.html内のスタイルに追加 */
.status-waiting { 
    color: #FFC107; 
    font-weight: bold;
    animation: blink 1s ease-in-out infinite;
}

@keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
}
```

---

## テストシナリオ

### シナリオ1: 基本的な数値入力

```workerscript
?="Enter your age: "
A=?
?="Your age is: " ?=A /
```

**期待動作**:
1. "Enter your age: " がトランスクリプトに表示される
2. インプットフォームが表示される
3. ユーザーが "25" と入力してEnterを押す
4. "Your age is: 25" がトランスクリプトに表示される

### シナリオ2: 複数回の入力

```workerscript
?="Enter first number: "
A=?
B=A
?="Enter second number: "
A=?
C=A+B
?="Sum: " ?=C /
```

**期待動作**:
1. 最初の入力を待つ → ユーザーが "10" を入力
2. 2番目の入力を待つ → ユーザーが "20" を入力
3. "Sum: 30" が表示される

### シナリオ3: ループ内での入力

```workerscript
FOR I=1 TO 3
    ?="Enter number " ?=I ?=": "
    A=?
    ?="You entered: " ?=A /
NEXT
```

**期待動作**:
1. 3回入力フォームが表示される
2. それぞれの入力がエコーバックされる

### シナリオ4: 無効な入力

```workerscript
?="Enter a number: "
A=?
IF A=0 ?="Invalid input!" /
```

**期待動作**:
1. ユーザーが "abc" と入力
2. parseInt()が失敗してNaNになり、0に変換される
3. "Invalid input!" が表示される

---

## 実装の利点

### ✅ ワーカーごとに独立した入力
- 各ワーカーが独自の入力バッファを持つ
- 複数ワーカーが同時に入力待ちしても混乱しない

### ✅ 視覚的にわかりやすい
- 入力待ち状態が明確（黄色いフォームが表示される）
- ステータス表示で "Waiting for input..." と表示

### ✅ 自然な動作
- ブロッキング版では、VTL2オリジナル仕様に忠実
- ノンブロッキング版でも、明示的なポーリングで実装可能

### ✅ モバイル対応
- タッチデバイスでソフトウェアキーボードが自動表示
- タップで簡単に入力できる

---

## 既存機能との共存

### A=$ (1文字入力) との区別

- **A=$**: グローバルな`keyQueue`から取得（既存の実装を維持）
- **A=?**: ワーカーごとの`inputBuffer`から取得（新規実装）

この2つは完全に独立しており、互いに干渉しません。

### グローバルキーボード入力状態

既存の`keyboardStatus`表示は`A=$`用として維持します。
`A=?`の入力待ち状態は、各ワーカーカード内のインプットフォームで視覚化されます。

---

## 推奨実装順序

### ステップ1: HTML構造とスタイル（30分）
- ワーカーカードにインプットフォームを追加
- CSSスタイルを追加

### ステップ2: 基本的なイベント処理（1時間）
- Worker構造に`inputBuffer`を追加
- `submitInput()`関数の実装
- `showInputForm()`/`hideInputForm()`の実装

### ステップ3: getLineFn の実装（30分）
- `getLineInput()`関数の実装
- WorkerInterpreterの初期化時に`getLineFn`を設定

### ステップ4: 入力待ち状態の実装（1時間）
- **選択肢A（シンプル）**: ノンブロッキング版（nullを返す）
- **選択肢B（推奨）**: ブロッキング版（InputWaitingErrorをスロー）

### ステップ5: テストとデバッグ（1時間）
- 各テストシナリオを実行
- エッジケースの確認

---

## 推奨方針: 選択肢Bのブロッキング版

**理由**:
1. VTL2オリジナル仕様に忠実
2. ユーザーがループを書く必要がない（より直感的）
3. 実装の複雑さはそれほど高くない（InputWaitingErrorの追加のみ）
4. HTMLフォームとの相性が良い（入力待ち状態が明確）

**実装のポイント**:
- `evaluateInputNumberExpression()`で`line === null`の場合に`InputWaitingError`をスロー
- `executeWorkerStep()`でInputWaitingErrorをキャッチして入力待ち状態に遷移
- `submitInput()`で入力が完了したら`status: 'running'`に戻して実行を再開

---

## まとめ

HTMLインプットフォーム方式は、web環境に最適な入力方法です。
視覚的にわかりやすく、モバイル対応も容易で、ワーカーごとに独立した入力バッファを持つことができます。

実装の複雑さも適度で、既存のコードとの共存も問題ありません。

Phase 1から始めて段階的に実装することで、リスクを抑えながら確実に機能を追加できます。
