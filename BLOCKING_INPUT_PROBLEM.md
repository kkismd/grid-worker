# ブロッキング入力機能の実装課題

**作成日**: 2025年10月21日  
**問題**: VTL2オリジナル仕様の `A=?` はブロッキング入力だが、Generator環境での実装が困難

---

## VTL2オリジナル仕様（正しい仕様）

参照: http://www.altair680kit.com/manuals/Altair_680-VTL-2%20Manual-05-Beta_1-Searchable.pdf (p.6)

**`X=?` は BASIC の `INPUT X` に相当**
- ✅ **ブロッキング動作**: 入力があるまでプログラム実行を停止
- ✅ ユーザーが値を入力してEnterを押すまで待機
- ✅ 入力後、プログラムが再開

---

## 実装上の課題

### 1. Generator環境での「ブロッキング」の難しさ

WorkerScriptのGenerator実行モデル：

```typescript
*run(): Generator<void, void, unknown> {
    while (currentLineIndex < program.body.length) {
        for (const statement of line.statements) {
            this.executeStatement(statement);
            yield; // ← 各ステートメント後にyield
        }
    }
}
```

**問題**:
- Generatorは一度yieldしたら次のyieldポイントへ進む
- 「同じステートメントに留まる」には、明示的なループとインデックス管理が必要
- run()メソッドの構造が複雑（loopStack + 通常行処理）
- try-catchを4箇所に追加する必要がある

### 2. 実装の複雑さ

必要な変更（前回の試み）:
1. ✅ InputWaitingErrorクラス追加
2. ✅ waitingForInputフラグ追加
3. ✅ isWaitingForInput()メソッド追加
4. ❌ run()メソッドの大幅な変更:
   - for...ofループ → whileループ（インデックス管理）
   - メイン行処理にtry-catch
   - FORループ内にtry-catch
   - WHILEループ内にtry-catch
   - ループ内の次のステートメント実行にtry-catch

**結果**: コードが非常に複雑化し、保守性が低下

---

## 考えられる選択肢

### 選択肢1: オリジナル仕様通り実装（ブロッキング） ⭐⭐

**方針**: 複雑でも、正しい仕様を実装する

**実装**:
- InputWaitingError + try-catch（4箇所）
- run()メソッドをインデックスベースに書き換え
- loopStack内のステートメント実行も対応

**メリット**:
- ✅ VTL2オリジナル仕様に忠実
- ✅ ユーザーが期待する動作

**デメリット**:
- ❌ 実装が非常に複雑
- ❌ バグが混入しやすい
- ❌ 保守が困難
- ❌ 他の機能追加時にも影響

**見積もり時間**: 4-6時間（テスト含む）

---

### 選択肢2: 仕様を変更（ポーリング型） ⭐⭐⭐⭐

**方針**: アーキテクチャの制約を優先し、仕様を変更

**変更内容**:
```markdown
### WorkerScript仕様（VTL2からの変更点）

**入力機能の動作**:
- `A=?`: **ポーリング型**（ノンブロッキング）
  - 入力バッファに値があれば数値を返す
  - 入力バッファが空なら0を返す（待機しない）
  - ユーザーは明示的にループで待機する必要がある

**理由**:
WorkerScriptは協調マルチタスキングを前提としており、
1つのワーカーがブロッキングすることは設計思想と矛盾するため。

**ユーザーコード例**:
```workerscript
?="Enter a number: "
^WAIT_INPUT
A=?
IF A=0 CONT  // 入力がなければ次のフレームで再試行
?="You entered: " ?=A /
```
```

**メリット**:
- ✅ 実装がシンプル（現在のコードがそのまま使える）
- ✅ WorkerScriptの設計思想と整合
- ✅ マルチワーカー協調動作と整合
- ✅ デバッグしやすい
- ✅ 保守しやすい

**デメリット**:
- ⚠️ VTL2オリジナル仕様と異なる
- ⚠️ ユーザーが明示的にループを書く必要がある
- ⚠️ ドキュメントに「VTL2との差異」を明記する必要

**見積もり時間**: 1-2時間（ドキュメント更新とテスト）

---

### 選択肢3: CLI環境のみブロッキング、Web環境はポーリング ⭐⭐⭐

**方針**: 環境によって動作を変える

**CLI環境**:
```typescript
// Node.jsの標準入力は真のブロッキング
private getLine(): string {
    return readlineSync.question(''); // ブロックする
}
```

**Web環境**:
```typescript
// Generatorはポーリング型
private getLineInput(workerId: number): string {
    const worker = workers.get(workerId);
    if (worker.inputBuffer.length === 0) {
        return ''; // 空 → ユーザーがループで待機
    }
    return worker.inputBuffer.shift()!;
}
```

**メリット**:
- ✅ CLI環境ではVTL2仕様通り
- ✅ Web環境の実装はシンプル

**デメリット**:
- ⚠️ 環境によって動作が異なる
- ⚠️ ドキュメントが複雑
- ⚠️ ユーザーが混乱する可能性

---

### 選択肢4: async/await化 ⭐

**方針**: Generator → AsyncGenerator

```typescript
async *run(): AsyncGenerator<void, void, unknown> {
    while (...) {
        for (const statement of line.statements) {
            await this.executeStatementAsync(statement);
            yield;
        }
    }
}

private async evaluateInputNumberExpression(): Promise<number> {
    const line = await this.getLineFnAsync(); // 真のawait
    return parseInt(line, 10);
}
```

**メリット**:
- ✅ 真の非同期待機

**デメリット**:
- ❌ 全体を大幅に書き換え
- ❌ 既存のGenerator APIと互換性なし
- ❌ Web/CLI両環境の大幅変更
- ❌ 他の機能への影響大

**見積もり時間**: 8-12時間（リスク大）

---

## 推奨案

### オプションA: 選択肢2（仕様変更）を推奨 ⭐⭐⭐⭐⭐

**理由**:
1. **実装の複雑さ vs 仕様の忠実性**
   - ブロッキング実装は非常に複雑で、バグリスクが高い
   - WorkerScriptは「VTL2の完全互換」を目指していない（既に多くの拡張がある）

2. **設計思想との整合性**
   - WorkerScriptは協調マルチタスキング
   - 1ワーカーのブロッキングは設計に反する

3. **実用性**
   - ポーリング型でも、ユーザーは簡単に入力待ちを実装できる
   - CONTを使えば、他のワーカーも動き続ける

**ドキュメントでの説明**:
```markdown
### VTL2との差異

WorkerScriptは VTL-2 を基にしていますが、以下の点で異なります：

**入力機能（`A=?`）**:
- VTL-2: ブロッキング（`INPUT`相当）
- WorkerScript: ポーリング型（ノンブロッキング）

**理由**:
WorkerScriptは複数ワーカーの協調動作を前提としており、
1つのワーカーがブロッキングすることは設計思想と矛盾するため。

**入力待ちパターン**:
```workerscript
?="Enter a number: "
^WAIT
A=?
IF A=0 CONT  // 入力待ち（他のワーカーは動き続ける）
?="You entered: " ?=A /
```
```

### オプションB: 選択肢1（正しい実装）に挑戦

もし、VTL2仕様に完全に忠実であることが最優先であれば、
複雑さを受け入れて選択肢1を実装することも可能です。

---

## 次のステップ

**ユーザー様の判断をお願いします**:

1. **選択肢2を選ぶ場合**（推奨）:
   - worker.mdに「VTL2との差異」セクション追加
   - ポーリングパターンのドキュメント追加
   - テスト追加
   - 見積もり: 1-2時間

2. **選択肢1を選ぶ場合**:
   - run()メソッドの大幅な書き換え
   - try-catchを4箇所に追加
   - 包括的なテスト
   - 見積もり: 4-6時間、バグリスク高

どちらを選択されますか？
