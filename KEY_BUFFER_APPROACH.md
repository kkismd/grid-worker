# キーバッファ方式による入力実装

**作成日**: 2025年10月21日  
**提案**: インタプリタがキー入力を包括的にバッファリングし、A=?とA=$で異なる方法で消費する

---

## コンセプト

### 全体像

```
キーボード入力: '1' -> '2' -> '3' -> <Enter> -> 'a' -> 'b' -> <Enter>
                 ↓
キーバッファ（キュー）: ['1', '2', '3', '\n', 'a', 'b', '\n']
                         ↓
                    +----+----+
                    |    |    |
                   A=$   A=?
                    |    |
            単一文字  複数文字（行単位）
```

---

## 実装詳細

### 1. キーバッファの管理

```typescript
// Web環境
interface Worker {
    id: number;
    interpreter: WorkerInterpreter | null;
    generator: Generator<void, void, unknown> | null;
    status: 'stopped' | 'running' | 'paused' | 'waiting-input';
    keyBuffer: string[];  // すべてのキー入力をバッファリング
    stepCount: number;
}

// キー入力ハンドラ
document.addEventListener('keydown', (e) => {
    const worker = getCurrentWorker();
    if (!worker) return;
    
    // すべてのキー入力をバッファに追加
    if (e.key === 'Enter') {
        worker.keyBuffer.push('\n');  // Enterは改行として
    } else if (e.key.length === 1) {
        worker.keyBuffer.push(e.key);  // 通常の文字
    }
    // Backspace, Arrow等は無視
    
    // 入力待ちワーカーを再開
    if (worker.status === 'waiting-input') {
        worker.status = 'running';
        executeWorkerStep(worker);
    }
});
```

### 2. A=$ の実装（1文字入力）

```typescript
// WorkerInterpreter
private evaluateIoGetExpression(): number {
    if (this.getFn) {
        const value = this.getFn();
        return Math.max(0, Math.min(255, Math.floor(value)));
    }
    throw new Error('1byte入力機能が設定されていません');
}

// Web環境のgetFn
function getKeyInput(workerId: number): number {
    const worker = workers.get(workerId);
    if (!worker || worker.keyBuffer.length === 0) {
        return 0;  // バッファが空 → 0（ノンブロッキング）
    }
    
    const char = worker.keyBuffer.shift()!;  // 先頭を取得
    return char.charCodeAt(0);  // ASCIIコードを返す
}
```

**動作例**:
```workerscript
// バッファ: ['1', '2', '3', '\n']

A=$  // → 49 ('1'のASCIIコード)、バッファ: ['2', '3', '\n']
A=$  // → 50 ('2')、バッファ: ['3', '\n']
A=$  // → 51 ('3')、バッファ: ['\n']
A=$  // → 10 ('\n')、バッファ: []
A=$  // → 0（バッファが空）
```

---

### 3. A=? の実装（行入力）

#### 3-1. ヘルパー関数: バッファ内の改行検索

```typescript
// キーバッファから改行までを取得
function getLineFromBuffer(buffer: string[]): string | null {
    const newlineIndex = buffer.indexOf('\n');
    
    if (newlineIndex === -1) {
        return null;  // 改行がない → 行が完成していない
    }
    
    // 改行までの文字列を取得して削除
    const line = buffer.splice(0, newlineIndex + 1).slice(0, -1).join('');
    return line;
}
```

#### 3-2. 選択肢A: ノンブロッキング版

```typescript
// WorkerInterpreter
private evaluateInputNumberExpression(): number {
    if (this.getLineFn) {
        const line = this.getLineFn();
        
        if (line === null) {
            // 改行がない → 行が完成していない → 0を返す
            return 0;
        }
        
        const value = parseInt(line, 10);
        if (isNaN(value)) return 0;
        return (value << 16) >> 16;  // 16ビット符号付き整数
    }
    throw new Error('行入力機能が設定されていません');
}

// Web環境のgetLineFn
function getLineInput(workerId: number): string | null {
    const worker = workers.get(workerId);
    if (!worker) return null;
    
    return getLineFromBuffer(worker.keyBuffer);
}
```

**動作例（ノンブロッキング）**:
```workerscript
// バッファ: ['1', '2', '3']  ← まだEnterが押されていない

A=?  // → 0（改行がない）
     // バッファは消費されない: ['1', '2', '3']

// ユーザーがEnterを押す → バッファ: ['1', '2', '3', '\n']

A=?  // → 123
     // バッファ: []（'1','2','3','\n'が消費された）
```

**ポーリングパターン**:
```workerscript
?="Enter a number: "
^WAIT
A=?
IF A=0 CONT  // 改行がなければ次のフレームで再試行
?="You entered: " ?=A /
```

---

#### 3-3. 選択肢B: ブロッキング版

```typescript
// WorkerInterpreter
private evaluateInputNumberExpression(): number {
    if (this.getLineFn) {
        const line = this.getLineFn();
        
        if (line === null) {
            // 改行がない → 行が完成していない → 入力待ち
            throw new InputWaitingError('Waiting for line input (Enter key)');
        }
        
        const value = parseInt(line, 10);
        if (isNaN(value)) return 0;
        return (value << 16) >> 16;
    }
    throw new Error('行入力機能が設定されていません');
}

// Web環境のgetLineFn（ノンブロッキング版と同じ）
function getLineInput(workerId: number): string | null {
    const worker = workers.get(workerId);
    if (!worker) return null;
    
    return getLineFromBuffer(worker.keyBuffer);
}
```

**動作例（ブロッキング）**:
```workerscript
// バッファ: ['1', '2', '3']  ← まだEnterが押されていない

A=?  // → InputWaitingError
     // ワーカーが 'waiting-input' 状態になる
     // バッファは消費されない: ['1', '2', '3']

// ユーザーがEnterを押す → バッファ: ['1', '2', '3', '\n']
// ワーカーが自動的に再開

A=?  // → 123（再実行）
     // バッファ: []
```

---

## 両方式の比較

### ノンブロッキング版（選択肢A）

**実装**:
```typescript
if (line === null) {
    return 0;  // 改行がない → 0を返す
}
```

**メリット**:
- ✅ 実装がシンプル
- ✅ InputWaitingError不要
- ✅ run()メソッドの変更不要
- ✅ try-catch不要
- ✅ 複数桁入力が可能（改行までバッファに溜まる）

**デメリット**:
- ⚠️ ユーザーが明示的にループを書く必要
- ⚠️ VTL2オリジナル仕様と異なる

**ユーザーコード**:
```workerscript
?="Enter a number: "
^WAIT
A=?
IF A=0 CONT  // 改行待ち
?="You entered: " ?=A /
```

---

### ブロッキング版（選択肢B）

**実装**:
```typescript
if (line === null) {
    throw new InputWaitingError();  // 改行がない → 入力待ち
}
```

**メリット**:
- ✅ VTL2オリジナル仕様に忠実
- ✅ ユーザーがループを書く必要なし
- ✅ 複数桁入力が可能

**デメリット**:
- ⚠️ InputWaitingError機構が必要
- ⚠️ run()メソッドの修正が必要（try-catch、インデックスベース）
- ⚠️ 実装が複雑

**ユーザーコード**:
```workerscript
?="Enter a number: "
A=?  // Enterが押されるまで自動的に待機
?="You entered: " ?=A /
```

---

## 実装の簡略化

### 重要な発見

**キーバッファ方式を使えば、どちらの方式でも複雑さが大幅に削減されます！**

#### 共通部分（どちらでも必要）

```typescript
// 1. キーバッファ
interface Worker {
    keyBuffer: string[];  // すべてのキー入力
}

// 2. バッファから行を取得
function getLineFromBuffer(buffer: string[]): string | null {
    const newlineIndex = buffer.indexOf('\n');
    if (newlineIndex === -1) return null;
    return buffer.splice(0, newlineIndex + 1).slice(0, -1).join('');
}

// 3. getLineFn
function getLineInput(workerId: number): string | null {
    const worker = workers.get(workerId);
    return getLineFromBuffer(worker.keyBuffer);
}
```

#### 違いは1行だけ！

**ノンブロッキング版**:
```typescript
if (line === null) {
    return 0;  // ← この1行
}
```

**ブロッキング版**:
```typescript
if (line === null) {
    throw new InputWaitingError();  // ← この1行
}
```

---

## 推奨実装方針

### 段階的実装

#### Phase 1: 基本インフラ（1-2時間） ⭐⭐⭐⭐⭐

**まずノンブロッキング版を実装**:

1. ✅ キーバッファ追加
2. ✅ `getLineFromBuffer()` 実装
3. ✅ `evaluateInputNumberExpression()` 修正（`return 0`版）
4. ✅ テスト追加

**メリット**:
- シンプルで確実
- 複数桁入力が可能（重要！）
- すぐに動作確認できる

---

#### Phase 2: ブロッキング対応（3-4時間）

**必要に応じてブロッキング版に拡張**:

1. InputWaitingError追加
2. run()メソッド修正
3. `evaluateInputNumberExpression()` を1行変更（`throw InputWaitingError`）
4. Web環境で'waiting-input'状態管理
5. テスト拡張

**メリット**:
- Phase 1が動作している状態から始められる
- リスク分散

---

## 実装コード（Phase 1: ノンブロッキング版）

### 1. Worker構造の拡張

```typescript
// src/index.ts
interface Worker {
    id: number;
    interpreter: WorkerInterpreter | null;
    generator: Generator<void, void, unknown> | null;
    status: 'stopped' | 'running' | 'paused';
    keyBuffer: string[];  // ← 追加
    stepCount: number;
}
```

### 2. キー入力ハンドラ

```typescript
// src/index.ts
document.addEventListener('keydown', (e) => {
    const worker = getCurrentWorker();
    if (!worker) return;
    
    if (e.key === 'Enter') {
        worker.keyBuffer.push('\n');
    } else if (e.key.length === 1) {
        worker.keyBuffer.push(e.key);
    }
});
```

### 3. ヘルパー関数

```typescript
// src/index.ts
function getLineFromBuffer(buffer: string[]): string | null {
    const newlineIndex = buffer.indexOf('\n');
    if (newlineIndex === -1) return null;
    
    const line = buffer.splice(0, newlineIndex + 1).slice(0, -1).join('');
    return line;
}

function getLineInput(workerId: number): string | null {
    const worker = workers.get(workerId);
    if (!worker) return null;
    return getLineFromBuffer(worker.keyBuffer);
}
```

### 4. A=$ の修正

```typescript
// src/index.ts
function getKeyInput(workerId: number): number {
    const worker = workers.get(workerId);
    if (!worker || worker.keyBuffer.length === 0) {
        return 0;
    }
    
    const char = worker.keyBuffer.shift()!;
    return char.charCodeAt(0);
}
```

### 5. evaluateInputNumberExpression() の修正

```typescript
// src/workerInterpreter.ts
private evaluateInputNumberExpression(): number {
    if (this.getLineFn) {
        const line = this.getLineFn();
        
        // 改行がない → 0を返す（ノンブロッキング）
        if (line === null || line === '') {
            return 0;
        }
        
        const value = parseInt(line, 10);
        if (isNaN(value)) return 0;
        return (value << 16) >> 16;
    }
    throw new Error('行入力機能が設定されていません');
}
```

### 6. テスト

```typescript
describe('Input with Key Buffer', () => {
    it('A=$ consumes single character from buffer', () => {
        // keyBuffer: ['1', '2', '3']
        // A=$ → 49
        // keyBuffer: ['2', '3']
    });
    
    it('A=? returns 0 when no Enter in buffer (non-blocking)', () => {
        // keyBuffer: ['1', '2', '3']
        // A=? → 0
        // keyBuffer: ['1', '2', '3']（消費されない）
    });
    
    it('A=? returns number when Enter is in buffer', () => {
        // keyBuffer: ['1', '2', '3', '\n']
        // A=? → 123
        // keyBuffer: []
    });
    
    it('A=? can input multi-digit numbers', () => {
        // keyBuffer: ['4', '5', '6', '\n']
        // A=? → 456
    });
});
```

---

## まとめ

### このアイディアの利点

1. ✅ **複数桁入力が可能**（致命的欠陥を解決）
2. ✅ **実装がシンプル**（キーバッファ + 改行検索）
3. ✅ **段階的実装可能**（Phase 1 → Phase 2）
4. ✅ **A=$とA=?の実装が明確に分離**

### 推奨アプローチ

**Phase 1: ノンブロッキング版を実装**（1-2時間）
- キーバッファ方式
- A=? は改行がなければ0を返す
- 複数桁入力が可能
- すぐに動作確認

**Phase 2: 必要ならブロッキング版に拡張**（3-4時間）
- InputWaitingError機構
- run()メソッド修正
- VTL2オリジナル仕様に完全準拠

Phase 1から始めてよろしいですか？
