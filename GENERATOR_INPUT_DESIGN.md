# Generator環境での入力待ち実装設計

**作成日**: 2025年10月21日  
**対象**: WorkerScriptのGenerator実行モデルにおける入力待ち機能の実装

---

## 問題の本質

### 現在のGenerator実行モデル

```typescript
// WorkerInterpreter.run()
*run(): Generator<void, void, unknown> {
    while (this.currentLineIndex < this.program.lines.length) {
        const line = this.program.lines[this.currentLineIndex];
        
        for (const statement of line.statements) {
            const result = this.executeStatement(statement);
            // ...
            yield; // ← 各ステートメント後にyield
        }
        
        this.currentLineIndex++;
    }
}

// 呼び出し側（Web/CLI）
const generator = interpreter.run();
while (!generator.next().done) {
    // 各yieldポイントで制御が戻る
}
```

**特徴**:
- ✅ 1ステートメントごとにyield
- ✅ 外部から実行速度を制御可能
- ✅ マルチワーカーの協調動作

### 入力待ちの課題

```workerscript
?="Enter a number: "
A=?              // ← ここで入力待ち
?="You entered: " ?=A /
```

**求められる動作**:
1. `A=?`実行時、入力バッファが空なら**停止**
2. ユーザーが入力するまで**同じステートメントで待機**
3. 入力があったら**同じステートメントを再実行**して値を取得
4. 次のステートメントに進む

**問題**: Generatorは一度yieldしたら**次のyieldポイントまで進む**
- 同じyieldポイントに留まる仕組みがない
- ステートメントを「再実行」する概念がない

---

## Generator環境での入力待ち実現の条件

### 条件1: 同じステートメントを繰り返し実行できる

**アプローチA**: 例外を使ったフロー制御 ⭐⭐⭐⭐⭐
```typescript
// executeStatement()内
try {
    const result = this.evaluateExpression(statement.value);
} catch (error) {
    if (error instanceof InputWaitingError) {
        // ステートメント実行を中断
        // currentLineIndexとstatement位置を進めない
        yield; // この位置でyield
        // 次のnext()で同じステートメントを再実行
        continue; // ループの最初に戻る
    }
    throw error;
}

// 評価関数
private evaluateInputNumberExpression(): number {
    const line = this.getLineFn();
    if (line === '') {
        throw new InputWaitingError(); // 入力待ち
    }
    return parseInt(line.trim(), 10);
}
```

**利点**:
- ✅ 例外でフローを制御
- ✅ ステートメントを進めずにyield可能
- ✅ 次のnext()で自動的に再実行

**欠点**:
- ⚠️ 例外を制御フローに使う（一般的には非推奨だが、このケースでは合理的）

### 条件2: 外部から入力待ち状態を検出できる

**必要な情報**:
- どのワーカーが入力待ちか
- どのステートメントで待機中か
- いつ再開すべきか

**アプローチ**: Generatorの戻り値を拡張
```typescript
// 拡張された戻り値型
interface YieldValue {
    type: 'normal' | 'waiting-input';
    workerId?: number;
    message?: string;
}

// run()の型定義
*run(): Generator<YieldValue, void, unknown> {
    // ...
    if (inputWaiting) {
        yield { type: 'waiting-input', message: 'Waiting for input...' };
    } else {
        yield { type: 'normal' };
    }
}

// 呼び出し側
const result = generator.next();
if (!result.done && result.value.type === 'waiting-input') {
    worker.status = 'waiting-input';
}
```

**利点**:
- ✅ 明示的な状態管理
- ✅ デバッグしやすい
- ✅ 型安全

**欠点**:
- ⚠️ 既存のコードを大幅に変更

### 条件3: 入力が来たら即座に再開できる

**シンプルな方法**:
```typescript
// Web環境
inputField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        worker.inputBuffer.push(inputField.value);
        
        // 入力待ちワーカーを即座に再開
        if (worker.status === 'waiting-input') {
            worker.status = 'running';
            executeOneStep(worker); // すぐに1ステップ実行
        }
    }
});
```

---

## 実装案の比較

### 案1: 例外ベース（シンプル） ⭐⭐⭐⭐⭐

**概要**: `InputWaitingError`で制御、ステートメント位置を進めない

```typescript
// WorkerInterpreter.ts
class InputWaitingError extends Error {
    constructor() {
        super('Waiting for user input');
        this.name = 'InputWaitingError';
    }
}

*run(): Generator<void, void, unknown> {
    while (this.currentLineIndex < this.program.lines.length) {
        const line = this.program.lines[this.currentLineIndex];
        
        let statementIndex = 0;
        while (statementIndex < line.statements.length) {
            const statement = line.statements[statementIndex];
            
            try {
                const result = this.executeStatement(statement);
                
                // 正常実行 → 次のステートメントへ
                statementIndex++;
                
                if (result.halt) return;
                if (result.jump) break;
                
                yield; // 通常のyield
                
            } catch (error) {
                if (error instanceof InputWaitingError) {
                    // 入力待ち: statementIndexを進めない
                    yield; // 入力待ちyield
                    // 次のnext()で同じステートメントを再実行
                    continue;
                }
                throw error; // 他のエラーは再スロー
            }
        }
        
        if (!jumpOccurred) {
            this.currentLineIndex++;
        }
    }
}

private evaluateInputNumberExpression(): number {
    if (this.getLineFn) {
        const line = this.getLineFn();
        
        if (line === '') {
            throw new InputWaitingError(); // 入力待ち
        }
        
        const value = parseInt(line.trim(), 10);
        return isNaN(value) ? 0 : (value << 16) >> 16;
    } else {
        throw new Error('行入力機能が設定されていません');
    }
}
```

**メリット**:
- ✅ 最小限の変更
- ✅ 既存のGenerator構造を維持
- ✅ 自然な再実行フロー

**デメリット**:
- ⚠️ 例外を制御フローに使用
- ⚠️ 外部から入力待ち状態を検出しにくい

---

### 案2: 状態フラグベース ⭐⭐⭐⭐

**概要**: インタプリタに`waitingForInput`フラグを追加

```typescript
class WorkerInterpreter {
    private waitingForInput: boolean = false;
    
    *run(): Generator<void, void, unknown> {
        while (this.currentLineIndex < this.program.lines.length) {
            const line = this.program.lines[this.currentLineIndex];
            
            let statementIndex = 0;
            while (statementIndex < line.statements.length) {
                const statement = line.statements[statementIndex];
                
                // 入力待ち状態なら同じステートメントを再実行
                if (this.waitingForInput) {
                    // 再実行前にフラグをリセット
                    this.waitingForInput = false;
                }
                
                const result = this.executeStatement(statement);
                
                if (this.waitingForInput) {
                    // 入力待ち発生: statementIndexを進めない
                    yield;
                    continue;
                }
                
                // 正常実行: 次へ進む
                statementIndex++;
                
                if (result.halt) return;
                if (result.jump) break;
                
                yield;
            }
            
            this.currentLineIndex++;
        }
    }
    
    private evaluateInputNumberExpression(): number {
        if (this.getLineFn) {
            const line = this.getLineFn();
            
            if (line === '') {
                this.waitingForInput = true;
                return 0; // ダミー値（使われない）
            }
            
            const value = parseInt(line.trim(), 10);
            return isNaN(value) ? 0 : (value << 16) >> 16;
        } else {
            throw new Error('行入力機能が設定されていません');
        }
    }
    
    // 外部から状態取得
    isWaitingForInput(): boolean {
        return this.waitingForInput;
    }
}
```

**メリット**:
- ✅ 外部から状態を取得可能
- ✅ 例外を使わない
- ✅ デバッグしやすい

**デメリット**:
- ⚠️ フラグ管理が必要
- ⚠️ ダミー値を返す（0）が気持ち悪い

---

### 案3: Yieldペイロード拡張（型安全） ⭐⭐⭐

**概要**: Generatorの戻り値に状態情報を含める

```typescript
interface StepResult {
    type: 'normal' | 'waiting-input' | 'halted';
    message?: string;
}

*run(): Generator<StepResult, void, unknown> {
    while (this.currentLineIndex < this.program.lines.length) {
        const line = this.program.lines[this.currentLineIndex];
        
        let statementIndex = 0;
        while (statementIndex < line.statements.length) {
            const statement = line.statements[statementIndex];
            
            try {
                const result = this.executeStatement(statement);
                
                statementIndex++;
                
                if (result.halt) {
                    yield { type: 'halted' };
                    return;
                }
                if (result.jump) break;
                
                yield { type: 'normal' };
                
            } catch (error) {
                if (error instanceof InputWaitingError) {
                    yield { type: 'waiting-input', message: 'Waiting for input' };
                    continue; // 同じステートメントを再実行
                }
                throw error;
            }
        }
        
        this.currentLineIndex++;
    }
}
```

**呼び出し側**:
```typescript
const result = generator.next();
if (!result.done) {
    switch (result.value.type) {
        case 'normal':
            // 通常実行
            break;
        case 'waiting-input':
            worker.status = 'waiting-input';
            updateUI();
            break;
        case 'halted':
            worker.status = 'stopped';
            break;
    }
}
```

**メリット**:
- ✅ 型安全
- ✅ 状態が明確
- ✅ デバッグしやすい

**デメリット**:
- ⚠️ 既存コードの変更が多い
- ⚠️ 全てのyieldポイントでペイロード作成

---

### 案4: 非同期Generator（AsyncGenerator） ⭐⭐

**概要**: `async`/`await`を使用

```typescript
async *run(): AsyncGenerator<void, void, unknown> {
    while (this.currentLineIndex < this.program.lines.length) {
        const line = this.program.lines[this.currentLineIndex];
        
        for (const statement of line.statements) {
            const result = await this.executeStatementAsync(statement);
            // ...
            yield;
        }
        
        this.currentLineIndex++;
    }
}

private async evaluateInputNumberExpression(): Promise<number> {
    if (this.getLineFn) {
        const line = await this.getLineFnAsync(); // 真の非同期待機
        const value = parseInt(line.trim(), 10);
        return isNaN(value) ? 0 : (value << 16) >> 16;
    }
    throw new Error('行入力機能が設定されていません');
}
```

**メリット**:
- ✅ 真の非同期待機
- ✅ Promise APIとの統合

**デメリット**:
- ❌ 全体をasync化する必要
- ❌ 既存のGenerator APIとの互換性なし
- ❌ Web/CLI両方の実装を大幅変更

---

## 推奨実装: 案1（例外ベース） + 案2（状態フラグ）のハイブリッド ⭐⭐⭐⭐⭐

### 設計方針

1. **例外で制御フロー** - `InputWaitingError`でステートメント再実行
2. **フラグで状態管理** - 外部から状態取得可能に
3. **最小限の変更** - 既存のGenerator構造を維持

### 実装コード

```typescript
// src/workerInterpreter.ts

/**
 * 入力待ち状態を示すエラー
 */
export class InputWaitingError extends Error {
    constructor(message: string = 'Waiting for user input') {
        super(message);
        this.name = 'InputWaitingError';
    }
}

class WorkerInterpreter {
    // 入力待ち状態フラグ
    private waitingForInput: boolean = false;
    
    /**
     * 入力待ち状態かどうかを取得
     */
    public isWaitingForInput(): boolean {
        return this.waitingForInput;
    }
    
    /**
     * スクリプトを実行するGeneratorを返します。
     * 各ステートメント実行後にyieldします。
     */
    *run(): Generator<void, void, unknown> {
        this.currentLineIndex = 0;
        this.waitingForInput = false;
        
        while (this.currentLineIndex < this.program.lines.length) {
            const line = this.program.lines[this.currentLineIndex];
            
            let statementIndex = 0;
            let jumpOccurred = false;
            
            while (statementIndex < line.statements.length) {
                const statement = line.statements[statementIndex];
                
                try {
                    // 入力待ちフラグをリセット
                    this.waitingForInput = false;
                    
                    const result = this.executeStatement(statement);
                    
                    // 正常実行 → 次のステートメントへ
                    statementIndex++;
                    
                    if (result.halt) return;
                    if (result.jump) {
                        jumpOccurred = true;
                        break;
                    }
                    if (result.skipRemaining) break;
                    
                    yield; // 通常のyield
                    
                } catch (error) {
                    if (error instanceof InputWaitingError) {
                        // 入力待ち状態
                        this.waitingForInput = true;
                        
                        // statementIndexを進めない → 次のnext()で同じステートメントを再実行
                        yield; // 入力待ちyield
                        continue;
                    }
                    
                    // 他のエラーは通常通りスロー
                    throw error;
                }
            }
            
            if (!jumpOccurred) {
                this.currentLineIndex++;
            }
        }
    }
    
    /**
     * 数値入力式を評価（行入力 + atoi）
     */
    private evaluateInputNumberExpression(): number {
        if (this.getLineFn) {
            const line = this.getLineFn();
            
            // 空文字列 = 入力待ち
            if (line === '') {
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
}
```

### Web環境の実装

```typescript
// src/index.ts

interface Worker {
    id: number;
    interpreter: WorkerInterpreter | null;
    generator: Generator<void, void, unknown> | null;
    status: 'stopped' | 'running' | 'paused' | 'waiting-input';
    inputBuffer: string[];
    stepCount: number;
}

// 入力バッファから取得
function getLineInput(workerId: number): string {
    const worker = workers.get(workerId);
    if (!worker || worker.inputBuffer.length === 0) {
        return ''; // 空 = 入力待ち
    }
    return worker.inputBuffer.shift()!;
}

// ワーカーステップ実行
function executeWorkerStep(workerId: number) {
    const worker = workers.get(workerId);
    if (!worker || !worker.generator) return;
    
    // 実行中または入力待ちの場合のみ実行
    if (worker.status !== 'running' && worker.status !== 'waiting-input') {
        return;
    }
    
    try {
        const result = worker.generator.next();
        
        if (result.done) {
            worker.status = 'stopped';
            updateWorkerStatus(workerId);
            return;
        }
        
        // 入力待ち状態をチェック
        if (worker.interpreter && worker.interpreter.isWaitingForInput()) {
            if (worker.status !== 'waiting-input') {
                worker.status = 'waiting-input';
                updateWorkerStatus(workerId);
                logSystem(`Worker ${workerId} is waiting for input...`);
            }
        } else {
            if (worker.status === 'waiting-input') {
                worker.status = 'running';
                updateWorkerStatus(workerId);
            }
        }
        
        worker.stepCount++;
        
    } catch (error) {
        worker.status = 'stopped';
        updateWorkerStatus(workerId);
        logSystem(`Worker ${workerId} error: ${error instanceof Error ? error.message : error}`);
    }
}

// 入力フィールドのイベントハンドラ
inputField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const worker = workers.get(workerId);
        if (!worker) return;
        
        worker.inputBuffer.push(inputField.value);
        inputField.value = '';
        updateInputBufferDisplay(workerId);
        
        // 入力待ちだったワーカーを即座に1ステップ実行
        if (worker.status === 'waiting-input') {
            executeWorkerStep(workerId);
        }
    }
});
```

---

## この実装のメリット

### ✅ 1. 最小限の変更
- `run()`メソッドの修正のみ
- 既存のGenerator APIを維持
- 戻り値の型を変更しない（`Generator<void, void, unknown>`）

### ✅ 2. 自然な再実行フロー
- 例外キャッチ後、`statementIndex`を進めない
- `continue`で同じステートメントを再実行
- Generatorの状態が自然に保持される

### ✅ 3. 外部から状態取得可能
- `isWaitingForInput()`メソッド
- Web環境でUI更新に使用

### ✅ 4. デバッグしやすい
- 入力待ち状態が明確
- エラーメッセージで状況把握

### ✅ 5. テスト可能
- モックで`getLineFn`を制御
- 空文字列→入力待ち→値返却のフローをテスト

---

## 実装の注意点

### ⚠️ 1. 例外の使用
- 通常、例外は制御フローに使わない
- しかし、このケースでは合理的
  - Generatorの同じポイントで停止する必要がある
  - 他の方法（戻り値）ではGenerator位置を戻せない

### ⚠️ 2. InputWaitingErrorのスコープ
- `A=?`専用
- `A=$`は使わない（ノンブロッキング）

### ⚠️ 3. 無限ループの防止
```typescript
// 悪い例
while (true) {
    A=?  // 無限に入力待ち
}

// 対策: maxStepsでタイムアウト（既存の仕組み）
```

---

## まとめ

### 推奨実装: ハイブリッド案

**特徴**:
- ✅ 例外ベースの制御フロー（シンプル）
- ✅ 状態フラグで外部アクセス（デバッグ）
- ✅ 最小限の変更
- ✅ 既存のGenerator構造を維持

**実装ステップ**:
1. `InputWaitingError`クラス追加
2. `run()`メソッド修正（try-catch追加）
3. `isWaitingForInput()`メソッド追加
4. `evaluateInputNumberExpression()`修正
5. Web環境で状態チェック追加
6. テスト追加

**見積もり時間**: 1-2時間

この設計で実装を進めますか？
