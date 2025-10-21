# エコーバック方式によるブロッキング入力

**作成日**: 2025年10月21日  
**提案**: エコーバックを1フレームの動作として実行し、例外なしでブロッキングを実現

---

## コンセプト

### 問題: 例外ベースのブロッキングは複雑

```typescript
// 従来案: 例外で制御フローを変える
private evaluateInputNumberExpression(): number {
    const line = this.getLineFn();
    if (line === null) {
        throw new InputWaitingError();  // ← 例外
    }
    // ...
}

// run()で4箇所にtry-catch
try {
    this.executeStatement(statement);
} catch (InputWaitingError) {
    // statementIndexを進めない
    yield;
    continue;
}
```

**問題**:
- ❌ try-catchが4箇所必要
- ❌ 例外を制御フローに使用
- ❌ 複雑

---

### 新提案: エコーバックでyieldを消化

**アイディア**:
1. A=? 実行時、キューに改行がなければ**現在の入力途中の文字列をエコーバック**
2. エコーバック自体が「1フレームの動作」として yield を消化
3. 改行が来たらparseIntして次のステートメントへ進む

```typescript
private evaluateInputNumberExpression(): number {
    const result = this.getLineFn(); // { complete: boolean, value: string }
    
    if (!result.complete) {
        // 入力途中 → エコーバックして同じステートメントを継続
        if (result.value !== '') {
            this.logFn(result.value);  // "12" をエコーバック
        }
        // ← ここで return せず、yield される
        // 次のnext()で同じステートメントを再実行
        return 0; // ダミー値（使われない）
    }
    
    // 入力完了 → parseIntして次へ進む
    const num = parseInt(result.value, 10);
    return isNaN(num) ? 0 : (num << 16) >> 16;
}
```

---

## 実装詳細

### 1. getLineFnの戻り値を拡張

```typescript
// 行入力の結果
interface LineInputResult {
    complete: boolean;  // 行が完成したか（Enterが押されたか）
    value: string;      // 現在の入力内容
}

// WorkerInterpreter
constructor(config: {
    // ...
    getLineFn?: () => LineInputResult;  // ← 戻り値を変更
}) {
    // ...
}
```

### 2. getLineFromBufferの拡張

```typescript
// src/index.ts
function getLineFromBuffer(buffer: string[]): LineInputResult {
    const newlineIndex = buffer.indexOf('\n');
    
    if (newlineIndex === -1) {
        // 改行がない → 入力途中
        return {
            complete: false,
            value: buffer.join('')  // "12" などの途中入力
        };
    }
    
    // 改行がある → 入力完了
    const line = buffer.splice(0, newlineIndex + 1).slice(0, -1).join('');
    return {
        complete: true,
        value: line  // "123" などの完成した入力
    };
}

function getLineInput(workerId: number): LineInputResult {
    const worker = workers.get(workerId);
    if (!worker) {
        return { complete: false, value: '' };
    }
    return getLineFromBuffer(worker.keyBuffer);
}
```

### 3. evaluateInputNumberExpression()の修正

```typescript
// src/workerInterpreter.ts
private evaluateInputNumberExpression(): number {
    if (!this.getLineFn) {
        throw new Error('行入力機能が設定されていません');
    }
    
    const result = this.getLineFn();
    
    if (!result.complete) {
        // 入力途中
        if (result.value !== '') {
            // 入力途中の文字列をエコーバック（視覚的フィードバック）
            this.logFn(result.value);
        }
        // ← ここでreturnして、yield される
        // 次のnext()で同じステートメントを再実行
        // しかし、どうやって「同じステートメントを再実行」する？
        return 0; // ダミー値
    }
    
    // 入力完了
    const value = parseInt(result.value, 10);
    if (isNaN(value)) return 0;
    return (value << 16) >> 16;
}
```

**問題**: このままでは次のステートメントに進んでしまう！

---

## 課題: 同じステートメントを再実行する仕組み

### 問題の本質

```typescript
*run() {
    for (const statement of line.statements) {
        const result = this.executeStatement(statement);
        // ↑ A=? が 0 を返す（入力途中）
        
        // しかし、ここで次のステートメントに進んでしまう！
        yield;
    }
}
```

**必要なこと**:
- A=? が「入力途中」を示す
- run()がそれを検知して、同じステートメントを再実行

---

## 解決策: ExecutionResultを拡張

### 案A: ExecutionResultにwaitingフィールド追加

```typescript
interface ExecutionResult {
    jump: boolean;
    halt: boolean;
    skipRemaining: boolean;
    waitingForInput: boolean;  // ← 追加
}

// executeStatement()
private executeStatement(statement: Statement): ExecutionResult {
    if (statement.type === 'AssignmentStatement') {
        const value = this.evaluateExpression(statement.value);
        this.setVariable(statement.variable, value);
        
        // 入力待ち状態かチェック
        return {
            jump: false,
            halt: false,
            skipRemaining: false,
            waitingForInput: this.isWaitingForInput()  // ← フラグを返す
        };
    }
    // ...
}

// run()
*run() {
    while (...) {
        let statementIndex = 0;
        while (statementIndex < line.statements.length) {
            const statement = line.statements[statementIndex]!;
            const result = this.executeStatement(statement);
            
            if (result.waitingForInput) {
                // 入力待ち → statementIndexを進めない
                yield;
                continue;  // 次のnext()で同じステートメントを再実行
            }
            
            // 正常 → 次へ進む
            statementIndex++;
            
            if (result.halt) return;
            if (result.jump) break;
            
            yield;
        }
        // ...
    }
}
```

**メリット**:
- ✅ 例外不要
- ✅ ExecutionResultで状態を返す（型安全）
- ✅ run()の構造は単純（try-catch不要）

**デメリット**:
- ⚠️ for...of → while ループに変更が必要
- ⚠️ loopStack内の処理も対応が必要

---

### 案B: waitingForInputフラグのみで制御

```typescript
// WorkerInterpreter
private waitingForInput: boolean = false;

private evaluateInputNumberExpression(): number {
    const result = this.getLineFn();
    
    if (!result.complete) {
        // 入力途中
        this.waitingForInput = true;  // ← フラグを立てる
        
        if (result.value !== '') {
            this.logFn(result.value);  // エコーバック
        }
        
        return 0; // ダミー値
    }
    
    // 入力完了
    this.waitingForInput = false;  // ← フラグを下ろす
    const value = parseInt(result.value, 10);
    return isNaN(value) ? 0 : (value << 16) >> 16;
}

// run()
*run() {
    while (...) {
        let statementIndex = 0;
        while (statementIndex < line.statements.length) {
            const statement = line.statements[statementIndex]!;
            
            // フラグをリセット
            this.waitingForInput = false;
            
            this.executeStatement(statement);
            
            if (this.waitingForInput) {
                // 入力待ち → statementIndexを進めない
                yield;
                continue;
            }
            
            // 正常 → 次へ進む
            statementIndex++;
            
            // ... halt, jumpチェック
            yield;
        }
    }
}
```

**メリット**:
- ✅ 例外不要
- ✅ ExecutionResultの変更不要
- ✅ シンプル

**デメリット**:
- ⚠️ for...of → while ループに変更が必要
- ⚠️ フラグ管理

---

## 推奨実装: 案B（waitingForInputフラグ）

### 理由

1. **例外不要** - 制御フローがシンプル
2. **ExecutionResult変更不要** - 既存の戻り値型を維持
3. **エコーバックで自然に待機** - ユーザーに視覚的フィードバック

### 動作イメージ

```workerscript
?="Enter a number: "
A=?
?="You entered: " ?=A /
```

**実行フロー**:

```
フレーム1:
  ?="Enter a number: " → "Enter a number: " を表示
  yield

フレーム2:
  A=? → バッファ: []（空）
        getLineFn() → { complete: false, value: '' }
        logFn('') → 何も表示しない
        waitingForInput = true
        return 0
  statementIndex を進めない
  yield

（ユーザーが '1' を入力）

フレーム3:
  A=? → バッファ: ['1']
        getLineFn() → { complete: false, value: '1' }
        logFn('1') → "1" をエコーバック
        waitingForInput = true
        return 0
  statementIndex を進めない
  yield

（ユーザーが '2' を入力）

フレーム4:
  A=? → バッファ: ['1', '2']
        getLineFn() → { complete: false, value: '12' }
        logFn('12') → "12" をエコーバック
        waitingForInput = true
        return 0
  statementIndex を進めない
  yield

（ユーザーが '3' + Enter を入力）

フレーム5:
  A=? → バッファ: ['1', '2', '3', '\n']
        getLineFn() → { complete: true, value: '123' }
        parseInt('123') → 123
        waitingForInput = false
        return 123
  A に 123 を代入
  statementIndex++（次のステートメントへ）
  yield

フレーム6:
  ?="You entered: " → "You entered: " を表示
  yield

フレーム7:
  ?=A → "123" を表示
  yield

フレーム8:
  / → 改行
  yield
```

---

## 実装コード

### 1. LineInputResult型の定義

```typescript
// src/workerInterpreter.ts

/**
 * 行入力の結果
 */
interface LineInputResult {
    complete: boolean;  // 行が完成したか（Enterが押されたか）
    value: string;      // 現在の入力内容
}
```

### 2. WorkerInterpreterの型修正

```typescript
class WorkerInterpreter {
    private waitingForInput: boolean = false;
    private getLineFn: (() => LineInputResult) | undefined;  // ← 型変更
    
    constructor(config: {
        // ...
        getLineFn?: () => LineInputResult;  // ← 型変更
    }) {
        // ...
        this.getLineFn = config.getLineFn;
    }
    
    isWaitingForInput(): boolean {
        return this.waitingForInput;
    }
}
```

### 3. evaluateInputNumberExpression()の修正

```typescript
private evaluateInputNumberExpression(): number {
    if (!this.getLineFn) {
        throw new Error('行入力機能が設定されていません');
    }
    
    const result = this.getLineFn();
    
    if (!result.complete) {
        // 入力途中
        this.waitingForInput = true;
        
        if (result.value !== '') {
            // 入力途中の文字列をエコーバック
            this.logFn(result.value);
        }
        
        return 0; // ダミー値（Aには代入されるが、次のフレームで上書きされる）
    }
    
    // 入力完了
    this.waitingForInput = false;
    const value = parseInt(result.value, 10);
    if (isNaN(value)) return 0;
    return (value << 16) >> 16;
}
```

### 4. run()メソッドの修正

```typescript
*run(): Generator<void, void, unknown> {
    // ...
    this.waitingForInput = false;
    
    while (this.currentLineIndex < this.program.body.length || this.loopStack.length > 0) {
        // ... loopStack処理（省略）
        
        const line = this.program.body[this.currentLineIndex];
        if (!line) break;
        
        let skipRemaining = false;
        let jumped = false;
        
        // ステートメントをインデックスベースで実行
        let statementIndex = 0;
        while (statementIndex < line.statements.length) {
            const statement = line.statements[statementIndex]!;
            
            if (skipRemaining) {
                statementIndex++;
                yield;
                continue;
            }
            
            // 入力待ちフラグをリセット
            this.waitingForInput = false;
            
            const result = this.executeStatement(statement);
            
            if (this.waitingForInput) {
                // 入力待ち → statementIndexを進めない
                yield;
                continue;  // 次のnext()で同じステートメントを再実行
            }
            
            // 正常実行 → 次のステートメントへ
            statementIndex++;
            
            if (result.jump) {
                jumped = true;
                yield;
                break;
            }
            
            if (result.halt) {
                return;
            }
            
            if (result.skipRemaining) {
                skipRemaining = true;
            }
            
            yield;
        }
        
        if (!jumped) {
            this.currentLineIndex++;
        }
    }
}
```

### 5. Web環境のgetLineInput()

```typescript
// src/index.ts

function getLineFromBuffer(buffer: string[]): LineInputResult {
    const newlineIndex = buffer.indexOf('\n');
    
    if (newlineIndex === -1) {
        // 改行がない → 入力途中
        return {
            complete: false,
            value: buffer.join('')
        };
    }
    
    // 改行がある → 入力完了
    const line = buffer.splice(0, newlineIndex + 1).slice(0, -1).join('');
    return {
        complete: true,
        value: line
    };
}

function getLineInput(workerId: number): LineInputResult {
    const worker = workers.get(workerId);
    if (!worker) {
        return { complete: false, value: '' };
    }
    return getLineFromBuffer(worker.keyBuffer);
}
```

---

## この方式の利点

### ✅ 例外不要

- try-catchが不要
- 制御フローがシンプル

### ✅ 自然なエコーバック

```
ユーザー: "1" 入力
画面: "1"

ユーザー: "2" 入力
画面: "12"

ユーザー: "3" + Enter
画面: "123"
→ A に 123 が代入される
```

### ✅ 1フレーム = 1動作

- エコーバックが1フレームの動作
- Generatorの yield を自然に消化
- マルチワーカー協調動作と整合

### ✅ 複数桁入力が可能

- バッファに文字を蓄積
- Enterまで待機
- parseIntで数値化

---

## 実装の注意点

### 1. loopStack内の処理も対応

run()メソッドのloopStack処理部分でも、同様にwaitingForInputをチェックする必要があります。

### 2. エコーバックの頻度

毎フレームエコーバックすると、同じ文字列が何度も表示される可能性があります。

**対策案**:
```typescript
private lastEchoedInput: string = '';

private evaluateInputNumberExpression(): number {
    const result = this.getLineFn();
    
    if (!result.complete) {
        this.waitingForInput = true;
        
        // 前回と異なる場合のみエコーバック
        if (result.value !== this.lastEchoedInput && result.value !== '') {
            this.logFn(result.value);
            this.lastEchoedInput = result.value;
        }
        
        return 0;
    }
    
    // 入力完了
    this.waitingForInput = false;
    this.lastEchoedInput = '';
    // ...
}
```

---

## まとめ

### この方式の特徴

1. **例外なしでブロッキング** - waitingForInputフラグで制御
2. **エコーバックで自然な待機** - 視覚的フィードバック
3. **1フレーム = 1動作** - yieldを自然に消化
4. **複数桁入力が可能** - バッファに蓄積してparseInt

### 実装の複雑さ

- run()メソッドをインデックスベースに変更（for...of → while）
- loopStack内も対応が必要
- しかし、try-catchは不要

### 見積もり時間

- 2-3時間（try-catch方式より簡単）

この方式で実装を進めてよろしいですか？
