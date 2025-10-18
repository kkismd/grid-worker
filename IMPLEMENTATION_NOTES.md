# WorkerScript実装ノート

## 現在の実装アーキテクチャ

### 行ベースの実行制御

WorkerScriptインタープリターは現在、**行ベースの実行制御**を採用しています。

#### 主要な特性

1. **行単位のジャンプ**
   - `currentLineIndex`: 現在実行中の行番号のみを追跡
   - GOTO/GOSUB/RETURN: 常に行の先頭にジャンプ
   - ループ（FOR/WHILE）: ループ開始行の次の行に戻る

2. **制約事項**
   - 同じ行内の特定のステートメント位置へのジャンプは不可
   - サブルーチンからのリターンは呼び出し行の次の行に戻る
   - ループバックも行単位

3. **影響を受ける構造**
   ```typescript
   interface LoopInfo {
       forLineIndex: number;  // 行番号のみ保存
       // ステートメント位置は追跡しない
   }
   
   private callStack: number[];  // 行番号のみのスタック
   ```

#### コード例

```workerscript
: 動作する例（推奨）
!=^SUB A=10 ?=A
#=^END
^SUB
  B=20
  #=!
^END
  #=-1

: 制限される例（同じ行内のリターン）
!=^SUB ?="After call" / : RETURNは次の行に戻るため、このprintは実行されない
^SUB
  ?="In sub"
  #=!
```

### 実装詳細

#### ループ実行

```typescript
// WHILEループの場合
if (condition !== 0) {
    // WHILEステートメントの次の【行】にジャンプ
    this.currentLineIndex = currentLoop.forLineIndex + 1;
    return { jump: true, halt: false, skipRemaining: false };
}
```

#### GOSUB/RETURN

```typescript
// GOSUB: 次の【行】をスタックに保存
this.callStack.push(this.currentLineIndex + 1);

// RETURN: 保存された【行】に戻る
const returnLine = this.callStack.pop()!;
this.currentLineIndex = returnLine;
```

## 将来的な拡張

### ステートメント単位の実行制御

行ベースの制限を解消するには、以下の変更が必要：

```typescript
// 現在の実装
private currentLineIndex: number;
private callStack: number[];

// 提案される実装
interface ExecutionPosition {
    lineIndex: number;
    statementIndex: number;
}

private currentPosition: ExecutionPosition;
private callStack: ExecutionPosition[];
```

### 移行に必要な変更

1. **実行位置の追跡**
   - `currentLineIndex` → `{ lineIndex, statementIndex }`
   - すべてのジャンプ処理で両方を更新

2. **ループ情報の拡張**
   ```typescript
   interface LoopInfo {
       startPosition: ExecutionPosition;  // 行+ステートメント
       // ...
   }
   ```

3. **コールスタックの拡張**
   - 行番号のみ → 完全な実行位置

4. **互換性維持**
   - 既存のテストケースは全て行単位を前提
   - 段階的な移行戦略が必要

## ベストプラクティス

現在の行ベース実装での推奨パターン：

### ✅ 推奨

```workerscript
: ループは複数行で記述
@=I,1,10
  ?=I
#=@

: サブルーチン呼び出しは別行
!=^SUB
?="Returned"

: ラベルは独立した行
^MY_LABEL
  ?="At label"
```

### ❌ 非推奨

```workerscript
: 同じ行に複数の制御フローを混在させない
!=^SUB ?="Immediate" : このprintは実行されない可能性

: ループ開始と本体を同じ行に書かない
@=I,1,10 ?=I #=@ : 期待通りに動作しない
```

## 参考情報

- 実装: `src/workerInterpreter.ts`
- テスト: `src/__tests__/workerInterpreter.test.ts` (186テスト)
- 言語仕様: `worker.md`

---

**最終更新**: 2025年10月18日  
**実装バージョン**: v1.0 (統一構文対応)
