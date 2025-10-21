# 入力待ち機能の実装アプローチ見直し

**作成日**: 2025年10月21日  
**目的**: Generator環境での入力待ち機能の実装が想定より複雑だったため、アプローチを見直す

---

## 当初の実装の問題点

### 1. 複雑すぎる制御フロー

```typescript
// 問題: 3箇所でtry-catchが必要
*run() {
    // 1. メイン行処理
    for (const statement of line.statements) {
        try { ... } catch (InputWaitingError) { ... }
    }
    
    // 2. FORループ内の最初のステートメント
    try { ... } catch (InputWaitingError) { ... }
    
    // 3. WHILEループ内の最初のステートメント
    try { ... } catch (InputWaitingError) { ... }
    
    // 4. ループ内の次のステートメント
    try { ... } catch (InputWaitingError) { ... }
}
```

**問題**:
- 4箇所にtry-catchブロックを追加
- for...ofループをwhileループに変更（インデックス管理のため）
- コードが大幅に複雑化
- 保守性が低下
- バグが混入しやすい

### 2. ループ処理の複雑さ

現在のrun()メソッドは以下のような複雑な構造：

```
while (currentLineIndex < program.body.length || loopStack.length > 0) {
    if (loopStack.length > 0) {
        // ループ内のステートメント実行
        if (bodyIndex >= body.length) {
            // ループの次のイテレーション判定
            if (type === 'for') { ... }
            else if (type === 'while') { ... }
        }
        // 次のステートメント実行
    }
    
    // 通常の行処理
    for (const statement of line.statements) { ... }
}
```

**問題**:
- loopStackとcurrentLineIndexの両方を管理
- ループ内と通常行の2つの実行パスがある
- 入力待ち機能を追加すると、両方のパスにtry-catchが必要

---

## 根本的な原因

### Generator実行モデルの特性

```typescript
// 理想的な入力待ち
A=?  // ← ここで停止
     // ユーザー入力待ち
     // 入力後、同じステートメントを再実行

// しかし、Generatorは...
yield; // 一度yieldしたら次のyieldポイントへ進む
```

**問題の本質**:
- Generatorは「前に戻る」ことができない
- 同じyieldポイントに「留まる」仕組みが自然でない
- ステートメントを「再実行」するには、明示的なループとインデックス管理が必要

---

## 代替アプローチの検討

### 案1: 入力待ちを「ブロッキングしない」仕様に変更 ⭐⭐⭐⭐⭐

**コンセプト**: A=?を「ノンブロッキング」にする

```workerscript
// 新しい仕様
A=?  // 入力バッファが空なら0を返す（ノンブロッキング）
IF A=0 CONT  // 0なら次のフレームで再試行
?="You entered: " ?=A /
```

**実装**:
```typescript
// 現在の実装そのまま（変更なし）
private evaluateInputNumberExpression(): number {
    if (this.getLineFn) {
        const line = this.getLineFn();
        
        // 空文字列 → 0を返す（ノンブロッキング）
        if (line === '') {
            return 0;
        }
        
        const value = parseInt(line.trim(), 10);
        return isNaN(value) ? 0 : (value << 16) >> 16;
    }
    throw new Error('行入力機能が設定されていません');
}
```

**メリット**:
- ✅ コード変更なし（現在の実装がそのまま使える）
- ✅ シンプル
- ✅ マルチワーカー協調動作と整合性がある
- ✅ ユーザーがIFで制御可能

**デメリット**:
- ⚠️ ユーザーが明示的にループを書く必要がある
- ⚠️ 「ブロッキング」の仕様とは異なる

**ユーザーコード例**:
```workerscript
?="Enter a number: "
^INPUT
A=?
IF A=0 CONT  // 入力がなければ次のフレームで再試行
?="You entered: " ?=A /
```

---

### 案2: 専用の「入力待ちステート」を導入 ⭐⭐⭐

**コンセプト**: Generatorとは別に、入力待ち状態を管理

```typescript
interface WorkerState {
    mode: 'running' | 'waiting-input' | 'stopped';
    waitingStatement?: Statement; // 入力待ちのステートメント
    resumeContext?: any; // 再開時のコンテキスト
}

*run() {
    while (...) {
        for (const statement of line.statements) {
            const result = this.executeStatement(statement);
            
            // 入力待ちが必要な場合
            if (result.waitingForInput) {
                this.state.mode = 'waiting-input';
                this.state.waitingStatement = statement;
                yield; // 一旦停止
                
                // 次のnext()で入力をチェック
                if (hasInput()) {
                    // 入力があれば再実行
                    this.executeStatement(statement);
                } else {
                    // まだ入力がなければ再度待機
                    continue;
                }
            }
            
            yield;
        }
    }
}
```

**メリット**:
- ✅ 明示的な状態管理
- ✅ デバッグしやすい

**デメリット**:
- ⚠️ ExecutionResultに新しいフィールド追加
- ⚠️ ループ内でも同様の処理が必要
- ⚠️ コードが複雑

---

### 案3: async/await + Promise ⭐⭐

**コンセプト**: 真の非同期処理

```typescript
async *run() {
    while (...) {
        for (const statement of line.statements) {
            await this.executeStatementAsync(statement);
            yield;
        }
    }
}

private async evaluateInputNumberExpression(): Promise<number> {
    const line = await this.getLineFnAsync(); // Promiseを返す
    return parseInt(line, 10);
}
```

**メリット**:
- ✅ 真の非同期待機

**デメリット**:
- ❌ 全体をasync化
- ❌ 既存のGenerator APIと互換性なし
- ❌ Web/CLI両環境の大幅変更

---

### 案4: 仕様を「ポーリング型」に明確化 ⭐⭐⭐⭐⭐

**コンセプト**: WorkerScriptの設計思想に合わせる

WorkerScriptは**協調マルチタスキング**を前提としている：
- 各ワーカーは1ステートメントごとにyield
- 他のワーカーも公平に実行
- **ブロッキング処理は設計思想に反する**

**新しい仕様**:
```workerscript
// A=? は「ポーリング」
A=?  // 入力があれば数値、なければ0

// ユーザーは明示的にループで待機
^WAIT_INPUT
A=?
IF A=0 GOTO ^WAIT_INPUT  // 入力があるまでループ
?="You entered: " ?=A /
```

**または、CONT（次のフレームで再試行）を使う**:
```workerscript
^INPUT
A=?
IF A=0 CONT  // 入力がなければ次のフレームで再試行
?="You entered: " ?=A /
```

**メリット**:
- ✅ WorkerScriptの設計思想と整合性
- ✅ コード変更なし（現在の実装がそのまま）
- ✅ シンプルで理解しやすい
- ✅ マルチワーカーと相性が良い
- ✅ デバッグしやすい

**デメリット**:
- ⚠️ ユーザーがループを書く必要がある
- ⚠️ 従来のBASICの`INPUT`とは異なる

---

## 推奨アプローチ: 案4（ポーリング型）

### 理由

1. **設計思想との整合性**
   - WorkerScriptは協調マルチタスキング
   - ブロッキングは設計に反する
   - 1ステートメント = 1yieldの原則を維持

2. **実装のシンプルさ**
   - コード変更なし
   - 現在の実装がそのまま使える
   - 複雑なtry-catchや状態管理が不要

3. **マルチワーカーとの整合性**
   - 複数ワーカーが協調動作
   - 1つのワーカーが長時間ブロックすることがない

4. **デバッグのしやすさ**
   - 状態が明確
   - 予測可能な動作

### 仕様の明確化

#### A=? の動作

| 状態 | 戻り値 | 説明 |
|------|--------|------|
| 入力バッファに値あり | 数値（-32768～32767） | 入力を消費して返す |
| 入力バッファが空 | 0 | すぐに0を返す（ブロックしない） |
| 無効な入力 | 0 | 数値に変換できない場合 |

#### A=$ の動作

| 状態 | 戻り値 | 説明 |
|------|--------|------|
| キューに値あり | 1文字のASCIIコード（0～255） | キューから取得 |
| キューが空 | 0 | すぐに0を返す（ブロックしない） |

#### 両方とも「ノンブロッキング」

### ユーザーコード例

#### 例1: GOTOでポーリング

```workerscript
?="Enter a number: "
^WAIT
A=?
IF A=0 GOTO ^WAIT
?="You entered: " ?=A /
```

#### 例2: CONTでポーリング（推奨）

```workerscript
?="Enter a number: "
^INPUT
A=?
IF A=0 CONT  // 次のフレームで再試行（他のワーカーも動く）
?="You entered: " ?=A /
```

#### 例3: 入力のタイムアウト

```workerscript
?="Enter a number (10 seconds): "
T=600  // 60fps * 10秒
^WAIT
A=?
IF A>0 GOTO ^DONE
T=T-1
IF T>0 CONT
?="Timeout!" /
^DONE
?="You entered: " ?=A /
```

---

## 次のステップ

### 1. ドキュメント更新

`worker.md`の仕様セクションを明確化：

```markdown
#### 6.2a 入力機能（ノンブロッキング）

**構文**:
- `A=?` - 数値入力（行入力 + atoi相当）
- `A=$` - 1文字入力（getchar相当）

**重要**: 両方とも**ノンブロッキング**です。
入力がない場合、即座に0を返します。

**ポーリングパターン**:
```workerscript
^INPUT
A=?
IF A=0 CONT  // 入力がなければ次のフレームで再試行
?="You entered: " ?=A /
```
```

### 2. テスト追加

現在の実装の動作を確認するテストを追加：

```typescript
describe('Input Polling Behavior', () => {
    it('A=? returns 0 when buffer is empty (non-blocking)', () => {
        // 空の入力バッファ → 0を返す
    });
    
    it('A=? returns number when buffer has input', () => {
        // 入力バッファに値 → 数値を返す
    });
    
    it('User can poll for input with CONT', () => {
        // CONTを使ったポーリングパターン
    });
});
```

### 3. Web環境のUI改善

入力フィールドに「入力待ち」の表示を追加：

```typescript
// ワーカーが A=? を実行し、0が返ったとき
if (interpreter.isWaitingForInput()) {
    inputField.placeholder = "Waiting for input...";
    inputField.classList.add('waiting');
}
```

### 4. サンプルコード追加

`examples/`ディレクトリに入力のサンプルを追加：

```workerscript
// examples/input-polling.ws
?="Enter your age: "
^WAIT_AGE
A=?
IF A=0 CONT
?="You are " ?=A ?=" years old" /
```

---

## まとめ

### 変更なし！

**現在の実装がそのまま正しい仕様です。**

必要なのは：
1. ✅ ドキュメントの明確化（「ノンブロッキング」であることを明記）
2. ✅ ユーザーコード例の追加（ポーリングパターン）
3. ✅ テストの追加（現在の動作の確認）

### 利点

- ✅ コード変更なし
- ✅ 複雑なtry-catch不要
- ✅ Generator構造を維持
- ✅ WorkerScriptの設計思想と整合
- ✅ マルチワーカー協調動作と整合
- ✅ シンプルで理解しやすい
- ✅ デバッグしやすい

この方針で進めますか？
