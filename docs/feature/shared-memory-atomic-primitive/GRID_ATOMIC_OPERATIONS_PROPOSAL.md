# グリッドアトミック操作の提案

## 概要

マルチワーカー環境でグリッドの値を安全に更新するための、アトミックなread-modify-write操作の提案です。SHARED_MEMORY_ATOMIC_PRIMITIVE.mdで提案された記号のうち、最もシンプルで汎用的な方法を中心に検討します。

## 要件

- 「読み取った値を元に新しい値を計算して書き込む」操作をアトミックに行える
- 文法の追加は極力少なく
- `` ` `` と他の記号1文字をつなげた名前が望ましい

## 推奨案: Compare-And-Swap (CAS) を中心とした設計

### 1. 基本操作: `{}` (Compare-And-Swap)

最も汎用的で、あらゆるアトミック操作の基礎となる操作です。

#### 構文
```workerscript
記号: { }
用途: 条件付きアトミック更新
構文: A={expected,newval}     : Grid[X,Y]がexpectedと一致すればnewvalをセット
説明: 期待値と実際の値が一致した場合のみ新値を書き込む
      戻り値: 1=成功、0=失敗（値が期待値と異なった）
```

#### 使用例: カウンタのインクリメント
```workerscript
^INCREMENT_COUNTER
    X=5 Y=5               : カウンタ位置
^CAS_RETRY
    O=`                   : 現在値を読む
    N=O+1                 : 新値を計算
    A={O,N}               : CAS実行
    ;=A=0 #=^CAS_RETRY    : 失敗なら再試行
    #=!                   : 成功なら復帰
```

#### 使用例: 条件付き更新
```workerscript
: 値が10以下の場合のみ2倍にする
^DOUBLE_IF_SMALL
    X=3 Y=3
^RETRY
    O=`                   : 現在値を読む
    ;=O>10 #=!            : 10より大きければ何もしない
    N=O*2                 : 新値を計算
    A={O,N}               : CAS実行
    ;=A=0 #=^RETRY        : 失敗なら再試行
    #=!
```

#### 利点
- **最大限の汎用性**: 任意の計算ロジックを安全に実行できる
- **既存の提案**: SHARED_MEMORY_ATOMIC_PRIMITIVE.mdで既に定義済み
- **記号の妥当性**: `{` `}` はSYMBOL_RESOURCES.mdで🟢利用可能
- **ロックフリー**: スピンロックなしで排他制御が実現できる

### 2. 補完操作: `+`` (Fetch-And-Add)

頻出するカウンタ操作を簡潔に記述するための専用操作です。

#### 構文
```workerscript
記号: +`
用途: カウンタのアトミック更新
構文: A=+`                    : Grid[X,Y]に1を加算、加算前の値を返す
      A=+`=5                  : Grid[X,Y]に5を加算、加算前の値を返す
      A=+`=-1                 : Grid[X,Y]から1を減算、減算前の値を返す
説明: 指定値をアトミックに加算し、加算前の値を返す
      省略時は+1として動作
```

#### 使用例: リングバッファのポインタ更新
```workerscript
^ENQUEUE
    X=1 Y=0               : tail位置の座標
    T=+`                  : tailをアトミックにインクリメント
    T=T%100               : リングバッファサイズで剰余
    X=T Y=1               : データ格納位置
    `=D                   : データ書き込み
    #=!
```

#### 利点
- **簡潔性**: カウンタ操作が1行で完結
- **効率性**: CASのリトライループが不要
- **記号の妥当性**: `` ` `` と1文字の組み合わせという要件を満たす

### 3. 効率的ロック操作: `\`` (Store-If-Zero)

スピンロックの実装を簡潔にするための補助操作です。

#### 構文
```workerscript
記号: \`
用途: ゼロチェック付き書き込み
構文: A=\`=value              : Grid[X,Y]が0ならvalueをセット
説明: Grid[X,Y]が0の場合のみvalueを書き込む
      戻り値: 1=成功（0だった）、0=失敗（非0だった）
```

#### 使用例: 効率的なロック取得
```workerscript
^TRY_LOCK
    X=0 Y=0               : ロック変数
    A=\`=1                : 0なら1をセット
    #=!                   : 成功/失敗コードを返す

^UNLOCK
    X=0 Y=0
    `=0                   : ロッククリア
    #=!
```

#### 利点
- **簡潔性**: CASより簡単にロック操作を実装できる
- **効率性**: ロック専用に最適化可能
- **記号の妥当性**: `` ` `` と1文字の組み合わせという要件を満たす

## 記号選択の根拠

SYMBOL_RESOURCES.mdの状況に基づく記号選択：

| 記号 | 状態 | 選択理由 |
|------|------|----------|
| `{` `}` | 🟢 未使用 | 利用可能な波括弧ペア、CASの2引数表現に最適 |
| `` +` `` | 🟡 組み合わせ | `+`は加算だが、バッククォートとの組み合わせで「Grid上の加算」を表現 |
| `` \` `` | 🟢 未使用 | バックスラッシュは拡張コマンド候補だが優先利用 |

## 実装の優先順位

### 最優先: `{}` (CAS)

すべてのアトミック操作の基礎となる最重要プリミティブ。これだけで理論上すべての同期処理が実装可能です。

**実装すべき理由:**
1. **汎用性**: あらゆるread-modify-write操作に対応
2. **既存の提案**: SHARED_MEMORY_ATOMIC_PRIMITIVE.mdで詳細に設計済み
3. **標準的**: 多くの並行プログラミング環境で提供される標準操作

**実装例の豊富さ:**
- カウンタのインクリメント/デクリメント
- 条件付き更新（範囲チェック、閾値チェックなど）
- ロックフリーデータ構造（スタック、キューなど）
- 複雑な状態遷移の実装

### 次優先: `+`` (Fetch-And-Add)

カウンタ操作の頻度が高い場合に有用です。CASで実装可能ですが、専用命令があればコードが簡潔になります。

**実装すべき理由:**
1. **簡潔性**: カウンタ操作が1行で完結
2. **頻出パターン**: リングバッファ、参照カウント、統計情報など
3. **パフォーマンス**: リトライループを省略できる

### オプション: `\`` (Store-If-Zero)

ロック操作を頻繁に行う場合に有用です。CASで代替可能なため、優先度は低めです。

**実装すべき理由:**
1. **ロック専用最適化**: `{0,1}` のCASより直感的
2. **コードの明確性**: ロック取得の意図が明確

## 最小限の実装提案

文法追加を極力少なくする要件を考慮すると、**`{}` (CAS) のみの実装**を推奨します。

### 理由

1. **CASのみで十分**: 理論上、CASだけですべてのアトミック操作が実装可能
2. **学習コストの削減**: 覚える記号が1つだけ
3. **メンテナンスの簡素化**: 実装・テストする機能が最小限

### CASだけで実装できる操作

#### カウンタのインクリメント（`+`` の代替）
```workerscript
^INCREMENT
    X=5 Y=5
^RETRY
    O=`
    N=O+1
    A={O,N}
    ;=A=0 #=^RETRY
    #=!
```

#### ロック取得（`\`` の代替）
```workerscript
^TRY_LOCK
    X=0 Y=0
    A={0,1}               : Grid[X,Y]が0なら1をセット
    #=!                   : 成功/失敗コードを返す
```

#### アトミック最大値更新
```workerscript
^UPDATE_MAX
    X=7 Y=7
^MAX_RETRY
    O=`
    ;=V<=O #=!            : 現在値の方が大きければ何もしない
    A={O,V}               : VをセットしようとするがOのままか確認
    ;=A=0 #=^MAX_RETRY
    #=!
```

## 拡張案: より豊富な操作セット

将来的にパフォーマンスや使いやすさが重要になった場合、以下の操作を追加することを検討できます：

### `+`` (Fetch-And-Add)
頻出するカウンタ操作を簡潔に記述

### `\`` (Store-If-Zero)
ロック取得を簡潔に記述

### `&`` (Test-And-Set)
バイナリロックを簡潔に記述
```workerscript
記号: &`
構文: A=&`                    : Grid[X,Y]の現在値を読み、非ゼロなら1をセット
      戻り値: 0=ロック取得成功、非0=既にロック中
```

### `|=` (Memory Barrier)
メモリ可視性を保証
```workerscript
記号: | (単項演算子)
構文: |=0                     : 読み込みバリア
      |=1                     : 書き込みバリア
      |=2                     : 完全バリア
```

## 実装方針

### Web Worker環境での実装

SharedArrayBufferを使用したアトミック操作の実装：

```typescript
// CASの実装例（JavaScriptのAtomics API使用）
class GridAtomicOperations {
    private sharedBuffer: SharedArrayBuffer;
    private atomicView: Int32Array;
    
    constructor(width: number, height: number) {
        this.sharedBuffer = new SharedArrayBuffer(width * height * 4);
        this.atomicView = new Int32Array(this.sharedBuffer);
    }
    
    // CAS操作
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
    
    // Fetch-And-Add操作（オプション）
    fetchAndAdd(x: number, y: number, delta: number): number {
        const index = y * this.width + x;
        return Atomics.add(this.atomicView, index, delta);
    }
}
```

### パーサー・インタープリタへの組み込み

```typescript
// パーサーでの構文解析
case '{':
    // CAS操作の解析
    const expected = this.parseExpression();
    this.expectToken(',');
    const newValue = this.parseExpression();
    this.expectToken('}');
    return new CompareAndSwapExpression(expected, newValue);

// インタープリタでの実行
executeCompareAndSwap(expr: CompareAndSwapExpression): number {
    const x = this.getVariable('X');
    const y = this.getVariable('Y');
    const expected = this.evaluate(expr.expected);
    const newValue = this.evaluate(expr.newValue);
    
    const success = this.grid.compareAndSwap(x, y, expected, newValue);
    return success ? 1 : 0;
}
```

## まとめ

### 推奨される実装戦略

**段階的アプローチ:**

1. **フェーズ1（最小限）**: `{}` (CAS) のみを実装
   - 汎用性が高く、すべてのアトミック操作をカバー
   - 文法追加が最小限（記号1つだけ）
   - 学習コストとメンテナンスコストが低い

2. **フェーズ2（オプション）**: 使用頻度に応じて追加
   - カウンタ操作が頻繁 → `+`` (Fetch-And-Add) を追加
   - ロック操作が頻繁 → `\`` (Store-If-Zero) を追加
   - メモリ順序制御が必要 → `|=` (Memory Barrier) を追加

### 利点のまとめ

- ✅ **最小限の文法追加**: CASだけなら1つの記号のみ
- ✅ **完全な機能性**: CASだけですべてのアトミック操作が実装可能
- ✅ **標準的な設計**: 多くの並行プログラミング環境で実証済み
- ✅ **拡張性**: 必要に応じて他の操作を追加可能
- ✅ **記号の妥当性**: `{` `}` は未使用で利用可能
- ✅ **既存の設計**: SHARED_MEMORY_ATOMIC_PRIMITIVE.mdで詳細に検討済み

---

*参照: SHARED_MEMORY_ATOMIC_PRIMITIVE.md, SYMBOL_RESOURCES.md*  
*最終更新: 2025年1月*
