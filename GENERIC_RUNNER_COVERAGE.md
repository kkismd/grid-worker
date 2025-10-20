# 汎用ランナー構想のカバレッジ分析

**分析日**: 2025年10月20日  
**対象**: 現在のCLI実装が汎用ランナー構想をどの程度カバーできているか

## 📊 総合評価

**カバレッジ**: 約 **75%** 🟢  
**結論**: 現在のCLI実装に適切なオプションを追加することで、**新しいScriptRunnerを実装せずに汎用ランナー機能を実現可能**

---

## 🎯 汎用ランナーの要件とカバレッジ

### 1. コア機能

| 要件 | 現在の実装 | カバレッジ | 備考 |
|------|-----------|-----------|------|
| **スクリプト実行** | ✅ `CLIRunner.executeScript()` | 100% | 完全実装済み |
| **POKE/PEEK処理** | ✅ Grid配列で実装 | 100% | ダミーメモリとして利用可能 |
| **テキスト出力** | ✅ `log()` | 100% | 改行制御も正確 |
| **デバッグモード** | ✅ `--debug` | 100% | 完全実装済み |
| **詳細ログ** | ✅ `--verbose` | 100% | 完全実装済み |
| **静寂モード** | ✅ `--quiet` | 100% | Grid表示以外を抑制可能 |

### 2. 実行制御

| 要件 | 現在の実装 | カバレッジ | 備考 |
|------|-----------|-----------|------|
| **ステップ制限** | ✅ `--max-steps` | 100% | 完全実装済み |
| **無制限実行** | ✅ `--unlimited` | 100% | 完全実装済み |
| **進捗表示制御** | ✅ `--quiet` | 100% | 進捗非表示可能 |
| **エラーハンドリング** | ✅ try-catch | 100% | 完全実装済み |

### 3. 入出力

| 要件 | 現在の実装 | カバレッジ | 備考 |
|------|-----------|-----------|------|
| **文字列出力** | ✅ `?="text"` | 100% | log()で実装 |
| **数値出力** | ✅ `?=A` | 100% | log()で実装 |
| **改行出力** | ✅ `/` | 100% | log()で実装 |
| **1文字出力** | ✅ `$='x'` | 100% | put1Byte()で実装 |
| **数値入力** | ⚠️ `A=?` | 0% | get1Byte()は固定値42を返す |
| **1文字入力** | ⚠️ `A=$` | 0% | リアルタイムモード専用 |

### 4. Grid機能の制御

| 要件 | 現在の実装 | カバレッジ | 対応方法 |
|------|-----------|-----------|---------|
| **Grid表示の抑制** | ❌ 常に表示 | 0% | `--no-grid`オプション追加が必要 |
| **POKE動作（ダミー）** | ✅ 既存のPOKE | 100% | 現在の実装をそのまま利用可能 |
| **PEEK動作（ダミー）** | ✅ 既存のPEEK | 100% | 現在の実装をそのまま利用可能 |
| **Grid初期化** | ✅ コンストラクタ | 100% | 10000要素配列で実装済み |

### 5. ファイル出力

| 要件 | 現在の実装 | カバレッジ | 備考 |
|------|-----------|-----------|------|
| **結果ファイル保存** | ✅ `--output` | 100% | JSON形式で保存 |
| **トランスクリプト保存** | ✅ transcript配列 | 100% | 完全実装済み |
| **Grid状態保存** | ✅ grid配列 | 100% | 完全実装済み |

### 6. 汎用版専用機能（計画）

| 要件 | 現在の実装 | カバレッジ | 実装難易度 |
|------|-----------|-----------|----------|
| **メモリダンプ** | ❌ 未実装 | 0% | 🟢 容易（Grid配列を表示するだけ） |
| **NodeJS機能拡張** | ❌ 未実装 | 0% | 🟡 中程度（将来の拡張ポイント） |
| **汎用版CLI** | ❌ 未実装 | 0% | 🟢 容易（既存CLIを再利用） |

---

## 🔧 汎用ランナー実現のための最小限の変更

### 方式1: オプション追加方式（推奨） ⭐

既存の`CLIRunner`に以下のオプションを追加するだけで汎用ランナーを実現可能：

```typescript
export interface CLIRunnerConfig {
    debug: boolean;
    verbose: boolean;
    outputFile?: string;
    unlimitedSteps?: boolean;
    maxSteps?: number;
    quiet?: boolean;
    
    // 🆕 汎用ランナー用オプション
    noGrid?: boolean;          // Grid表示を完全に抑制
    memoryDump?: boolean;      // 実行後にメモリダンプ表示
    suppressPoke?: boolean;    // POKE操作時のログを抑制
}
```

#### 実装箇所の変更

**1. `displayResults()`の修正**:
```typescript
private displayResults(): void {
    // Grid表示を条件付きに
    if (!this.config.noGrid) {
        this.displayGrid();
    }
    
    // メモリダンプ表示（オプション）
    if (this.config.memoryDump) {
        this.displayMemoryDump();
    }
    
    // 出力ファイルに保存
    if (this.config.outputFile) {
        this.saveToFile();
    }
}
```

**2. `poke()`の修正**:
```typescript
private poke(x: number, y: number, value: number): void {
    const wrappedX = ((x % 100) + 100) % 100;
    const wrappedY = ((y % 100) + 100) % 100;
    const index = wrappedY * 100 + wrappedX;
    const clampedValue = Math.max(0, Math.min(255, Math.floor(value)));
    this.gridData[index] = clampedValue;
    
    // デバッグ出力を条件付きに
    if (this.config.debug && !this.config.suppressPoke) {
        console.log(`[POKE] (${x},${y}) -> [${index}] = ${clampedValue}`);
    }
}
```

**3. `displayMemoryDump()`の追加**:
```typescript
private displayMemoryDump(): void {
    console.log('\n💾 メモリダンプ:');
    
    // 非ゼロ要素のみ表示
    const nonZero: Array<{index: number, value: number}> = [];
    for (let i = 0; i < this.gridData.length; i++) {
        if (this.gridData[i] !== 0) {
            nonZero.push({ index: i, value: this.gridData[i] });
        }
    }
    
    if (nonZero.length === 0) {
        console.log('  （すべて0）');
        return;
    }
    
    console.log(`  非ゼロ要素: ${nonZero.length}個`);
    for (const {index, value} of nonZero.slice(0, 20)) {
        const x = index % 100;
        const y = Math.floor(index / 100);
        console.log(`  [${index}] (${x},${y}) = ${value}`);
    }
    
    if (nonZero.length > 20) {
        console.log(`  ... 他${nonZero.length - 20}個`);
    }
}
```

#### CLIコマンドの追加

**package.json**:
```json
{
  "scripts": {
    "cli": "tsx src/cli.ts",
    "script": "tsx src/cli.ts --no-grid --quiet"  // 汎用版エイリアス
  }
}
```

#### 使用例

```bash
# 汎用ランナーとして実行（Grid表示なし）
npm run cli -- script.ws --no-grid --quiet

# または短縮コマンド
npm run script -- script.ws

# メモリダンプ表示
npm run script -- script.ws --memory-dump

# デバッグ情報も含む
npm run script -- script.ws --debug --verbose --memory-dump
```

**実装難易度**: 🟢 **容易**（1-2時間）  
**影響範囲**: 🟢 **最小限**（既存機能に影響なし）  
**互換性**: ✅ **完全互換**（既存の動作を変更しない）

---

### 方式2: 新規ScriptRunnerクラス作成

計画書通りに`ScriptRunner`クラスを新規作成する方式。

**メリット**:
- 責任分離が明確
- 将来の拡張が容易
- テストが独立

**デメリット**:
- コード重複が発生
- メンテナンスコストが増加
- 実装時間がかかる（3-5日）

**結論**: 現時点では**不要**（方式1で十分）

---

## 📈 機能別カバレッジ詳細

### ✅ 完全カバー（100%）: 11項目

1. スクリプト実行
2. POKE/PEEK処理（ダミーメモリとして）
3. テキスト出力（文字列、数値、改行、1文字）
4. デバッグモード
5. 詳細ログ
6. 静寂モード
7. ステップ制限・無制限実行
8. 進捗表示制御
9. エラーハンドリング
10. ファイル出力
11. トランスクリプト保存

### ⚠️ 部分カバー（50%以下）: 2項目

1. **Grid表示制御** (0%)
   - 現状: 常に表示される
   - 必要: `--no-grid`オプション
   - 実装難易度: 🟢 容易

2. **メモリダンプ** (0%)
   - 現状: 機能なし
   - 必要: `--memory-dump`オプション
   - 実装難易度: 🟢 容易

### ❌ 未カバー（0%）: 2項目

1. **標準入力からの数値入力** (`A=?`)
   - 現状: 固定値42を返す
   - 必要: readline対応
   - 実装難易度: 🟡 中程度（非同期処理が必要）

2. **ノンブロッキング1文字入力** (`A=$`)
   - 現状: リアルタイムモード専用
   - 必要: KeyboardInput統合
   - 実装難易度: 🟡 中程度（既存コードを再利用可能）

---

## 🎯 推奨実装プラン

### Phase 1: 最小限の汎用ランナー（1-2時間） 🟢

**目標**: Grid表示を抑制した「テキスト出力専用」モードを実現

**実装内容**:
1. `CLIRunnerConfig`に`noGrid`オプション追加
2. `displayResults()`を修正（Grid表示を条件付きに）
3. `package.json`に`script`コマンド追加
4. ドキュメント更新

**成果**:
```bash
# これで汎用ランナーとして動作
npm run script -- mandelbrot.ws
# 出力: テキストのみ、Grid表示なし
```

### Phase 2: メモリダンプ機能（1時間） 🟢

**実装内容**:
1. `memoryDump`オプション追加
2. `displayMemoryDump()`メソッド実装
3. ドキュメント更新

**成果**:
```bash
npm run script -- test.ws --memory-dump
# 実行後にメモリの状態を表示
```

### Phase 3: 標準入力対応（3-4時間） 🟡

**実装内容**:
1. `get1Byte()`を非同期化
2. readline統合
3. プロンプト表示の改善

**成果**:
```bash
npm run script -- interactive-calc.ws
# 数値入力 A=? が標準入力から読み取り可能
```

### Phase 4: 完全な汎用ランナー（オプション） 🔵

**実装内容**:
1. BaseRunner抽象クラス作成
2. GridRunnerとScriptRunnerに分離
3. `runners/`ディレクトリ構造への移行

**成果**: 計画書通りのアーキテクチャ実現

**必要性**: 🟡 **低**（Phase 1-3で十分な機能を実現可能）

---

## 💡 結論と推奨事項

### 主要な発見

1. **現在の実装は汎用ランナーの75%をカバー済み** 🎉
   - POKE/PEEK処理は既にダミーメモリとして機能
   - テキスト出力は完全に動作
   - 実行制御は完璧

2. **最小限の変更（1-2時間）で実用的な汎用ランナーを実現可能** ⚡
   - `--no-grid`オプション追加
   - `--quiet`との組み合わせでテキスト出力専用モード実現

3. **新しいScriptRunnerクラスは現時点で不要** 🚫
   - コード重複を避ける
   - 既存の実装を再利用する方が効率的

### 推奨アクション

#### 即座に実装すべき（HIGH）:
- ✅ `--no-grid`オプション追加（実装時間: 30分）
- ✅ `npm run script`エイリアス追加（実装時間: 5分）

#### 近い将来に実装すべき（MEDIUM）:
- 🔶 `--memory-dump`オプション追加（実装時間: 1時間）
- 🔶 標準入力対応（実装時間: 3-4時間）

#### 将来的に検討すべき（LOW）:
- 🔵 BaseRunner抽象クラス作成（必要になった時点で）
- 🔵 `runners/`ディレクトリ構造への移行（必要になった時点で）

### 実装優先度

```
Phase 1 (最小限の汎用ランナー) >>> Phase 2 (メモリダンプ) > Phase 3 (標準入力) >> Phase 4 (完全分離)
```

**最も効率的なアプローチ**: Phase 1のみ実装し、必要に応じてPhase 2-3を追加する。Phase 4は当面不要。
