# グリッドアトミック操作の実装

## 概要

マルチワーカー環境でグリッドの値を安全に更新するための、Compare-And-Swap (CAS) 操作を実装しました。

## 実装した構文

### Compare-And-Swap (CAS)

```workerscript
記号: <&期待値,書込値>
用途: 条件付きアトミック更新
構文: A=<&expected,newval>
説明: Grid[X,Y]がexpectedと一致すればnewvalをセット
     戻り値: 1=成功、0=失敗（値が期待値と異なった）
```

## 記号選択の理由

当初の提案では `{期待値,書込値}` の形式でしたが、ユーザーから「`{}` は他の用途に使いたい」との要望があったため、代替案として **`<&期待値,書込値>`** を採用しました。

### 選択理由

1. **`&` はアトミック操作を想起させる**
   - 論理ANDの `&` とは文脈が明確に異なる（`<` `>` で囲まれている）
   - アトミック（atomic）の "a" や、AND（両方の条件が成立）を連想させる

2. **`<` `>` で囲むことで特殊な操作を明示**
   - 通常の式とは異なる、特殊なアトミック操作であることが一目でわかる
   - ネストした比較演算子 `<` との混同を避けられる

3. **`,` で2つの引数を区切る**
   - FORループなど、既存の構文で使われているカンマ区切りと一貫性がある

## 使用例

### 1. カウンタのアトミックインクリメント

```workerscript
^INCREMENT_COUNTER
    X=5 Y=5               : カウンタ位置
^CAS_RETRY
    O=`                   : 現在値を読む
    N=O+1                 : 新値を計算
    A=<&O,N>              : CAS実行
    ;=A=0 #=^CAS_RETRY    : 失敗なら再試行
    #=!                   : 成功なら復帰
```

複数のワーカーが同時にカウンタをインクリメントしても、CASのリトライループにより正しい値が保証されます。

### 2. 条件付き更新

```workerscript
: 値が10以下の場合のみ2倍にする
^DOUBLE_IF_SMALL
    X=3 Y=3
^RETRY
    O=`                   : 現在値を読む
    ;=O>10 #=!            : 10より大きければ何もしない
    N=O*2                 : 新値を計算
    A=<&O,N>              : CAS実行
    ;=A=0 #=^RETRY        : 失敗なら再試行
    #=!
```

### 3. スピンロックの実装

```workerscript
: ロック取得
^ACQUIRE_LOCK
    X=0 Y=0               : ロック変数
^LOCK_RETRY
    A=<&0,1>              : 0なら1をセット
    ;=A=1 #=!             : 成功なら復帰
    #=^LOCK_RETRY         : 失敗なら再試行

: ロック解放
^RELEASE_LOCK
    X=0 Y=0
    `=0                   : ロッククリア
    #=!
```

## 実装詳細

### AST定義 (src/ast.ts)

```typescript
export interface CompareAndSwapExpression extends ASTNode {
    type: 'CompareAndSwapExpression';
    expected: Expression;   // 期待値
    newValue: Expression;   // 書き込む新値
}
```

### パーサー (src/parser.ts)

`parsePrimaryExpression()` メソッド内で、`<` トークンの後に `&` が続く場合にCAS式として解析します。

1. `<&` の形式を検出
2. 対応する `>` を見つける
3. 内部をカンマで分割して期待値と新値を取得
4. それぞれの式を再帰的にパース

### インタープリタ (src/workerInterpreter.ts)

`evaluateCompareAndSwapExpression()` メソッドで実行します：

```typescript
private evaluateCompareAndSwapExpression(expr: CompareAndSwapExpression): number {
    // 1. X, Y座標を取得
    const x = this.getVariable('X');
    const y = this.getVariable('Y');
    
    // 2. 期待値と新値を評価
    const expected = this.assertNumber(this.evaluateExpression(expr.expected), ...);
    const newValue = this.assertNumber(this.evaluateExpression(expr.newValue), ...);
    
    // 3. グリッドのインデックスを計算
    const index = Math.floor(y) * 100 + Math.floor(x);
    
    // 4. 現在の値を取得
    const currentValue = this.gridData[index] ?? 0;
    
    // 5. Compare-And-Swap操作
    if (currentValue === expected) {
        this.pokeFn(Math.floor(x), Math.floor(y), newValue);
        return 1; // 成功
    } else {
        return 0; // 失敗
    }
}
```

## Web Worker環境での実装

実際のマルチワーカー環境では、SharedArrayBufferとAtomics APIを使用してアトミック性を保証します：

```typescript
// SharedArrayBufferベースの実装例
class GridAtomicOperations {
    private sharedBuffer: SharedArrayBuffer;
    private atomicView: Int32Array;
    
    constructor(width: number, height: number) {
        this.sharedBuffer = new SharedArrayBuffer(width * height * 4);
        this.atomicView = new Int32Array(this.sharedBuffer);
    }
    
    compareAndSwap(x: number, y: number, expected: number, newValue: number): boolean {
        const index = y * this.width + x;
        const oldValue = Atomics.compareExchange(
            this.atomicView,
            index,
            expected,
            newValue
        );
        return oldValue === expected;
    }
}
```

## 利点

1. **競合の防止**: 複数のワーカーが同時にグリッドを更新しても、データの一貫性が保証される
2. **ロックフリー**: スピンロックよりも効率的なロックフリーアルゴリズムを実装可能
3. **汎用性**: カウンタ、ロック、条件付き更新など、様々な同期処理に応用可能
4. **標準的**: 多くの並行プログラミング環境で実証済みのパターン

## 制限事項

### 現在の実装（シングルスレッド環境）

現在の実装は、SharedArrayBufferを使用しないシングルスレッド環境での動作を想定しています。実際のマルチワーカー環境で使用する場合は、以下の対応が必要です：

1. **SharedArrayBufferの導入**: グリッドデータをSharedArrayBufferで管理
2. **Atomics APIの使用**: `Atomics.compareExchange()` による真のアトミック性の保証
3. **メモリバリアの考慮**: 必要に応じてメモリ順序制御の追加

### ABA問題

CAS操作では、値がA→B→Aと変化した場合を検出できません。必要に応じて、バージョンカウンタを併用する実装を検討してください。

## 今後の拡張案

SHARED_MEMORY_ATOMIC_PRIMITIVE.mdで提案されている他のアトミック操作も、将来的に実装可能です：

- **`+`期待値`**: Fetch-And-Add（アトミック加算）
- **`\`期待値`**: Store-If-Zero（ゼロチェック付き書き込み）
- **`&`期待値`**: Test-And-Set（テスト&セット）
- **`|=0/1/2`**: Memory Barrier（メモリバリア）

ただし、最小限の文法で最大限の機能を提供するため、まずはCAS操作のみを実装し、必要に応じて拡張する方針です。

## 参考文献

- `docs/feature/shared-memory-atomic-primitive/SHARED_MEMORY_ATOMIC_PRIMITIVE.md`
- `docs/feature/shared-memory-atomic-primitive/GRID_ATOMIC_OPERATIONS_PROPOSAL.md`
- `docs/general/SYMBOL_RESOURCES.md`

---

*最終更新: 2025年1月*
