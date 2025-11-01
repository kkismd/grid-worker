# FPS and Steps Per Frame Performance Analysis

## 概要

`SPEED_PRESETS`に設定されている`stepsPerFrame`の値が、`startGlobalExecution`で設定されている1/60秒（16.67ms）以内に実行できるかを検証しました。

## SPEED_PRESETS 設定値

```typescript
const SPEED_PRESETS = [
    { name: 'Very Slow', stepsPerFrame: 1 },
    { name: 'Slow', stepsPerFrame: 10 },
    { name: 'Fast', stepsPerFrame: 1000 },
    { name: 'Very Fast', stepsPerFrame: 10000 },
    { name: 'Maximum', stepsPerFrame: 100000 },
];
```

## 実行環境

- **フレームレート**: 60 FPS (16.67ms/frame)
- **実行モデル**: `setInterval(() => { executeGlobalStep(); }, 1000 / 60)`
- **測定対象**: WorkerScriptインタプリタの実行ステップ数

## ベンチマーク結果

### 総合評価

| Preset | stepsPerFrame | 平均実行時間 | 60 FPS内に収まるか |
|--------|---------------|-------------|------------------|
| **Very Slow** | 1 | 0.08ms | ✓ **完全に実行可能** |
| **Slow** | 10 | 0.44ms | ✓ **完全に実行可能** |
| **Fast** | 1,000 | 2.09ms | ✓ **完全に実行可能** |
| **Very Fast** | 10,000 | 18.41ms | ⚠️ **条件付きで可能** |
| **Maximum** | 100,000 | 123.06ms | ✗ **実行不可能** |

### スクリプト複雑度別の詳細結果

#### 1. Very Slow (1 steps/frame) - ✓ 推奨
- **実行時間**: 平均 0.08ms
- **評価**: すべてのスクリプトタイプで安全に動作
- **フレーム余裕**: +99.5%

#### 2. Slow (10 steps/frame) - ✓ 推奨
- **実行時間**: 平均 0.44ms
- **評価**: すべてのスクリプトタイプで安全に動作
- **フレーム余裕**: +97.4%

#### 3. Fast (1000 steps/frame) - ✓ 推奨（デフォルト設定）
- **実行時間**: 平均 2.09ms
- **評価**: すべてのスクリプトタイプで安全に動作
- **フレーム余裕**: +87.5%
- **備考**: 現在のデフォルト設定として最適

各スクリプトタイプでの実行時間：
- Simple (変数のみ): 6.87ms (+58.8% 余裕)
- Arithmetic (四則演算): 0.97ms (+94.2% 余裕)
- Conditionals (条件分岐): 1.58ms (+90.5% 余裕)
- Grid Read (PEEK): 1.00ms (+94.0% 余裕)
- Grid Write (POKE): 1.54ms (+90.8% 余裕)
- Arrays (配列操作): 1.60ms (+90.4% 余裕)
- Mixed (複合処理): 1.05ms (+93.7% 余裕)

#### 4. Very Fast (10000 steps/frame) - ⚠️ 条件付き
- **実行時間**: 平均 18.41ms
- **評価**: 単純なスクリプトのみで動作可能
- **フレーム不足**: -10.4% (16.67msを超過)

実行可能なスクリプトタイプ：
- ✓ Arithmetic (四則演算): 13.47ms (+19.2% 余裕)
- ✓ Grid Write (POKE): 16.05ms (+3.7% 余裕)
- ✓ Mixed (複合処理): 7.53ms (+54.8% 余裕)

実行不可能なスクリプトタイプ：
- ✗ Simple (変数のみ): 34.10ms (-104.6%)
- ✗ Conditionals (条件分岐): 21.35ms (-28.1%)
- ✗ Grid Read (PEEK): 16.72ms (-0.3%)
- ✗ Arrays (配列操作): 19.64ms (-17.8%)

#### 5. Maximum (100000 steps/frame) - ✗ 非推奨
- **実行時間**: 平均 123.06ms
- **評価**: 60 FPSを大幅に超過し、実用不可能
- **フレーム不足**: -638.1% (約7フレーム分の時間が必要)

## 推奨設定

### スクリプト複雑度別の安全な最大 stepsPerFrame

| スクリプトタイプ | 推奨最大値 (80%安全マージン) |
|-----------------|----------------------------|
| Simple (変数のみ) | ~1,942 steps/frame |
| Arithmetic (四則演算) | ~13,775 steps/frame |
| Conditionals (条件分岐) | ~8,446 steps/frame |
| Grid Read (PEEK) | ~13,315 steps/frame |
| Grid Write (POKE) | ~8,686 steps/frame |
| Arrays (配列操作) | ~8,341 steps/frame |
| Mixed (複合処理) | ~12,699 steps/frame |

### プリセット使用ガイドライン

1. **Very Slow (1)**: デバッグ・ステップ実行向け
2. **Slow (10)**: 初期学習・動作確認向け
3. **Fast (1000)**: 通常使用の推奨設定 ⭐
4. **Very Fast (10000)**: 高性能スクリプト専用（注意が必要）
5. **Maximum (100000)**: 使用非推奨

## 技術的所見

### パフォーマンス特性

1. **実行速度**: 平均 223 steps/ms (環境により変動)
2. **安全な最大値**: 約 3,700 steps/frame (80%マージン込み)
3. **ボトルネック**: 
   - 変数のみの単純ループは最も低速（インタプリタオーバーヘッド）
   - 四則演算や複合処理は比較的高速
   - 配列操作とグリッド操作は中程度の負荷

### フレームバジェット分析

60 FPSを維持するには：
- **16.67ms以内**: フレーム描画とスクリプト実行を完了する必要がある
- **推奨マージン**: 20-30%の余裕を持たせる（他の処理のため）
- **実測値**: Fast (1000) プリセットで平均87.5%の余裕を確保

## 結論

### 見積もり結果

| Preset | 見込み評価 |
|--------|----------|
| Very Slow (1) | ✓ 100% 実行可能 |
| Slow (10) | ✓ 100% 実行可能 |
| **Fast (1000)** | ✓ **100% 実行可能（推奨）** |
| Very Fast (10000) | ⚠️ 40-60% 実行可能（条件付き） |
| Maximum (100000) | ✗ 0% 実行可能 |

### 推奨事項

1. **現在の設定は適切**: `Fast (1000)` をデフォルトとするのは妥当
2. **Very Fast は警告が必要**: UIに「高負荷スクリプトでは動作が不安定になる可能性」を表示
3. **Maximum は再検討**: 
   - 60 FPSでの実行は不可能
   - 目的が「最大速度」であれば、フレームレートの変更も検討すべき（例: 10 FPS = 166ms/frame）
   - または stepsPerFrame を 5000-8000 程度に調整

### 改善案

```typescript
const SPEED_PRESETS = [
    { name: 'Very Slow', stepsPerFrame: 1 },
    { name: 'Slow', stepsPerFrame: 10 },
    { name: 'Normal', stepsPerFrame: 500 },      // 追加: より控えめな設定
    { name: 'Fast', stepsPerFrame: 1000 },       // デフォルト
    { name: 'Very Fast', stepsPerFrame: 5000 },  // 調整: 10000→5000
    { name: 'Turbo', stepsPerFrame: 8000 },      // 追加: 実用的な高速設定
    // { name: 'Maximum', stepsPerFrame: 100000 }, // 削除または別モード
];
```

## 測定方法

ベンチマークスクリプト `benchmark-detailed.ts` を使用：
- 7種類のスクリプトタイプで測定
- 各プリセットで実際に実行し、経過時間を計測
- 16.67ms のフレーム予算との比較

実行コマンド：
```bash
npx tsx benchmark-detailed.ts
```
