# ノンブロッキング入力の致命的な欠陥

**作成日**: 2025年10月21日  
**問題**: ノンブロッキング実装では複数桁の数値入力が不可能

---

## 問題の本質

### A=$ (1文字入力) の場合

```workerscript
A=$  // キーキューから1文字取得
```

**ノンブロッキングで問題なし**:
- キーキューに文字があれば → ASCIIコードを返す
- キーキューが空なら → 0を返す
- ユーザーは1文字ずつポーリングできる

```workerscript
^WAIT_KEY
A=$
IF A=0 CONT  // キー入力待ち
?="Key: " ?=A /
```

---

### A=? (数値入力) の場合 - **致命的な問題**

```workerscript
A=?  // 「行入力 + atoi」相当
```

**ノンブロッキングでは実装不可能**:

#### ケース1: 1桁の数値入力
```
ユーザーが "5" + Enter を入力
→ 入力バッファ: "5"
→ A=? が 5 を返す
✅ 問題なし
```

#### ケース2: 複数桁の数値入力 - **問題発生**

```
ユーザーが "123" + Enter を入力したい

フレーム1: ユーザーが "1" を入力
  → バッファ: "1"
  → A=? が実行される
  → バッファに "1" がある → parseInt("1") = 1 を返す
  → バッファを消費してしまう ❌

フレーム2: ユーザーが "2" を入力
  → バッファ: "2"
  → A=? が実行される
  → バッファに "2" がある → parseInt("2") = 2 を返す
  → バッファを消費してしまう ❌

結果: "123" を入力できない！
```

**問題**:
- A=? は「**行入力**（Enterまで待つ）」である必要がある
- 各文字が入力されるたびに A=? を実行してしまうと、行が完成する前に消費される
- ノンブロッキングでは「Enterが押されるまで待つ」ことができない

---

## VTL2オリジナル仕様の動作（正しい動作）

```
ユーザー: "1" を入力
  → プログラムは待機中（まだ実行されない）

ユーザー: "2" を入力  
  → プログラムは待機中（まだ実行されない）

ユーザー: "3" を入力
  → プログラムは待機中（まだ実行されない）

ユーザー: Enter を入力
  → バッファ: "123"
  → A=? が実行される
  → parseInt("123") = 123 を返す
  ✅ 正しく動作
```

**重要**: Enterが押されるまで**ブロック**する必要がある

---

## なぜノンブロッキングでは不可能か

### 問題1: 行入力の概念がない

ノンブロッキング実装:
```typescript
private evaluateInputNumberExpression(): number {
    const line = this.getLineFn();
    
    if (line === '') {
        return 0; // 入力なし
    }
    
    return parseInt(line, 10);
}
```

**問題**:
- `getLineFn()` が呼ばれるたびに、**その時点のバッファ内容**を返す
- "123" を入力中でも、"1" の時点で呼ばれたら "1" を返してしまう
- Enterまで待つ仕組みがない

### 問題2: ポーリングパターンの限界

```workerscript
^WAIT_INPUT
A=?
IF A=0 CONT  // 入力待ち
?="You entered: " ?=A /
```

**問題**:
- ユーザーが "1" を入力した瞬間、A=? が 1 を返してしまう
- ユーザーが "123" を入力したくても、"1" で確定してしまう

---

## 解決策は「ブロッキング」しかない

### Web環境での実装

```typescript
// 入力バッファを「行単位」で管理
interface Worker {
    inputBuffer: string[]; // 完成した行のバッファ
    currentInput: string;  // 現在入力中の文字列
}

// キー入力ハンドラ
inputField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        // Enterが押されたら、行を確定してバッファに追加
        worker.inputBuffer.push(worker.currentInput);
        worker.currentInput = '';
        
        // 入力待ちワーカーを再開
        if (worker.status === 'waiting-input') {
            executeWorkerStep(worker);
        }
    } else {
        // 文字を追加（まだバッファには入れない）
        worker.currentInput += e.key;
    }
});

// A=? の実装
function getLineInput(workerId: number): string {
    const worker = workers.get(workerId);
    
    if (worker.inputBuffer.length === 0) {
        return ''; // 完成した行がない → InputWaitingErrorをスロー
    }
    
    return worker.inputBuffer.shift()!; // 完成した行を返す
}
```

**重要**:
- `currentInput`: 現在入力中の文字列（Enterが押されるまでバッファに入れない）
- `inputBuffer`: 完成した行のリスト（Enterが押されたら追加）
- A=? は `inputBuffer` が空なら `InputWaitingError` をスロー → ブロッキング

---

## 結論

### ノンブロッキング実装は不可能

**理由**:
1. ❌ 複数桁の数値を入力できない
2. ❌ 「行入力（Enterまで待つ）」の概念がない
3. ❌ 各文字入力のたびに A=? が実行されてしまう

### ブロッキング実装が必須

**VTL2オリジナル仕様通り**:
- ✅ Enterが押されるまでプログラムを停止
- ✅ 完成した行（"123"）を取得
- ✅ 複数桁の数値入力が可能

---

## 実装方針の再確認

### 選択肢は1つのみ

**選択肢1: ブロッキング実装（VTL2仕様通り）**

これしかありません。ノンブロッキングでは仕様を満たせません。

### 実装内容

1. **InputWaitingError機構**
   ```typescript
   export class InputWaitingError extends Error { ... }
   ```

2. **run()メソッド修正**
   - try-catchでInputWaitingErrorをキャッチ
   - statementIndexを進めない → 同じステートメントを再実行
   - インデックスベースのループに変更

3. **Web環境**
   - `currentInput` と `inputBuffer` を分離
   - Enterで行を確定
   - InputWaitingErrorをキャッチしてワーカーを'waiting-input'状態に

4. **CLI環境**
   - readline-syncでブロッキング標準入力

### 見積もり時間

- 実装: 4-6時間
- テスト: 2-3時間
- **合計: 6-9時間**

### リスク

- ⚠️ run()メソッドの複雑化
- ⚠️ バグ混入の可能性
- ⚠️ loopStack処理も対応が必要

---

## 次のステップ

**ブロッキング実装を進めます**。

理由:
1. ノンブロッキングでは仕様を満たせない（複数桁入力不可）
2. VTL2オリジナル仕様に忠実である必要がある
3. 複雑でも、正しい実装をする

実装を開始してよろしいですか？
